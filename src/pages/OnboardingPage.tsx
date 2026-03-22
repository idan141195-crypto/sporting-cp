import { useState } from 'react';
import {
  Globe, Check, ArrowRight, Loader2, Sparkles,
  Palette, SkipForward,
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
    <div className="text-center space-y-5">
      {/* Logo — same as Dashboard home page hero */}
      <div className="flex items-center justify-center">
        <span className="font-display" style={{
          fontSize: 52, fontWeight: 700, letterSpacing: '-0.03em',
          lineHeight: 1, color: '#fff',
        }}>
          Scale<span style={{ color: 'var(--brand-primary)' }}>.ai</span>
        </span>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-black text-white leading-[1.1]">
          Your AI Marketing<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500">
            Command Center.
          </span>
        </h1>
        <p className="text-white/50 text-sm max-w-sm mx-auto leading-relaxed">
          Set up your AI marketing hub in under 2 minutes. We'll auto-detect your brand and connect your ad accounts.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Palette,  title: 'Auto Brand DNA', desc: 'Logo, colors & tone detected instantly' },
          { icon: Globe,    title: 'Meta Connected',  desc: 'Ad accounts linked in seconds'          },
          { icon: Sparkles, title: 'AI Campaigns',    desc: 'Start generating content immediately'   },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 text-left">
            <Icon size={16} className="text-yellow-400 mb-1.5" />
            <div className="text-white text-xs font-semibold mb-0.5">{title}</div>
            <div className="text-white/30 text-[10px] leading-snug">{desc}</div>
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
        className="w-full py-2 text-white/25 hover:text-white/50 text-xs flex items-center justify-center gap-1.5 transition-colors"
      >
        <SkipForward size={12} /> Skip setup — go straight to dashboard
      </button>
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
        <span className="text-[10px] text-white/25 uppercase tracking-widest font-semibold">All optional</span>
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
    <div className="min-h-screen bg-[#06060a] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-[#0c0d12] border border-white/[0.06] rounded-2xl p-8 shadow-2xl">
          {step === 0 && <WelcomeStep onStart={() => setStep(1)} onSkip={handleSkip} />}
          {step === 1 && <SetupStep onComplete={onComplete} />}
        </div>
      </div>
    </div>
  );
}
