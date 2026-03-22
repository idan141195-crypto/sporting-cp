import { useState } from 'react';
import {
  Globe, Check, ArrowRight, Loader2, Zap,
  Palette, SkipForward, AlertCircle, ChevronRight,
} from 'lucide-react';
import { resolveBrand, applyBrand, saveBrand as saveBrandConfig } from '../lib/BrandingService';
import type { BrandConfig } from '../lib/BrandingService';
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

// ── Step Indicator ────────────────────────────────────────────────────────────

const STEP_LABELS = ['Brand DNA', 'Meta Ads'];

function StepIndicator({ current }: { current: 1 | 2 }) {
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {STEP_LABELS.map((label, i) => {
        const n      = i + 1;
        const done   = n < current;
        const active = n === current;
        return (
          <div key={i} className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                done   ? 'bg-green-500 text-white' :
                active ? 'bg-amber-400 text-black' :
                         'bg-white/10 text-white/30'
              }`}>
                {done ? <Check size={12} /> : n}
              </div>
              <span className={`text-[10px] ${active ? 'text-white/60' : 'text-white/20'}`}>{label}</span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`h-px w-14 mb-4 transition-all ${done ? 'bg-green-500/40' : 'bg-white/10'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Welcome Step ──────────────────────────────────────────────────────────────

function WelcomeStep({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-center space-y-8">
      {/* Logo */}
      <div className="flex items-center justify-center gap-3">
        <div className="w-14 h-14 bg-amber-400 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-400/20">
          <Zap size={30} className="text-black" />
        </div>
        <div className="text-left">
          <div className="text-3xl font-black text-white tracking-tight leading-none">
            Zipit<span className="text-amber-400">.</span>ai
          </div>
          <div className="text-[10px] text-white/30 tracking-widest uppercase mt-0.5">Marketing Platform</div>
        </div>
      </div>

      <div className="space-y-3">
        <h1 className="text-4xl font-black text-white leading-[1.1]">
          Your brand.<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
            Supercharged by AI.
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
          { icon: Zap,     title: 'AI Campaigns',    desc: 'Start generating content immediately'   },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 text-left">
            <Icon size={18} className="text-amber-400 mb-2" />
            <div className="text-white text-xs font-semibold mb-1">{title}</div>
            <div className="text-white/30 text-[11px] leading-snug">{desc}</div>
          </div>
        ))}
      </div>

      <button
        onClick={onStart}
        className="w-full py-4 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-black font-black rounded-xl flex items-center justify-center gap-2 text-lg transition-all shadow-lg shadow-amber-400/20"
      >
        Get Started <ArrowRight size={20} />
      </button>
    </div>
  );
}

// ── Brand Step ────────────────────────────────────────────────────────────────

interface BrandStepState {
  url:       string;
  detecting: boolean;
  deepScan:  boolean;
  config:    BrandConfig | null;
  name:      string;
  industry:  string;
  tone:      string;
  keywords:  string[];
  error:     string;
}

function BrandStep({ onContinue }: {
  onContinue: (cfg: BrandConfig, name: string, industry: string, tone: string, keywords: string[]) => void;
}) {
  const [s, setS] = useState<BrandStepState>({
    url: '', detecting: false, deepScan: false,
    config: null, name: '', industry: '', tone: '', keywords: [], error: '',
  });

  async function detect() {
    const raw = s.url.trim();
    if (!raw) return;
    const full = raw.startsWith('http') ? raw : `https://${raw}`;
    setS(prev => ({ ...prev, detecting: true, error: '', config: null, name: '', industry: '', tone: '', keywords: [] }));

    try {
      // Fast: favicon + dominant color
      const cfg = await resolveBrand(full);
      setS(prev => ({ ...prev, detecting: false, config: cfg, name: cfg.name }));

      // Background: deep AI scan for tone / industry / keywords
      const key = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
      if (key) {
        setS(prev => ({ ...prev, deepScan: true }));
        try {
          const profile = await scanBrand(full, callClaude);
          saveBrandProfile(profile);
          setS(prev => ({
            ...prev, deepScan: false,
            name:     prev.name || profile.name,
            industry: profile.industry,
            tone:     profile.tone,
            keywords: profile.keywords,
          }));
        } catch {
          setS(prev => ({ ...prev, deepScan: false }));
        }
      }
    } catch {
      setS(prev => ({ ...prev, detecting: false, error: 'Could not detect brand. Check the URL and try again.' }));
    }
  }

  function handleContinue() {
    if (!s.config) return;
    const finalName = s.name.trim() || s.config.name;
    onContinue({ ...s.config, name: finalName }, finalName, s.industry, s.tone, s.keywords);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-white">Brand DNA</h2>
        <p className="text-white/40 text-sm mt-1">
          Enter your website URL — we'll detect your colors, logo, and tone automatically.
        </p>
      </div>

      {/* URL input row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            type="text"
            value={s.url}
            onChange={e => setS(prev => ({ ...prev, url: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && !s.detecting && detect()}
            placeholder="yoursite.com"
            className="w-full pl-8 pr-3 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-white text-sm placeholder-white/20 focus:outline-none focus:border-amber-400/40"
          />
        </div>
        <button
          onClick={detect}
          disabled={s.detecting || !s.url.trim()}
          className="px-4 py-3 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-black font-bold rounded-xl flex items-center gap-1.5 text-sm transition-colors whitespace-nowrap"
        >
          {s.detecting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {s.detecting ? 'Detecting…' : 'Detect'}
        </button>
      </div>

      {s.error && (
        <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/5 border border-red-400/20 rounded-lg p-3">
          <AlertCircle size={12} className="shrink-0" /> {s.error}
        </div>
      )}

      {/* Brand Preview */}
      {s.config && (
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <img
              src={s.config.logoUrl}
              alt=""
              className="w-12 h-12 rounded-lg object-contain bg-white/5 p-1 border border-white/10"
              onError={e => ((e.target as HTMLImageElement).style.opacity = '0')}
            />
            <div className="flex-1 min-w-0">
              <input
                value={s.name}
                onChange={e => setS(prev => ({ ...prev, name: e.target.value }))}
                className="w-full bg-transparent text-white font-bold text-lg focus:outline-none border-b border-transparent focus:border-amber-400/40 pb-0.5"
                placeholder="Brand name"
              />
              {s.industry && (
                <div className="text-white/30 text-xs mt-0.5">{s.industry}</div>
              )}
            </div>
            <div className="flex gap-1.5 shrink-0">
              <div
                className="w-7 h-7 rounded-full border border-white/20"
                style={{ backgroundColor: s.config.primary }}
                title={s.config.primary}
              />
              <div
                className="w-7 h-7 rounded-full border border-white/20"
                style={{ backgroundColor: s.config.secondary }}
                title={s.config.secondary}
              />
            </div>
          </div>

          {(s.deepScan || s.tone || s.keywords.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {s.deepScan && (
                <span className="text-[10px] px-2 py-0.5 bg-white/5 text-white/30 rounded-full border border-white/10 flex items-center gap-1">
                  <Loader2 size={8} className="animate-spin" /> Analyzing deeper…
                </span>
              )}
              {s.tone && (
                <span className="text-[10px] px-2 py-0.5 bg-amber-400/10 text-amber-400 rounded-full border border-amber-400/20">
                  {s.tone}
                </span>
              )}
              {s.keywords.map(k => (
                <span key={k} className="text-[10px] px-2 py-0.5 bg-white/[0.04] text-white/40 rounded-full border border-white/10">
                  {k}
                </span>
              ))}
            </div>
          )}

          <div className="text-[10px] text-white/20 flex items-center gap-1">
            <Check size={8} className="text-green-400" /> Detected from {s.url}
          </div>
        </div>
      )}

      <button
        onClick={handleContinue}
        disabled={!s.config || s.detecting}
        className="w-full py-3.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-30 disabled:cursor-not-allowed text-black font-black rounded-xl flex items-center justify-center gap-2 transition-colors"
      >
        Continue <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ── Meta Step ─────────────────────────────────────────────────────────────────

interface MetaStepState {
  token:           string;
  loading:         boolean;
  accounts:        MetaAccount[];
  pages:           MetaPage[];
  selectedAccount: string;
  selectedPage:    string;
  error:           string;
}

function MetaStep({ onContinue, onSkip }: {
  onContinue: (token: string, accountId: string, pageId: string) => void;
  onSkip:     () => void;
}) {
  const [s, setS] = useState<MetaStepState>({
    token: '', loading: false, accounts: [], pages: [],
    selectedAccount: '', selectedPage: '', error: '',
  });

  async function connect() {
    const token = s.token.trim();
    if (!token) return;
    setS(prev => ({ ...prev, loading: true, error: '' }));
    try {
      const [accounts, pages] = await Promise.all([
        fetchAdAccounts(token),
        fetchPages(token),
      ]);
      setS(prev => ({
        ...prev, loading: false, accounts, pages,
        selectedAccount: accounts[0]?.id ?? '',
        selectedPage:    pages[0]?.id    ?? '',
      }));
    } catch {
      setS(prev => ({ ...prev, loading: false, error: 'Connection failed. Check your token and try again.' }));
    }
  }

  const connected = s.accounts.length > 0 || s.pages.length > 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-white">Connect Meta Ads</h2>
        <p className="text-white/40 text-sm mt-1">
          Link your Facebook & Instagram ad accounts to manage campaigns from here.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-white/40 font-medium">Meta Business Access Token</label>
        <textarea
          value={s.token}
          onChange={e => setS(prev => ({ ...prev, token: e.target.value, error: '' }))}
          placeholder="Paste your long-lived access token here…"
          rows={3}
          className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-white text-xs font-mono placeholder-white/20 focus:outline-none focus:border-amber-400/40 resize-none"
        />
        <p className="text-[11px] text-white/25 leading-relaxed">
          Get your token from{' '}
          <span className="text-white/45">Meta Business Suite → Settings → System Users → Generate Token</span>
        </p>
      </div>

      {!connected && (
        <button
          onClick={connect}
          disabled={s.loading || !s.token.trim()}
          className="w-full py-3 bg-[#1877F2] hover:bg-[#1565d8] active:scale-[0.98] disabled:opacity-40 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
        >
          {s.loading ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
          {s.loading ? 'Connecting…' : 'Connect to Meta'}
        </button>
      )}

      {s.error && (
        <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/5 border border-red-400/20 rounded-lg p-3">
          <AlertCircle size={12} className="shrink-0" /> {s.error}
        </div>
      )}

      {connected && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
            <div className="w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center">
              <Check size={10} />
            </div>
            Connected — {s.accounts.length} ad account{s.accounts.length !== 1 ? 's' : ''} found
          </div>

          {s.accounts.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-xs text-white/40">Ad Account</label>
              <select
                value={s.selectedAccount}
                onChange={e => setS(prev => ({ ...prev, selectedAccount: e.target.value }))}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-amber-400/40"
              >
                {s.accounts.map(acc => (
                  <option key={acc.id} value={acc.id} className="bg-[#0c0d12]">
                    {acc.name} — {acc.account_id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {s.pages.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs text-white/40">Facebook Page</label>
              <select
                value={s.selectedPage}
                onChange={e => setS(prev => ({ ...prev, selectedPage: e.target.value }))}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-amber-400/40"
              >
                {s.pages.map(p => (
                  <option key={p.id} value={p.id} className="bg-[#0c0d12]">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => onContinue(s.token.trim(), s.selectedAccount, s.selectedPage)}
            className="w-full py-3.5 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-black font-black rounded-xl flex items-center justify-center gap-2 transition-all"
          >
            Finish Setup <ArrowRight size={16} />
          </button>
        </div>
      )}

      <button
        onClick={onSkip}
        className="w-full py-2 text-white/25 hover:text-white/50 text-xs flex items-center justify-center gap-1.5 transition-colors"
      >
        <SkipForward size={12} /> Skip Meta connection — I'll connect later
      </button>
    </div>
  );
}

// ── Done Step ─────────────────────────────────────────────────────────────────

function DoneStep({ brandName, metaConnected, onDashboard }: {
  brandName:     string;
  metaConnected: boolean;
  onDashboard:   () => void;
}) {
  return (
    <div className="text-center space-y-6">
      <div className="flex justify-center">
        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center border-2 border-green-500/20">
          <Check size={36} className="text-green-400" strokeWidth={3} />
        </div>
      </div>

      <div>
        <h2 className="text-3xl font-black text-white">All Done!</h2>
        <p className="text-white/40 text-sm mt-2">Your Zipit.ai workspace is ready.</p>
      </div>

      <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 text-left space-y-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center shrink-0">
            <Check size={10} className="text-green-400" />
          </div>
          <span className="text-white/60 text-sm">
            Brand DNA: <span className="text-white font-semibold">{brandName || 'Your Brand'}</span>
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
            metaConnected ? 'bg-green-500/20' : 'bg-amber-400/10'
          }`}>
            {metaConnected
              ? <Check size={10} className="text-green-400" />
              : <AlertCircle size={10} className="text-amber-400" />}
          </div>
          <span className="text-sm">
            {metaConnected
              ? <span className="text-white/60">Meta Ads connected</span>
              : <span className="text-white/30">Meta Ads — connect later in Settings</span>}
          </span>
        </div>
      </div>

      <button
        onClick={onDashboard}
        className="w-full py-4 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-black font-black rounded-xl flex items-center justify-center gap-2 text-lg transition-all shadow-lg shadow-amber-400/20"
      >
        Go to Dashboard <ArrowRight size={20} />
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type Step = 0 | 1 | 2 | 3; // welcome | brand | meta | done

interface OnboardingPageProps {
  onComplete: () => void;
}

export default function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const [step, setStep] = useState<Step>(0);
  const [brandName, setBrandName] = useState('');
  const [metaConnected, setMetaConnected] = useState(false);

  function handleBrandContinue(
    cfg:      BrandConfig,
    name:     string,
    industry: string,
    tone:     string,
    keywords: string[],
  ) {
    const finalName = name || cfg.name;
    setBrandName(finalName);
    const finalCfg = { ...cfg, name: finalName };
    applyBrand(finalCfg);
    saveBrandConfig(finalCfg);
    saveUserConfig({
      websiteUrl:     cfg.domain,
      brandName:      finalName,
      logoUrl:        cfg.logoUrl,
      primaryColor:   cfg.primary,
      secondaryColor: cfg.secondary,
      industry,
      tone,
      keywords,
    });
    setStep(2);
  }

  function handleMetaContinue(token: string, accountId: string, pageId: string) {
    setMetaConnected(true);
    saveUserConfig({
      metaAccessToken:    token,
      metaAdAccountId:    accountId,
      metaFacebookPageId: pageId,
      completed:          true,
    });
    setStep(3);
  }

  function handleMetaSkip() {
    saveUserConfig({ completed: true });
    setStep(3);
  }

  return (
    <div className="min-h-screen bg-[#06060a] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {(step === 1 || step === 2) && <StepIndicator current={step as 1 | 2} />}

        <div className="bg-[#0c0d12] border border-white/[0.06] rounded-2xl p-8 shadow-2xl">
          {step === 0 && <WelcomeStep onStart={() => setStep(1)} />}
          {step === 1 && <BrandStep onContinue={handleBrandContinue} />}
          {step === 2 && <MetaStep onContinue={handleMetaContinue} onSkip={handleMetaSkip} />}
          {step === 3 && (
            <DoneStep
              brandName={brandName}
              metaConnected={metaConnected}
              onDashboard={onComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
}
