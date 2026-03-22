import { useState, useRef } from 'react';
import {
  Globe, Check, ArrowRight, Loader2, Sparkles,
  Palette, SkipForward, AlertCircle,
  Upload, FileText, Activity,
} from 'lucide-react';
import { resolveBrand, applyBrand, saveBrand as saveBrandConfig } from '../lib/BrandingService';
import { scanBrand, saveBrand as saveBrandProfile } from '../lib/brandContext';
import { saveUserConfig } from '../lib/userConfig';
import Anthropic from '@anthropic-ai/sdk';

// ── Meta Graph API ────────────────────────────────────────────────────────────

const META_GRAPH = 'https://graph.facebook.com/v19.0';

interface MetaAccount { id: string; name: string; account_id: string; currency: string; }
interface MetaPage    { id: string; name: string; }

async function fetchAdAccounts(token: string): Promise<MetaAccount[]> {
  const res = await fetch(
    `${META_GRAPH}/me/adaccounts?fields=name,account_id,currency&limit=50&access_token=${token}`,
  );
  if (!res.ok) throw new Error(`Meta ${res.status}`);
  const json = await res.json() as { data?: MetaAccount[] };
  return json.data ?? [];
}

async function fetchPages(token: string): Promise<MetaPage[]> {
  const res = await fetch(
    `${META_GRAPH}/me/accounts?fields=name&limit=50&access_token=${token}`,
  );
  if (!res.ok) return [];
  const json = await res.json() as { data?: MetaPage[] };
  return json.data ?? [];
}

// ── AI helper (for deep brand scan) ──────────────────────────────────────────

async function readFileToText(f: File): Promise<string> {
  const isExcel = /\.(xlsx|xls)$/i.test(f.name);
  if (isExcel) {
    const XLSX = await import('xlsx');
    const buf  = await f.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array' });
    return wb.SheetNames.map(name => {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      return `Sheet: ${name}\n${csv}`;
    }).join('\n\n');
  }
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res((e.target?.result as string) ?? '');
    r.onerror = rej;
    r.readAsText(f);
  });
}

async function callClaude(system: string, user: string): Promise<string> {
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
  if (!key) throw new Error('No AI key');
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const b = msg.content[0];
  return b.type === 'text' ? b.text : '';
}

// ── Welcome Step ──────────────────────────────────────────────────────────────

function WelcomeStep({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="text-center space-y-8">
      {/* Logo — same as Dashboard home page hero */}
      <div className="flex items-center justify-center">
        <span className="font-display" style={{
          fontSize: 64, fontWeight: 700, letterSpacing: '-0.03em',
          lineHeight: 1, color: '#fff',
        }}>
          Scale<span style={{ color: 'var(--brand-primary)' }}>.ai</span>
        </span>
      </div>

      <div className="space-y-3">
        <h1 className="text-4xl font-black text-white leading-[1.1]">
          Your AI Marketing<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500">
            Command Center.
          </span>
        </h1>
        <p className="text-white/50 text-base max-w-sm mx-auto leading-relaxed">
          Set up your AI marketing hub in under 2 minutes. We'll auto-detect your brand and connect your ad accounts.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Palette, title: 'Auto Brand DNA',  desc: 'Logo, colors & tone detected instantly' },
          { icon: Globe,   title: 'Meta Connected',  desc: 'Ad accounts linked in seconds'          },
          { icon: Sparkles, title: 'AI Campaigns',    desc: 'Start generating content immediately'   },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 text-left">
            <Icon size={18} className="text-yellow-400 mb-2" />
            <div className="text-white text-xs font-semibold mb-1">{title}</div>
            <div className="text-white/30 text-[11px] leading-snug">{desc}</div>
          </div>
        ))}
      </div>

      <button
        onClick={onStart}
        className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 active:scale-[0.98] text-black font-black rounded-xl flex items-center justify-center gap-2 text-lg transition-all shadow-lg shadow-yellow-400/20"
      >
        Get Started <ArrowRight size={20} />
      </button>

      <button
        onClick={onSkip}
        className="w-full py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80 hover:border-white/20 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
      >
        <SkipForward size={14} /> Skip setup — go straight to dashboard
      </button>

      <FileAnalystSection />

    </div>
  );
}

// ── Insight Cards ─────────────────────────────────────────────────────────────

function cleanText(s: string) { return s.replace(/\*\*/g, '').replace(/^#+\s*/, '').trim(); }
function isValidBlock(s: string) {
  const c = cleanText(s);
  return c.length > 20 && !/^(here are|please provide|i (cannot|need|will)|to provide)/i.test(c);
}

const CARD_ACCENTS = [
  { bg: 'rgba(240,180,41,0.08)',  border: 'rgba(240,180,41,0.25)', num: '#F0B429' },
  { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.25)', num: '#818cf8' },
  { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  num: '#4ade80' },
  { bg: 'rgba(6,182,212,0.08)',  border: 'rgba(6,182,212,0.25)',  num: '#22d3ee' },
];

function InsightCards({ groups, onClose, onAddFile, onDropFile, loading }: {
  groups: InsightGroup[];
  onClose: () => void;
  onAddFile: () => void;
  onDropFile: (f: File) => void;
  loading: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const totalCount = groups.reduce((n, g) => n + g.blocks.length, 0);
  const subtitle = groups.map(g => g.fileName).join(' · ');

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(6,6,10,0.94)',
      backdropFilter: 'blur(14px)',
      display: 'flex', flexDirection: 'column',
      padding: '0',
    }}>
      {/* Top bar */}
      <div style={{
        padding: '16px 28px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'rgba(240,180,41,0.04)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11,
          background: 'rgba(240,180,41,0.12)',
          border: '1px solid rgba(240,180,41,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 20px rgba(240,180,41,0.18)',
        }}>
          <Activity size={18} style={{ color: '#F0B429' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
            AI Insights
            <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(240,180,41,0.7)', marginLeft: 10 }}>
              {totalCount} findings
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </div>
        </div>
        {/* Close */}
        <button onClick={onClose} style={{
          width: 34, height: 34, borderRadius: 9,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.45)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, lineHeight: 1, flexShrink: 0,
        }}>×</button>
      </div>

      {/* Scrollable cards area */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '24px 28px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
        gap: 16, alignContent: 'start',
      }}>
        {groups.flatMap((g, gi) =>
          g.blocks.filter(isValidBlock).map((block, bi) => {
            const globalIdx = groups.slice(0, gi).reduce((n, x) => n + x.blocks.filter(isValidBlock).length, 0) + bi;
            const accent = CARD_ACCENTS[globalIdx % CARD_ACCENTS.length];
            const clean = cleanText(block);
            const colonIdx = clean.indexOf(':');
            const hasTitle = colonIdx > 0 && colonIdx < 70;
            const title = hasTitle ? cleanText(clean.slice(0, colonIdx)) : null;
            const body  = hasTitle ? cleanText(clean.slice(colonIdx + 1)) : clean;

            return (
              <div key={`${gi}-${bi}`} style={{
                background: accent.bg,
                border: `1px solid ${accent.border}`,
                borderRadius: 18,
                padding: '22px 24px',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                    background: 'rgba(0,0,0,0.4)',
                    border: `1px solid ${accent.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: accent.num }}>{globalIdx + 1}</span>
                  </div>
                  {title && (
                    <span style={{ fontSize: 15, fontWeight: 800, color: accent.num, lineHeight: 1.25 }}>
                      {title}
                    </span>
                  )}
                </div>
                <p style={{
                  fontSize: 15, lineHeight: 1.7,
                  color: 'rgba(255,255,255,0.75)',
                  margin: 0, paddingLeft: 44,
                }}>
                  {body}
                </p>
                {groups.length > 1 && (
                  <div style={{ paddingLeft: 44, fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
                    {g.fileName}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Upload panel — always visible at bottom ── */}
      <div style={{
        flexShrink: 0,
        padding: '14px 28px 20px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.3)',
      }}>
        <div
          onClick={loading ? undefined : onAddFile}
          onDragOver={e => { if (!loading) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault(); setDragOver(false);
            if (loading) return;
            const f = e.dataTransfer.files?.[0];
            if (f) onDropFile(f);
          }}
          style={{
            border: `2px dashed ${dragOver ? 'rgba(240,180,41,0.65)' : 'rgba(240,180,41,0.22)'}`,
            background: dragOver
              ? 'rgba(240,180,41,0.07)'
              : 'linear-gradient(135deg, rgba(240,180,41,0.04) 0%, rgba(255,255,255,0.02) 100%)',
            borderRadius: 16, padding: '16px 24px', cursor: loading ? 'default' : 'pointer',
            transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 20,
            opacity: loading ? 0.5 : 1,
          }}
        >
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: dragOver ? 'rgba(240,180,41,0.18)' : 'rgba(240,180,41,0.1)',
            border: `1px solid ${dragOver ? 'rgba(240,180,41,0.5)' : 'rgba(240,180,41,0.25)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
            boxShadow: dragOver ? '0 0 20px rgba(240,180,41,0.2)' : 'none',
          }}>
            <Upload size={20} style={{ color: '#F0B429' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: dragOver ? '#F0B429' : 'rgba(255,255,255,0.7)', marginBottom: 3, transition: 'color 0.2s' }}>
              {loading ? 'Analyzing…' : dragOver ? 'Drop to analyze' : 'Add another file'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
              Drag & drop or click · CSV, Excel, PDF, TXT, JSON
            </div>
          </div>
          <div style={{
            padding: '8px 16px', borderRadius: 10, flexShrink: 0,
            background: 'rgba(240,180,41,0.12)', border: '1px solid rgba(240,180,41,0.3)',
            color: '#F0B429', fontSize: 12, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <FileText size={13} /> Browse
          </div>
        </div>
      </div>

    </div>
  );
}

// ── File Analyst Section ──────────────────────────────────────────────────────

interface InsightGroup { fileName: string; blocks: string[]; }

function parseBlocks(text: string): string[] {
  const byNum = text.split(/\n(?=\d+[\.\)]\s)/).map(s => s.replace(/^\d+[\.\)]\s*/, '').trim()).filter(Boolean);
  return byNum.length >= 2 ? byNum : text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
}

function FileAnalystSection() {
  const [groups,   setGroups]   = useState<InsightGroup[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState('');
  const [open,     setOpen]     = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);

  async function analyzeFile(f: File) {
    setErr('');
    setLoading(true);
    try {
      const key = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
      if (!key) throw new Error('No AI key configured');
      const text = await readFileToText(f);
      const result = await callClaude(
        'You are an elite marketing analyst. Extract 6–8 sharp, specific insights from the data. Numbered list, each: "N. Bold Title: One direct sentence (max 18 words), no fluff." No intro, no outro.',
        `File: ${f.name}\n\n${text.slice(0, 10000)}`,
      );
      setGroups(prev => [...prev, { fileName: f.name, blocks: parseBlocks(result) }]);
      setOpen(true);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      if (raw.includes('credit balance') || raw.includes('credit_balance') || raw.includes('billing')) {
        setErr('__billing__');
      } else if (raw.includes('No AI key')) {
        setErr('No Anthropic API key configured.');
      } else {
        setErr('Analysis failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4">
      {/* Divider */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-px flex-1 bg-white/[0.06]" />
        <span className="text-[10px] text-white/20 uppercase tracking-widest font-medium">or try instantly</span>
        <div className="h-px flex-1 bg-white/[0.06]" />
      </div>

      {/* Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(240,180,41,0.06) 0%, rgba(240,180,41,0.02) 50%, rgba(255,255,255,0.02) 100%)',
          border: '1px solid rgba(240,180,41,0.12)',
          borderRadius: 16,
          padding: '20px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle glow */}
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 120, height: 120, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(240,180,41,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Header row */}
        <div className="flex items-center gap-3 mb-3">
          <div style={{
            width: 36, height: 36,
            background: 'rgba(240,180,41,0.12)',
            border: '1px solid rgba(240,180,41,0.25)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 0 16px rgba(240,180,41,0.12)',
          }}>
            <Activity size={16} className="text-yellow-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-sm leading-tight">AI File Analyst</div>
            <div className="text-white/40 text-[11px] mt-0.5 leading-tight">
              Upload ad data · get actionable insights in seconds
            </div>
          </div>
          <div className="shrink-0">
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(240,180,41,0.7)',
              background: 'rgba(240,180,41,0.08)',
              border: '1px solid rgba(240,180,41,0.18)',
              borderRadius: 20, padding: '2px 8px',
            }}>
              Free
            </span>
          </div>
        </div>

        {/* Capability pills */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {['ROAS analysis', 'Budget waste', 'Creative fatigue', 'Scaling signals'].map(tag => (
            <span key={tag} style={{
              fontSize: 10, padding: '2px 8px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 20,
              color: 'rgba(255,255,255,0.35)',
            }}>
              {tag}
            </span>
          ))}
        </div>

        {/* Drop zone */}
        <div
          onClick={() => inputRef.current?.click()}
          style={{
            border: '1px dashed rgba(240,180,41,0.2)',
            borderRadius: 10,
            padding: '14px 16px',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.2s',
            background: 'rgba(0,0,0,0.2)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(240,180,41,0.45)';
            (e.currentTarget as HTMLElement).style.background = 'rgba(240,180,41,0.04)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(240,180,41,0.2)';
            (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.2)';
          }}
          onDragOver={e => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(240,180,41,0.55)';
            (e.currentTarget as HTMLElement).style.background = 'rgba(240,180,41,0.06)';
          }}
          onDragLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(240,180,41,0.2)';
            (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.2)';
          }}
          onDrop={e => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(240,180,41,0.2)';
            (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.2)';
            const f = e.dataTransfer.files?.[0];
            if (f) analyzeFile(f);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".csv,.xlsx,.xls,.pdf,.txt,.json,.md"
            onChange={e => { const f = e.target.files?.[0]; if (f) analyzeFile(f); }}
          />
          {loading ? (
            <div className="flex items-center justify-center gap-2.5">
              <Loader2 size={15} className="animate-spin text-yellow-400 shrink-0" />
              <span className="text-white/40 text-xs">Analyzing…</span>
            </div>
          ) : groups.length > 0 ? (
            <div className="flex items-center justify-center gap-2">
              <FileText size={13} className="text-yellow-400 shrink-0" />
              <span className="text-white/60 text-xs truncate">{groups[groups.length - 1].fileName}</span>
              <span className="text-white/25 text-xs shrink-0">· add more</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <Upload size={13} style={{ color: 'rgba(240,180,41,0.4)' }} />
              <span className="text-white/35 text-xs">Drop file or click — CSV, Excel, PDF, TXT</span>
            </div>
          )}
        </div>

        {/* Error */}
        {err && (
          err === '__billing__' ? (
            <div className="mt-3 bg-red-500/5 border border-red-500/20 rounded-lg p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-red-400 text-xs font-semibold">
                <AlertCircle size={12} className="shrink-0" /> API credit balance is too low
              </div>
              <p className="text-white/35 text-[11px] leading-relaxed pl-[20px]">
                Your Anthropic API key has run out of credits.{' '}
                <a
                  href="https://console.anthropic.com/settings/billing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-yellow-400/80 hover:text-yellow-400 underline underline-offset-2 transition-colors"
                >
                  Top up here →
                </a>
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/5 border border-red-400/15 rounded-lg p-3 mt-3">
              <AlertCircle size={12} className="shrink-0" /> {err}
            </div>
          )
        )}

        {/* View insights button */}
        {groups.length > 0 && !open && (
          <button onClick={() => setOpen(true)} style={{
            marginTop: 10, width: '100%', padding: '9px 0',
            background: 'rgba(240,180,41,0.1)', border: '1px solid rgba(240,180,41,0.25)',
            borderRadius: 10, color: '#F0B429', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>
            View {groups.reduce((n, g) => n + g.blocks.length, 0)} Insights →
          </button>
        )}

        {/* Overlay */}
        {open && <InsightCards groups={groups} onClose={() => setOpen(false)} onAddFile={() => inputRef.current?.click()} onDropFile={f => analyzeFile(f)} loading={loading} />}
      </div>
    </div>
  );
}

// ── Combined Setup Step ────────────────────────────────────────────────────────

function SetupStep({ onComplete }: { onComplete: () => void }) {
  // Brand state
  const [url,        setUrl]        = useState('');
  const [detecting,  setDetecting]  = useState(false);
  const [brandDone,  setBrandDone]  = useState(false);
  const [brandName,  setBrandName]  = useState('');
  const [brandError, setBrandError] = useState('');

  // Meta state
  const [token,           setToken]           = useState('');
  const [metaLoading,     setMetaLoading]     = useState(false);
  const [metaConnected,   setMetaConnected]   = useState(false);
  const [accounts,        setAccounts]        = useState<MetaAccount[]>([]);
  const [pages,           setPages]           = useState<MetaPage[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedPage,    setSelectedPage]    = useState('');
  const [metaError,       setMetaError]       = useState('');

  async function detectBrand() {
    const raw = url.trim();
    if (!raw) return;
    const full = raw.startsWith('http') ? raw : `https://${raw}`;
    setDetecting(true); setBrandError('');
    try {
      const cfg = await resolveBrand(full);
      const finalName = cfg.name;
      setBrandName(finalName);
      applyBrand(cfg); saveBrandConfig(cfg);
      saveUserConfig({ websiteUrl: cfg.domain, brandName: finalName, logoUrl: cfg.logoUrl, primaryColor: cfg.primary });
      setBrandDone(true);
      const key = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
      if (key) {
        try {
          const profile = await scanBrand(full, callClaude);
          saveBrandProfile(profile);
          saveUserConfig({ industry: profile.industry, tone: profile.tone, keywords: profile.keywords });
        } catch { /* silent */ }
      }
    } catch {
      setBrandError('Could not detect brand. Check the URL and try again.');
    } finally { setDetecting(false); }
  }

  async function connectMeta() {
    const t = token.trim();
    if (!t) return;
    setMetaLoading(true); setMetaError('');
    try {
      const [accs, pgs] = await Promise.all([fetchAdAccounts(t), fetchPages(t)]);
      setAccounts(accs); setPages(pgs);
      setSelectedAccount(accs[0]?.id ?? ''); setSelectedPage(pgs[0]?.id ?? '');
      setMetaConnected(true);
      saveUserConfig({ metaAccessToken: t, metaAdAccountId: accs[0]?.id ?? '', metaFacebookPageId: pgs[0]?.id ?? '' });
    } catch {
      setMetaError('Connection failed. Check your token and try again.');
    } finally { setMetaLoading(false); }
  }

  function handleDone() {
    saveUserConfig({ completed: true });
    onComplete();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-white">Quick Setup</h2>
        <button onClick={handleDone} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80 hover:border-white/20 text-[11px] font-semibold transition-colors">
          <SkipForward size={11} /> Skip all → Dashboard
        </button>
      </div>

      {/* ── Brand section ── */}
      <div className="border border-white/[0.07] rounded-xl p-4 space-y-3 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Globe size={13} className="text-yellow-400" />
          <span className="text-sm font-bold text-white">Brand DNA</span>
          {brandDone && <span className="ml-auto text-[10px] text-green-400 font-semibold flex items-center gap-1"><Check size={10}/> Detected</span>}
        </div>
        <div className="flex gap-2">
          <input
            value={url} onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') detectBrand(); }}
            placeholder="yourstore.com"
            className="flex-1 px-3 py-2.5 bg-white/[0.04] border border-white/10 rounded-lg text-white text-sm placeholder-white/20 focus:outline-none focus:border-yellow-400/40"
          />
          <button onClick={detectBrand} disabled={detecting || !url.trim()}
            className="px-3 py-2.5 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold rounded-lg flex items-center gap-1.5 text-sm transition-colors whitespace-nowrap">
            {detecting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {detecting ? 'Detecting…' : 'Detect'}
          </button>
        </div>
        {brandDone && <p className="text-xs text-green-400/70">Brand "{brandName}" detected and applied ✓</p>}
        {brandError && <p className="text-xs text-red-400">{brandError}</p>}
      </div>

      {/* ── File Analyst ── */}
      <FileAnalystSection />

      {/* ── Divider ── */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/[0.05]" />
        <span className="text-[10px] text-white/20 uppercase tracking-widest">or / and</span>
        <div className="h-px flex-1 bg-white/[0.05]" />
      </div>

      {/* ── Meta section ── */}
      <div className="border border-white/[0.07] rounded-xl p-4 space-y-3 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Globe size={13} className="text-[#1877F2]" />
          <span className="text-sm font-bold text-white">Connect Meta Ads</span>
          {metaConnected && <span className="ml-auto text-[10px] text-green-400 font-semibold flex items-center gap-1"><Check size={10}/> {accounts.length} account{accounts.length !== 1 ? 's' : ''}</span>}
        </div>
        {!metaConnected ? (
          <div className="flex gap-2">
            <input
              value={token} onChange={e => setToken(e.target.value)}
              placeholder="Paste your Meta access token…"
              className="flex-1 px-3 py-2.5 bg-white/[0.04] border border-white/10 rounded-lg text-white text-xs font-mono placeholder-white/20 focus:outline-none focus:border-yellow-400/40"
            />
            <button onClick={connectMeta} disabled={metaLoading || !token.trim()}
              className="px-3 py-2.5 bg-[#1877F2] hover:bg-[#1565d8] disabled:opacity-40 text-white font-bold rounded-lg flex items-center gap-1.5 text-sm transition-colors whitespace-nowrap">
              {metaLoading ? <Loader2 size={13} className="animate-spin" /> : <Globe size={13} />}
              {metaLoading ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.length > 1 && (
              <select value={selectedAccount} onChange={e => { setSelectedAccount(e.target.value); saveUserConfig({ metaAdAccountId: e.target.value }); }}
                className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-white text-sm focus:outline-none">
                {accounts.map(a => <option key={a.id} value={a.id} className="bg-[#0c0d12]">{a.name}</option>)}
              </select>
            )}
            {pages.length > 1 && (
              <select value={selectedPage} onChange={e => { setSelectedPage(e.target.value); saveUserConfig({ metaFacebookPageId: e.target.value }); }}
                className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-white text-sm focus:outline-none">
                {pages.map(p => <option key={p.id} value={p.id} className="bg-[#0c0d12]">{p.name}</option>)}
              </select>
            )}
          </div>
        )}
        {metaError && <p className="text-xs text-red-400">{metaError}</p>}
      </div>

      <button onClick={handleDone}
        className="w-full py-3.5 bg-yellow-400 hover:bg-yellow-300 active:scale-[0.98] text-black font-black rounded-xl flex items-center justify-center gap-2 transition-all">
        Go to Dashboard <ArrowRight size={16} />
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface OnboardingPageProps {
  onComplete: () => void;
}

export default function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const [step, setStep] = useState<0 | 1>(0);

  function handleSkip() {
    saveUserConfig({ completed: true });
    onComplete();
  }

  return (
    <div className="h-screen overflow-hidden bg-[#06060a] flex items-center justify-center p-4">
      <div className="w-full max-w-lg h-full flex flex-col justify-center">
        <div className="bg-[#0c0d12] border border-white/[0.06] rounded-2xl p-8 shadow-2xl overflow-y-auto max-h-full">
          {step === 0 && <WelcomeStep onStart={() => setStep(1)} onSkip={handleSkip} />}
          {step === 1 && <SetupStep onComplete={onComplete} />}
        </div>
      </div>
    </div>
  );
}
