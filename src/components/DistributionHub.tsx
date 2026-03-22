// ─── Distribution Hub ──────────────────────────────────────────────────────
// Full-screen modal: placement checklist, caption preview, ad-set integration,
// parallel publishing with live step tracker, and history persistence.

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Share2, Instagram, Facebook, CheckCircle2, XCircle,
  AlertTriangle, Loader2, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import { generateCaption } from '../lib/captionGenerator';
import type { CaptionResult } from '../lib/captionGenerator';
import {
  publishToInstagram, publishToFacebook, publishToTikTok,
  getMetaCredentials, validateMetaToken,
} from '../lib/socialPublisher';
import {
  fetchActiveAdSets, uploadAdImage, createAdCreativeFromImage,
  addCreativeToAdSet, replaceAdCreative, fetchAdSetAds,
} from '../lib/metaAds';
import type { AdSet } from '../lib/metaAds';
import { saveRecord } from '../lib/distributionHistory';
import type { PlacementResult, AdIntegrationResult } from '../lib/distributionHistory';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DistributionHubProps {
  mediaUrl:   string;
  mediaType:  'image' | 'video';
  prompt:     string;
  format:     string;           // '1:1' | '4:5' | '9:16' | '16:9'
  onClose:    () => void;
}

interface Placement {
  id:       string;
  platform: 'instagram' | 'facebook' | 'tiktok';
  label:    string;
  icon:     React.ReactNode;
  aspect:   string;
  videoNote?: string;           // extra requirement for video placements
}

type StepState = 'pending' | 'running' | 'done' | 'error' | 'skipped';

interface Step {
  id:      string;
  label:   string;
  state:   StepState;
  detail?: string;
}

// ─── Placement definitions ────────────────────────────────────────────────────

const PLACEMENTS: Placement[] = [
  { id: 'ig_story',  platform: 'instagram', label: 'Instagram Story',  icon: <Instagram size={15}/>, aspect: '9:16', videoNote: 'max 60s' },
  { id: 'ig_reels',  platform: 'instagram', label: 'Instagram Reels',  icon: <Instagram size={15}/>, aspect: '9:16', videoNote: 'max 90s' },
  { id: 'ig_feed',   platform: 'instagram', label: 'Instagram Feed',   icon: <Instagram size={15}/>, aspect: '1:1' },
  { id: 'fb_feed',   platform: 'facebook',  label: 'Facebook Feed',    icon: <Facebook  size={15}/>, aspect: '1:1' },
  { id: 'fb_reels',  platform: 'facebook',  label: 'Facebook Reels',   icon: <Facebook  size={15}/>, aspect: '9:16', videoNote: 'max 90s' },
  { id: 'fb_story',  platform: 'facebook',  label: 'Facebook Story',   icon: <Facebook  size={15}/>, aspect: '9:16', videoNote: 'max 60s' },
];

function aspectWarning(assetFormat: string, required: string, isVideo: boolean, videoNote?: string): string | null {
  const formatMismatch = assetFormat !== required ? `Asset is ${assetFormat}, placement expects ${required}` : null;
  const videoWarn      = isVideo && videoNote ? `Video: ${videoNote}` : null;
  const parts = [formatMismatch, videoWarn].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DistributionHub({ mediaUrl, mediaType, prompt, format, onClose }: DistributionHubProps) {
  const [selected, setSelected]               = useState<Set<string>>(new Set(['ig_feed']));
  const [captions, setCaptions]               = useState<Record<string, CaptionResult>>({});
  const [captionLoading, setCaptionLoading]   = useState(false);
  const [adSets, setAdSets]                   = useState<AdSet[]>([]);
  const [adSetsLoading, setAdSetsLoading]     = useState(false);
  const [adSetsError, setAdSetsError]         = useState<string | null>(null);
  const [adsOpen, setAdsOpen]                 = useState(false);
  const [tokenError, setTokenError]           = useState<string | null>(null);

  interface AdAction { adSetId: string; action: 'add' | 'replace' }
  const [adActions, setAdActions]   = useState<AdAction[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [steps, setSteps]           = useState<Step[]>([]);
  const [done, setDone]             = useState(false);
  const [results, setResults]       = useState<{ placements: PlacementResult[]; ads: AdIntegrationResult[] } | null>(null);

  const creds  = getMetaCredentials();
  const hasMeta = !!(creds.accessToken && creds.instagramAccountId);
  const hasAds  = !!(creds.accessToken && creds.adAccountId);

  // ── Validate token on mount ───────────────────────────────────────────────

  useEffect(() => {
    if (!creds.accessToken) return;
    validateMetaToken(creds.accessToken).then(err => setTokenError(err));
  }, []);

  // ── Load captions for selected platforms ──────────────────────────────────

  useEffect(() => {
    const platforms = new Set(
      PLACEMENTS.filter(p => selected.has(p.id)).map(p => p.platform)
    );
    platforms.forEach(async platform => {
      if (captions[platform]) return;
      setCaptionLoading(true);
      try {
        const result = await generateCaption(prompt, platform as 'instagram' | 'facebook' | 'tiktok');
        setCaptions(prev => ({ ...prev, [platform]: result }));
      } catch { /* ignore */ }
      finally { setCaptionLoading(false); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // ── Load ad sets ──────────────────────────────────────────────────────────

  const loadAdSets = useCallback(async () => {
    if (!hasAds || adSets.length) return;
    setAdSetsLoading(true);
    setAdSetsError(null);
    try {
      const list = await fetchActiveAdSets(creds.adAccountId!, creds.accessToken);
      setAdSets(list);
    } catch (e) {
      setAdSetsError((e as Error).message);
    } finally {
      setAdSetsLoading(false);
    }
  }, [hasAds, adSets.length, creds]);

  const toggleAds = () => {
    if (!adsOpen) loadAdSets();
    setAdsOpen(v => !v);
  };

  // ── Step helpers ──────────────────────────────────────────────────────────

  function initSteps(placementIds: string[], adActionList: AdAction[]): Step[] {
    const s: Step[] = [];
    s.push({ id: 'preflight', label: 'Pre-flight check', state: 'pending' });
    placementIds.forEach(id => {
      const p = PLACEMENTS.find(x => x.id === id)!;
      s.push({ id: `place_${id}`, label: `Publish → ${p.label}`, state: 'pending' });
    });
    adActionList.forEach(a => {
      const as = adSets.find(x => x.id === a.adSetId);
      s.push({
        id:    `ad_${a.adSetId}`,
        label: `${a.action === 'add' ? '+ Add creative to' : '↺ Replace creative in'} "${as?.name ?? a.adSetId}"`,
        state: 'pending',
      });
    });
    s.push({ id: 'save', label: 'Save to portfolio', state: 'pending' });
    return s;
  }

  function setStep(id: string, state: StepState, detail?: string) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, state, detail } : s));
  }

  // ── Publish ───────────────────────────────────────────────────────────────

  async function publish() {
    const placementIds = Array.from(selected);
    const stepList = initSteps(placementIds, adActions);
    setSteps(stepList);
    setPublishing(true);

    const placementResults: PlacementResult[] = [];
    const adResults: AdIntegrationResult[]    = [];

    // ── Preflight ──
    setStep('preflight', 'running');
    await new Promise(r => setTimeout(r, 300));

    const preflightIssues: string[] = [];

    // Token check
    if (creds.accessToken) {
      const tokenErr = await validateMetaToken(creds.accessToken);
      if (tokenErr) preflightIssues.push(tokenErr);
    } else {
      preflightIssues.push('No Meta access token configured');
    }

    // Aspect ratio warnings
    placementIds.forEach(id => {
      const p = PLACEMENTS.find(x => x.id === id)!;
      const w = aspectWarning(format, p.aspect, mediaType === 'video', p.videoNote);
      if (w) preflightIssues.push(`${p.label}: ${w}`);
    });

    // Ad account check
    if (adActions.length > 0 && !creds.adAccountId) {
      preflightIssues.push('VITE_META_AD_ACCOUNT_ID not set — ad integration will be skipped');
    }
    if (adActions.length > 0 && !creds.facebookPageId) {
      preflightIssues.push('VITE_META_FACEBOOK_PAGE_ID not set — ad creatives require a page');
    }

    const hasBlocker = preflightIssues.some(i => i.includes('token') || i.includes('expired'));
    setStep('preflight',
      hasBlocker ? 'error' : preflightIssues.length ? 'done' : 'done',
      preflightIssues.length ? preflightIssues.join(' · ') : 'All checks passed'
    );

    if (hasBlocker) {
      setPublishing(false);
      setDone(true);
      setResults({ placements: [], ads: [] });
      return;
    }

    // ── Placement publishing (parallel — each failure is isolated) ──
    await Promise.all(
      placementIds.map(async placementId => {
        const placement = PLACEMENTS.find(p => p.id === placementId)!;
        const caption   = captions[placement.platform]?.full ?? prompt;
        setStep(`place_${placementId}`, 'running');
        try {
          let postId:  string | undefined;
          let postUrl: string | undefined;
          let error:   string | undefined;
          let success  = false;

          if (placement.platform === 'instagram' && hasMeta) {
            const r = await publishToInstagram(mediaUrl, caption, creds, mediaType);
            success = r.success; postId = r.postId; error = r.error;
            if (r.postId) postUrl = `https://www.instagram.com/p/${r.postId}/`;
          } else if (placement.platform === 'facebook' && hasMeta) {
            const r = await publishToFacebook(mediaUrl, caption, creds, mediaType);
            success = r.success; postId = r.postId; error = r.error;
            if (r.postId) postUrl = `https://www.facebook.com/${r.postId}`;
          } else if (placement.platform === 'tiktok') {
            const tok = import.meta.env.VITE_TIKTOK_ACCESS_TOKEN ?? '';
            const r   = await publishToTikTok(mediaUrl, caption, tok);
            success = r.success; postId = r.postId; error = r.error;
          } else {
            error = `Credentials not configured — add VITE_META_ACCESS_TOKEN + VITE_META_INSTAGRAM_ACCOUNT_ID`;
          }

          setStep(`place_${placementId}`, success ? 'done' : 'error',
            success ? (postUrl ?? `Post ID: ${postId}`) : error);
          placementResults.push({ placementId, platform: placement.platform, label: placement.label, success, postId, postUrl, error });
        } catch (e) {
          const msg = (e as Error).message;
          setStep(`place_${placementId}`, 'error', msg);
          placementResults.push({ placementId, platform: placement.platform, label: placement.label, success: false, error: msg });
        }
      })
    );

    // ── Ad-set integrations (sequential — share the uploaded image hash) ──
    let imageHash: string | undefined;

    for (const adAction of adActions) {
      setStep(`ad_${adAction.adSetId}`, 'running');
      const adSet = adSets.find(x => x.id === adAction.adSetId);
      try {
        if (!creds.adAccountId) throw new Error('VITE_META_AD_ACCOUNT_ID not set');
        if (!creds.facebookPageId) throw new Error('VITE_META_FACEBOOK_PAGE_ID required for ad creatives');
        if (mediaType === 'video') throw new Error('Video ad creatives must be set up via Meta Ads Manager (API video flow not supported here)');

        // Upload image once; reuse hash for subsequent ad sets
        if (!imageHash) {
          imageHash = await uploadAdImage(creds.adAccountId, creds.accessToken, mediaUrl);
        }

        const caption    = captions['facebook']?.full ?? captions['instagram']?.full ?? prompt;
        const creativeId = await createAdCreativeFromImage(
          creds.adAccountId, creds.accessToken, imageHash, caption, creds.facebookPageId
        );

        let adId: string | undefined;
        if (adAction.action === 'add') {
          adId = await addCreativeToAdSet(creds.adAccountId, creds.accessToken, adAction.adSetId, creativeId);
        } else {
          const ads = await fetchAdSetAds(adAction.adSetId, creds.accessToken);
          if (!ads[0]) throw new Error('No existing ads found in this ad set to replace');
          await replaceAdCreative(ads[0].id, creds.accessToken, creativeId);
          adId = ads[0].id;
        }

        setStep(`ad_${adAction.adSetId}`, 'done', `Creative ${creativeId}${adId ? ` · Ad ${adId}` : ''}`);
        adResults.push({
          adSetId:  adAction.adSetId,
          adSetName: adSet?.name ?? adAction.adSetId,
          action:   adAction.action,
          success:  true,
          creativeId,
          adId,
        });
      } catch (e) {
        const msg = (e as Error).message;
        setStep(`ad_${adAction.adSetId}`, 'error', msg);
        adResults.push({
          adSetId:   adAction.adSetId,
          adSetName: adSet?.name ?? adAction.adSetId,
          action:    adAction.action,
          success:   false,
          error:     msg,
        });
      }
    }

    // ── Save to history ──
    setStep('save', 'running');
    saveRecord({
      id:             crypto.randomUUID(),
      mediaUrl,
      mediaType,
      prompt,
      format,
      publishedAt:    new Date().toISOString(),
      placements:     placementResults,
      adIntegrations: adResults,
    });
    setStep('save', 'done', `${placementResults.filter(p => p.success).length} placements · ${adResults.filter(a => a.success).length} ads saved`);

    setResults({ placements: placementResults, ads: adResults });
    setPublishing(false);
    setDone(true);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: '#0a1628', border: '1px solid #1a2d4a',
        borderRadius: 20, width: '100%', maxWidth: 780,
        maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1px solid #1a2d4a',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Share2 size={20} color="#fff"/>
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Distribution Hub</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>Select placements and push your asset live</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
            <X size={20}/>
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Token error banner */}
          {tokenError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#f59e0b10', border: '1px solid #f59e0b40',
              borderRadius: 10, padding: '12px 16px',
            }}>
              <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0 }}/>
              <div style={{ color: '#f59e0b', fontSize: 13 }}>
                <strong>Meta token issue:</strong> {tokenError}
              </div>
            </div>
          )}

          {/* Asset preview strip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            background: '#0d1f35', borderRadius: 12, padding: '12px 16px',
            border: '1px solid #1a2d4a',
          }}>
            <img
              src={mediaUrl} alt="asset"
              style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>
                {mediaType.toUpperCase()} · {format}
              </div>
              <div style={{ color: '#cbd5e1', fontSize: 13, maxWidth: 560,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {prompt}
              </div>
            </div>
          </div>

          {/* ── Placement checklist ── */}
          {!done && (
            <>
              <section>
                <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 12, letterSpacing: 1 }}>
                  PLACEMENTS
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {PLACEMENTS.map(p => {
                    const checked = selected.has(p.id);
                    const warn    = aspectWarning(format, p.aspect, mediaType === 'video', p.videoNote);
                    return (
                      <button
                        key={p.id}
                        disabled={publishing}
                        onClick={() => setSelected(prev => {
                          const s = new Set(prev);
                          checked ? s.delete(p.id) : s.add(p.id);
                          return s;
                        })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: checked ? '#1a2d4a' : '#0d1f35',
                          border: `1px solid ${checked ? '#a78bfa' : '#1a2d4a'}`,
                          borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
                          transition: 'all .15s', textAlign: 'left',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: 4,
                          border: `2px solid ${checked ? '#a78bfa' : '#334155'}`,
                          background: checked ? '#a78bfa' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {checked && <CheckCircle2 size={12} color="#fff"/>}
                        </div>
                        <span style={{ color: p.platform === 'instagram' ? '#e879f9' : '#60a5fa', marginRight: 2 }}>
                          {p.icon}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: '#e2e8f0', fontSize: 13 }}>{p.label}</div>
                          <div style={{ color: warn ? '#f59e0b' : '#475569', fontSize: 11 }}>
                            {warn ? `⚠ ${warn}` : p.aspect}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ── Caption preview ── */}
              {selected.size > 0 && (
                <section>
                  <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 12, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                    CAPTIONS
                    {captionLoading && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }}/>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(['instagram', 'facebook', 'tiktok'] as const)
                      .filter(platform => Array.from(selected).some(id => PLACEMENTS.find(p => p.id === id)?.platform === platform))
                      .map(platform => {
                        const c = captions[platform];
                        return (
                          <div key={platform} style={{
                            background: '#0d1f35', borderRadius: 10,
                            border: '1px solid #1a2d4a', padding: '12px 14px',
                          }}>
                            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>
                              {platform}
                            </div>
                            {c ? (
                              <div style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                {c.full}
                              </div>
                            ) : (
                              <div style={{ color: '#475569', fontSize: 13 }}>Generating caption…</div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </section>
              )}

              {/* ── Paid Integration ── */}
              <section>
                <button
                  onClick={toggleAds}
                  disabled={publishing}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#0d1f35', border: '1px solid #1a2d4a', borderRadius: 10,
                    padding: '12px 16px', cursor: 'pointer', color: '#94a3b8',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Zap size={16} color="#f59e0b"/>
                    <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>Push to Active Ads</span>
                    {!hasAds && (
                      <span style={{ color: '#f59e0b', fontSize: 11 }}>
                        — set VITE_META_AD_ACCOUNT_ID to enable
                      </span>
                    )}
                  </div>
                  {adsOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                </button>

                {adsOpen && (
                  <div style={{
                    background: '#0d1f35', border: '1px solid #1a2d4a', borderTop: 'none',
                    borderRadius: '0 0 10px 10px', padding: 14,
                  }}>
                    {!hasAds && (
                      <div style={{ color: '#64748b', fontSize: 13 }}>
                        Add <code style={{ color: '#a78bfa' }}>VITE_META_AD_ACCOUNT_ID</code> and <code style={{ color: '#a78bfa' }}>VITE_META_FACEBOOK_PAGE_ID</code> to your .env.local to use this feature.
                      </div>
                    )}
                    {hasAds && adSetsLoading && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 13 }}>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/> Fetching active ad sets…
                      </div>
                    )}
                    {hasAds && adSetsError && (
                      <div style={{ color: '#f87171', fontSize: 13 }}>
                        <strong>Error:</strong> {adSetsError}
                      </div>
                    )}
                    {hasAds && !adSetsLoading && !adSetsError && adSets.length === 0 && (
                      <div style={{ color: '#475569', fontSize: 13 }}>No active ad sets found in this ad account.</div>
                    )}
                    {adSets.map(as => {
                      const existing = adActions.find(a => a.adSetId === as.id);
                      return (
                        <div key={as.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 0', borderBottom: '1px solid #1a2d4a',
                        }}>
                          <div style={{ flex: 1, color: '#cbd5e1', fontSize: 13 }}>{as.name}</div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {(['add', 'replace'] as const).map(act => {
                              const active = existing?.action === act;
                              return (
                                <button
                                  key={act}
                                  disabled={publishing}
                                  onClick={() => setAdActions(prev => {
                                    const filtered = prev.filter(a => a.adSetId !== as.id);
                                    return active ? filtered : [...filtered, { adSetId: as.id, action: act }];
                                  })}
                                  style={{
                                    padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                                    border: `1px solid ${active ? '#a78bfa' : '#334155'}`,
                                    background: active ? '#1a1040' : 'transparent',
                                    color: active ? '#a78bfa' : '#64748b',
                                  }}
                                >
                                  {act === 'add' ? '+ Add' : '↺ Replace'}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* ── Publish button ── */}
              <button
                disabled={publishing || selected.size === 0}
                onClick={publish}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 12,
                  background: selected.size === 0 ? '#1a2d4a' : 'linear-gradient(135deg, #a78bfa, #7c3aed)',
                  color: selected.size === 0 ? '#475569' : '#fff',
                  fontWeight: 700, fontSize: 15, border: 'none',
                  cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                }}
              >
                {publishing ? (
                  <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }}/> Publishing…</>
                ) : (
                  <>
                    <Share2 size={18}/>
                    Publish {selected.size} placement{selected.size !== 1 ? 's' : ''}
                    {adActions.length ? ` + ${adActions.length} ad${adActions.length !== 1 ? 's' : ''}` : ''}
                  </>
                )}
              </button>
            </>
          )}

          {/* ── Live step tracker ── */}
          {(publishing || done) && steps.length > 0 && (
            <section>
              <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 12, letterSpacing: 1 }}>
                {done ? 'COMPLETE' : 'PUBLISHING…'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {steps.map(step => (
                  <div key={step.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: '#0d1f35', borderRadius: 10, padding: '10px 14px',
                    border: `1px solid ${
                      step.state === 'done'    ? '#22c55e33' :
                      step.state === 'error'   ? '#ef444433' :
                      step.state === 'running' ? '#a78bfa33' : '#1a2d4a'
                    }`,
                  }}>
                    <div style={{ marginTop: 1, flexShrink: 0 }}>
                      {step.state === 'done'    && <CheckCircle2 size={16} color="#22c55e"/>}
                      {step.state === 'error'   && <XCircle      size={16} color="#ef4444"/>}
                      {step.state === 'running' && <Loader2      size={16} color="#a78bfa" style={{ animation: 'spin 1s linear infinite' }}/>}
                      {step.state === 'pending' && <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #334155' }}/>}
                    </div>
                    <div>
                      <div style={{ color: '#e2e8f0', fontSize: 13 }}>{step.label}</div>
                      {step.detail && (
                        <div style={{ color: step.state === 'error' ? '#f87171' : '#64748b', fontSize: 11, marginTop: 2 }}>
                          {step.detail}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Final summary ── */}
          {done && results && (
            <section>
              <div style={{
                background: '#0d1f35', borderRadius: 12, padding: '16px 20px',
                border: '1px solid #1a2d4a',
              }}>
                <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
                  Distribution complete — {results.placements.filter(p => p.success).length}/{results.placements.length} placements succeeded
                </div>

                {results.placements.map(p => (
                  <div key={p.placementId} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 0', borderBottom: '1px solid #1a2d4a', fontSize: 13,
                  }}>
                    {p.success ? <CheckCircle2 size={14} color="#22c55e"/> : <XCircle size={14} color="#ef4444"/>}
                    <span style={{ color: '#cbd5e1', flex: 1 }}>{p.label}</span>
                    {p.postUrl
                      ? <a href={p.postUrl} target="_blank" rel="noreferrer" style={{ color: '#818cf8', fontSize: 11 }}>View post ↗</a>
                      : p.postId
                        ? <span style={{ color: '#64748b', fontSize: 11 }}>ID: {p.postId}</span>
                        : p.error
                          ? <span style={{ color: '#f87171', fontSize: 11 }}>{p.error}</span>
                          : null
                    }
                  </div>
                ))}

                {results.ads.map(a => (
                  <div key={a.adSetId} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 0', borderBottom: '1px solid #1a2d4a', fontSize: 13,
                  }}>
                    {a.success ? <CheckCircle2 size={14} color="#22c55e"/> : <XCircle size={14} color="#ef4444"/>}
                    <span style={{ color: '#cbd5e1', flex: 1 }}>
                      {a.action === 'add' ? 'Added to' : 'Replaced in'} "{a.adSetName}"
                    </span>
                    {a.adId
                      ? <span style={{ color: '#64748b', fontSize: 11 }}>Ad {a.adId}</span>
                      : a.error
                        ? <span style={{ color: '#f87171', fontSize: 11 }}>{a.error}</span>
                        : null
                    }
                  </div>
                ))}

                <div style={{ color: '#475569', fontSize: 11, marginTop: 10 }}>
                  Saved to distribution portfolio · {new Date().toLocaleString()}
                </div>
              </div>

              <button
                onClick={onClose}
                style={{
                  width: '100%', marginTop: 12, padding: '12px 0', borderRadius: 10,
                  background: '#1a2d4a', border: '1px solid #334155',
                  color: '#94a3b8', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}
              >
                Close
              </button>
            </section>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
