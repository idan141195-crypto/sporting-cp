import React, { useEffect, useRef, useState } from 'react';
import {
  FONT_CONFIGS,
  applyBrand,
  generatePalette,
  loadBrand,
  resetBrand,
  resolveBrand,
  saveBrand,
} from '../lib/BrandingService';
import type { BrandConfig, FontStyle, SemanticPalette } from '../lib/BrandingService';

// ─── Palette swatch row ────────────────────────────────────────────────────────

const PaletteRow: React.FC<{ primary: string; palette: SemanticPalette }> = ({ primary, palette }) => {
  const swatches = [
    { color: primary,                label: 'Primary'    },
    { color: palette.surface,        label: 'BG'         },
    { color: palette.surfaceCard,    label: 'Card'       },
    { color: palette.surfaceElevated,label: 'Elevated'   },
    { color: palette.muted,          label: 'Border'     },
    { color: palette.textSecondary,  label: 'Text'       },
    { color: palette.glow,           label: 'Glow'       },
  ];
  return (
    <div className="flex gap-2">
      {swatches.map(s => (
        <div key={s.label} className="flex flex-col items-center gap-1 flex-1">
          <div
            className="w-full h-7 rounded"
            style={{ background: s.color, border: '1px solid rgba(255,255,255,0.08)' }}
            title={s.color}
          />
          <span className="text-[8px] font-mono uppercase tracking-wider" style={{ color: '#374151' }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Brand preview card ────────────────────────────────────────────────────────

const BrandPreview: React.FC<{ brand: BrandConfig }> = ({ brand }) => {
  const palette  = generatePalette(brand.primary);
  const fontCfg  = FONT_CONFIGS[brand.fontStyle];
  return (
    <div
      className="rounded border p-4 space-y-4"
      style={{ background: palette.surfaceCard, borderColor: `${brand.primary}44`, boxShadow: `0 0 20px ${brand.primary}18` }}
    >
      {/* Identity */}
      <div className="flex items-center gap-3">
        <img
          src={brand.logoUrl}
          alt={brand.name}
          className="w-12 h-12 rounded object-contain flex-shrink-0"
          style={{ background: `${brand.primary}18`, border: `1px solid ${brand.primary}33` }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="flex-1 min-w-0">
          <p
            className="text-white font-black text-lg leading-none"
            style={{ fontFamily: fontCfg.display }}
          >
            {brand.name}
          </p>
          <p className="text-[10px] font-mono mt-1 uppercase tracking-widest" style={{ color: palette.textSecondary }}>
            {brand.domain}
          </p>
        </div>
        {/* Contrast badge */}
        <div
          className="px-3 py-1.5 rounded text-xs font-black uppercase tracking-widest shrink-0"
          style={{ background: brand.primary, color: palette.textOnPrimary, fontFamily: fontCfg.display }}
        >
          {brand.vibe === 'sharp' ? '⚡ Sharp' : '✦ Modern'}
        </div>
      </div>

      {/* Palette row */}
      <PaletteRow primary={brand.primary} palette={palette} />

      {/* Typography preview */}
      <div className="pt-3 border-t" style={{ borderColor: palette.muted }}>
        <p className="text-[9px] uppercase tracking-widest mb-2" style={{ color: palette.textSecondary }}>
          Typography · {fontCfg.label}
        </p>
        <div className="flex items-baseline gap-4">
          <span
            className="text-3xl font-black leading-none"
            style={{ color: brand.primary, fontFamily: fontCfg.display }}
          >
            7.4x ROAS
          </span>
          <span
            className="text-xs"
            style={{ color: palette.textSecondary, fontFamily: fontCfg.body }}
          >
            {fontCfg.description}
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Vibe toggle ───────────────────────────────────────────────────────────────

const VibeToggle: React.FC<{ value: BrandConfig['vibe']; onChange: (v: BrandConfig['vibe']) => void }> = ({ value, onChange }) => (
  <div className="space-y-2">
    <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#6b7280' }}>Visual Style</p>
    <div className="grid grid-cols-2 gap-2">
      {(['sharp', 'modern'] as const).map(v => {
        const active = value === v;
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            className="py-3 px-4 rounded border text-left"
            style={{
              background:  active ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)',
              borderColor: active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)',
              color:       active ? '#ffffff' : '#6b7280',
            }}
          >
            <div className="text-lg mb-0.5">{v === 'sharp' ? '⚡' : '✦'}</div>
            <div className="text-xs font-bold uppercase tracking-widest">{v === 'sharp' ? 'Sharp' : 'Modern'}</div>
            <div className="text-[9px] font-normal normal-case mt-0.5" style={{ color: '#4b5563' }}>
              {v === 'sharp' ? 'Hard edges, high contrast' : 'Rounded, soft shadows'}
            </div>
          </button>
        );
      })}
    </div>
  </div>
);

// ─── Font style picker ─────────────────────────────────────────────────────────

const FontPicker: React.FC<{ value: FontStyle; onChange: (v: FontStyle) => void }> = ({ value, onChange }) => (
  <div className="space-y-2">
    <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#6b7280' }}>Typography</p>
    <div className="grid grid-cols-2 gap-2">
      {(Object.entries(FONT_CONFIGS) as [FontStyle, typeof FONT_CONFIGS[FontStyle]][]).map(([style, cfg]) => {
        const active = value === style;
        return (
          <button
            key={style}
            onClick={() => onChange(style)}
            className="py-3 px-4 rounded border text-left"
            style={{
              background:  active ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)',
              borderColor: active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)',
              color:       active ? '#ffffff' : '#6b7280',
            }}
          >
            <div
              className="text-xl font-black leading-none mb-1"
              style={{ fontFamily: cfg.display.split(',')[0].replace(/'/g, '') }}
            >
              Aa
            </div>
            <div className="text-xs font-bold uppercase tracking-widest">{cfg.label}</div>
            <div className="text-[9px] font-normal normal-case mt-0.5" style={{ color: '#4b5563' }}>
              {cfg.description}
            </div>
          </button>
        );
      })}
    </div>
  </div>
);

// ─── Main component ────────────────────────────────────────────────────────────

export const BrandingSettings: React.FC = () => {
  const [url,     setUrl]     = useState('');
  const [preview, setPreview] = useState<BrandConfig | null>(null);
  const [current, setCurrent] = useState<BrandConfig>(loadBrand);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { applyBrand(current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResolve = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setApplied(false);
    try {
      const brand = await resolveBrand(url.trim());
      setPreview(brand);
    } catch {
      setError('Could not resolve brand. Check the URL and try again.');
    } finally {
      setLoading(false);
    }
  };

  const updatePreview = (patch: Partial<BrandConfig>) => {
    if (!preview) return;
    setPreview({ ...preview, ...patch });
    setApplied(false);
  };

  const handleApply = () => {
    if (!preview) return;
    applyBrand(preview);
    saveBrand(preview);
    setCurrent(preview);
    setApplied(true);
  };

  const handleReset = () => {
    resetBrand();
    const def = loadBrand();
    setCurrent(def);
    setPreview(null);
    setUrl('');
    setApplied(false);
    setError(null);
  };

  const isInstagram = url.trim().includes('instagram.com') || url.trim().startsWith('@');

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Header */}
      <div>
        <h2 className="text-white font-black text-base uppercase tracking-widest mb-1">
          Auto-Branding Engine
        </h2>
        <p className="text-xs font-mono" style={{ color: '#6b7280' }}>
          Paste a website URL or Instagram handle. The engine extracts the logo, brand
          colors, generates a full semantic palette, and switches the entire dashboard
          — backgrounds, fonts, borders, glow effects — to match.
        </p>
      </div>

      {/* URL input */}
      <div
        className="rounded border p-5 space-y-4"
        style={{ background: 'var(--brand-surface-card)', borderColor: 'var(--brand-muted)' }}
      >
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={e => { setUrl(e.target.value); setApplied(false); setError(null); }}
              onKeyDown={e => e.key === 'Enter' && handleResolve()}
              placeholder="bodo-glimt.no  ·  @sportingcp  ·  nike.com"
              className="w-full bg-transparent border rounded px-4 py-3 text-sm font-mono text-white placeholder-gray-600 outline-none pr-24"
              style={{ borderColor: 'var(--brand-muted)' }}
              onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--brand-primary)'; }}
              onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--brand-muted)'; }}
            />
            {isInstagram && (
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                style={{ background: 'rgba(225,48,108,0.15)', color: '#E1306C', border: '1px solid rgba(225,48,108,0.3)' }}
              >
                Instagram
              </span>
            )}
          </div>
          <button
            onClick={handleResolve}
            disabled={loading || !url.trim()}
            className="px-5 py-3 rounded text-xs font-black uppercase tracking-widest disabled:opacity-40 shrink-0"
            style={{
              background: 'color-mix(in srgb, var(--brand-primary) 20%, transparent)',
              border:     '1px solid color-mix(in srgb, var(--brand-primary) 40%, transparent)',
              color:      'var(--brand-primary)',
            }}
          >
            {loading ? '⏳' : 'Detect'}
          </button>
        </div>

        {/* Quick presets */}
        <div className="flex flex-wrap gap-2">
          {['bodo-glimt.no', 'sporting.pt', 'nike.com', '@sportingcp', 'apple.com', 'stripe.com'].map(preset => (
            <button
              key={preset}
              onClick={() => { setUrl(preset); setError(null); setApplied(false); }}
              className="px-3 py-1.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-primary)'; (e.currentTarget as HTMLElement).style.color = 'var(--brand-primary)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = '#9ca3af'; }}
            >
              {preset}
            </button>
          ))}
        </div>

        {error && <p className="text-xs font-mono" style={{ color: '#EF4444' }}>{error}</p>}
      </div>

      {/* Preview + controls + apply */}
      {preview && (
        <div className="space-y-4">
          <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#6b7280' }}>
            Detected Brand
          </p>
          <BrandPreview brand={preview} />

          <div className="grid grid-cols-2 gap-4">
            <VibeToggle value={preview.vibe} onChange={v => updatePreview({ vibe: v })} />
            <FontPicker value={preview.fontStyle} onChange={v => updatePreview({ fontStyle: v })} />
          </div>

          <button
            onClick={handleApply}
            className="w-full py-3.5 rounded text-sm font-black uppercase tracking-widest"
            style={{
              background:  applied ? 'rgba(16,185,129,0.2)' : 'color-mix(in srgb, var(--brand-primary) 20%, transparent)',
              border:      `1px solid ${applied ? 'rgba(16,185,129,0.5)' : 'color-mix(in srgb, var(--brand-primary) 45%, transparent)'}`,
              color:       applied ? '#10B981' : 'var(--brand-primary)',
              fontFamily:  FONT_CONFIGS[preview.fontStyle].display,
            }}
          >
            {applied ? '✓ Applied — Full Dashboard Updated' : `Apply ${preview.name} Theme →`}
          </button>
        </div>
      )}

      {/* Active brand */}
      <div className="space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#6b7280' }}>Active Brand</p>
        <BrandPreview brand={current} />
        <button
          onClick={handleReset}
          className="w-full py-3 rounded text-xs font-bold uppercase tracking-widest"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#EF4444'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(220,38,38,0.3)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#6b7280'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
        >
          Reset to Default (ScaleAI)
        </button>
      </div>

    </div>
  );
};

export default BrandingSettings;
