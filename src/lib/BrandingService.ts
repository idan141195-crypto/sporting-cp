import { useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FontStyle = 'condensed' | 'impact' | 'minimal' | 'classic';

export interface BrandConfig {
  domain:    string;
  name:      string;
  logoUrl:   string;
  primary:   string;   // hex
  secondary: string;   // hex
  vibe:      'modern' | 'sharp';
  fontStyle: FontStyle;
}

export interface SemanticPalette {
  surface:         string;
  surfaceCard:     string;
  surfaceElevated: string;
  muted:           string;
  textSecondary:   string;
  glow:            string;
  textOnPrimary:   string;
}

export interface FontConfig {
  label:         string;
  description:   string;
  display:       string;  // CSS font-family value
  body:          string;
  googleFontsUrl: string | null;
}

// ─── Font personalities ────────────────────────────────────────────────────────

export const FONT_CONFIGS: Record<FontStyle, FontConfig> = {
  condensed: {
    label:       'Athletic',
    description: 'Tight & powerful',
    display:     "'Barlow Condensed', Impact, sans-serif",
    body:        "'DM Sans', Inter, system-ui, sans-serif",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;0,900;1,700&family=DM+Sans:opsz,wght@9..40,400;9..40,700&display=swap',
  },
  impact: {
    label:       'Bold',
    description: 'Maximum impact',
    display:     "'Bebas Neue', 'Barlow Condensed', sans-serif",
    body:        "'DM Sans', Inter, system-ui, sans-serif",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:opsz,wght@9..40,400;9..40,700&display=swap',
  },
  minimal: {
    label:       'Minimal',
    description: 'Clean & modern',
    display:     "'DM Sans', Inter, system-ui, sans-serif",
    body:        "'DM Sans', Inter, system-ui, sans-serif",
    googleFontsUrl: null,  // DM Sans already loaded
  },
  classic: {
    label:       'Classic',
    description: 'Elegant serif',
    display:     "'Playfair Display', Georgia, serif",
    body:        "'Source Serif 4', Georgia, serif",
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap",
  },
};

const STORAGE_KEY = 'scaleai_brand_v3';

export const DEFAULT_BRAND: BrandConfig = {
  domain:    '',
  name:      'ScaleAI',
  logoUrl:   '/bodo-glimt/sporting-cp-logo.png',
  primary:   '#FBBF24',
  secondary: '#06D6F0',
  vibe:      'sharp',
  fontStyle: 'condensed',
};

// ─── Known brand presets ───────────────────────────────────────────────────────

const PRESETS: Record<string, Partial<BrandConfig>> = {
  'bodo-glimt.no': { name: 'Bodø/Glimt', primary: '#FBBF24', secondary: '#ffffff', vibe: 'sharp',  fontStyle: 'condensed' },
  'sporting.pt':   { name: 'Sporting CP', primary: '#006A4E', secondary: '#FFD700', vibe: 'sharp',  fontStyle: 'condensed' },
  'nike.com':      { name: 'Nike',        primary: '#111111', secondary: '#FF0000', vibe: 'sharp',  fontStyle: 'impact'    },
  'adidas.com':    { name: 'Adidas',      primary: '#000000', secondary: '#ffffff', vibe: 'sharp',  fontStyle: 'impact'    },
  'apple.com':     { name: 'Apple',       primary: '#1D1D1F', secondary: '#0071E3', vibe: 'modern', fontStyle: 'minimal'   },
  'meta.com':      { name: 'Meta',        primary: '#0866FF', secondary: '#ffffff', vibe: 'modern', fontStyle: 'minimal'   },
  'facebook.com':  { name: 'Facebook',    primary: '#1877F2', secondary: '#ffffff', vibe: 'modern', fontStyle: 'minimal'   },
  'shopify.com':   { name: 'Shopify',     primary: '#96BF48', secondary: '#5E8E3E', vibe: 'modern', fontStyle: 'minimal'   },
  'amazon.com':    { name: 'Amazon',      primary: '#FF9900', secondary: '#232F3E', vibe: 'modern', fontStyle: 'minimal'   },
  'google.com':    { name: 'Google',      primary: '#4285F4', secondary: '#34A853', vibe: 'modern', fontStyle: 'minimal'   },
  'stripe.com':    { name: 'Stripe',      primary: '#635BFF', secondary: '#0A2540', vibe: 'modern', fontStyle: 'minimal'   },
  'notion.so':     { name: 'Notion',      primary: '#ffffff', secondary: '#37352F', vibe: 'modern', fontStyle: 'minimal'   },
};

// ─── Vibe + font keywords ─────────────────────────────────────────────────────

const SHARP_KEYWORDS  = ['sport', 'gym', 'football', 'soccer', 'athletic', 'glimt', 'sporting', 'nike', 'adidas', 'puma', 'reebok', 'crossfit', 'boxing', 'fitness', 'rugby', 'arsenal', 'united', 'chelsea', 'liverpool', 'training', 'combat', 'tactical'];

const FONT_KEYWORDS: Record<Exclude<FontStyle, 'minimal'>, string[]> = {
  condensed: ['sport', 'gym', 'football', 'soccer', 'athletic', 'glimt', 'sporting', 'racing', 'running', 'crossfit', 'training', 'fitness', 'arena', 'stadium', 'club', 'league'],
  impact:    ['nike', 'adidas', 'puma', 'supreme', 'streetwear', 'skate', 'jordan', 'hype', 'off-white', 'boost'],
  classic:   ['luxury', 'fashion', 'jewelry', 'jewellery', 'hotel', 'wine', 'gourmet', 'boutique', 'couture', 'vogue', 'magazine', 'editorial'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDomain(url: string): string {
  try {
    const raw = url.includes('://') ? url : `https://${url}`;
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}

function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

async function extractDominantColor(imgSrc: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth  || 64;
        canvas.height = img.naturalHeight || 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const buckets: Record<string, number> = {};
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          const brightness = (r + g + b) / 3;
          if (brightness > 220 || brightness < 30) continue;
          const saturation = Math.max(r, g, b) - Math.min(r, g, b);
          if (saturation < 30) continue;
          const key = `${Math.round(r / 32) * 32},${Math.round(g / 32) * 32},${Math.round(b / 32) * 32}`;
          buckets[key] = (buckets[key] ?? 0) + 1;
        }
        const top = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
        if (!top) { resolve(null); return; }
        const [rs, gs, bs] = top[0].split(',').map(Number);
        resolve('#' + [rs, gs, bs].map(v => v.toString(16).padStart(2, '0')).join(''));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = imgSrc;
  });
}

// ─── Color Math ───────────────────────────────────────────────────────────────

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else                h = ((r - g) / d + 4) / 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hexBrightness(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** Derive the full semantic palette from a single primary hex. */
export function generatePalette(primary: string): SemanticPalette {
  const [h, s]    = hexToHsl(primary);
  const [r, g, b] = hexToRgb(primary);

  return {
    surface:         `hsl(${h}, ${Math.min(s * 0.28, 22)}%, 4%)`,
    surfaceCard:     `hsl(${h}, ${Math.min(s * 0.22, 16)}%, 7%)`,
    surfaceElevated: `hsl(${h}, ${Math.min(s * 0.16, 12)}%, 10%)`,
    muted:           `hsl(${h}, ${Math.min(s * 0.32, 22)}%, 15%)`,
    textSecondary:   `hsl(${h}, ${Math.min(s * 0.14, 10)}%, 54%)`,
    glow:            `rgba(${r},${g},${b},0.32)`,
    textOnPrimary:   hexBrightness(primary) > 165 ? '#080808' : '#ffffff',
  };
}

/** Auto-detect vibe from brand name + domain. */
export function autoVibe(brand: Pick<BrandConfig, 'name' | 'domain'>): 'modern' | 'sharp' {
  const text = (brand.name + brand.domain).toLowerCase();
  return SHARP_KEYWORDS.some(k => text.includes(k)) ? 'sharp' : 'modern';
}

/** Auto-detect font style from brand name + domain. */
export function detectFontStyle(brand: Pick<BrandConfig, 'name' | 'domain'>): FontStyle {
  const text = (brand.name + brand.domain).toLowerCase();
  for (const style of ['condensed', 'impact', 'classic'] as Exclude<FontStyle, 'minimal'>[]) {
    if (FONT_KEYWORDS[style].some(k => text.includes(k))) return style;
  }
  return 'minimal';
}

// ─── Instagram URL detection ──────────────────────────────────────────────────

function parseInstagramUrl(rawUrl: string): string | null {
  const url = rawUrl.trim();
  if (url.startsWith('@')) return url.slice(1).split(/[/?#\s]/)[0];
  if (!url.includes('instagram.com')) return null;
  const match = url.match(/instagram\.com\/([a-zA-Z0-9._]{1,30})/);
  if (!match) return null;
  const username = match[1];
  if (['p', 'reel', 'stories', 'explore', 'tv', 'accounts', 'about', 'press'].includes(username)) return null;
  return username;
}

async function resolveInstagramBrand(username: string): Promise<BrandConfig> {
  // Try matching against known presets by username / brand name
  const match = Object.entries(PRESETS).find(([domain, preset]) => {
    const domainName = domain.split('.')[0];
    const name = (preset.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const user = username.toLowerCase().replace(/[^a-z0-9]/g, '');
    return name === user || domainName === user || name.includes(user) || user.includes(domainName);
  });

  if (match) {
    const [domain, preset] = match;
    const primary = preset.primary ?? '#E1306C';
    return {
      domain:    `instagram.com/${username}`,
      name:      preset.name ?? capitalise(username),
      logoUrl:   `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
      primary,
      secondary: preset.secondary ?? lighten(primary, 40),
      vibe:      preset.vibe ?? autoVibe({ name: username, domain: username }),
      fontStyle: preset.fontStyle ?? detectFontStyle({ name: username, domain: username }),
    };
  }

  // Unknown Instagram account — use Instagram gradient pink as primary
  const name = capitalise(username);
  return {
    domain:    `instagram.com/${username}`,
    name,
    logoUrl:   `https://www.google.com/s2/favicons?domain=instagram.com&sz=128`,
    primary:   '#E1306C',
    secondary: '#833AB4',
    vibe:      autoVibe({ name, domain: username }),
    fontStyle: detectFontStyle({ name, domain: username }),
  };
}

// ─── CSS injection ────────────────────────────────────────────────────────────

function injectGoogleFont(url: string): void {
  let link = document.querySelector('link[data-brand-font]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('data-brand-font', 'true');
    document.head.appendChild(link);
  }
  if (link.href !== url) link.href = url;
}

function injectThemeStyles(brand: BrandConfig, palette: SemanticPalette): void {
  const sharp   = brand.vibe === 'sharp';
  const radius  = sharp ? '2px' : '14px';
  const fontCfg = FONT_CONFIGS[brand.fontStyle ?? 'condensed'];

  if (fontCfg.googleFontsUrl) injectGoogleFont(fontCfg.googleFontsUrl);

  let el = document.getElementById('__brand_theme__') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = '__brand_theme__';
    document.head.appendChild(el);
  }

  el.textContent = `
    :root {
      --brand-surface:         ${palette.surface};
      --brand-surface-card:    ${palette.surfaceCard};
      --brand-surface-elv:     ${palette.surfaceElevated};
      --brand-muted:           ${palette.muted};
      --brand-text-secondary:  ${palette.textSecondary};
      --brand-glow:            ${palette.glow};
      --brand-contrast:        ${palette.textOnPrimary};
      --radius-size:           ${radius};
      --font-display:          ${fontCfg.display};
      --font-body:             ${fontCfg.body};
    }

    /* ── Backgrounds ──────────────────────────────────────────────────── */
    body           { background-color: ${palette.surface} !important;
                     font-family: ${fontCfg.body} !important; }
    .bg-deep-black { background-color: ${palette.surface} !important; }
    .bg-pitch-dark { background-color: ${palette.surfaceCard} !important; }
    .bg-card-dark  { background-color: ${palette.surfaceElevated} !important; }

    /* ── Typography ───────────────────────────────────────────────────── */
    .font-display { font-family: ${fontCfg.display} !important; }
    h1, h2, h3    { font-family: ${fontCfg.display} !important; }

    /* Replace Courier monospace with brand body font for labels */
    .font-mono {
      font-family: ${fontCfg.body} !important;
      letter-spacing: 0.06em;
    }

    /* ── Borders & Text ───────────────────────────────────────────────── */
    .border-border-dark,
    .border-obsidian-border { border-color: ${palette.muted} !important; }
    .text-text-secondary    { color: ${palette.textSecondary} !important; }

    /* ── Scrollbar ────────────────────────────────────────────────────── */
    ::-webkit-scrollbar-thumb:hover { background: ${brand.primary} !important; }

    ${sharp ? `
    /* Sharp / Industrial — strip all large rounding */
    .rounded-lg, .rounded-xl, .rounded-2xl, .rounded-3xl {
      border-radius: 2px !important;
    }` : `
    /* Modern / Soft — gentle radius */
    .rounded-lg  { border-radius: 10px !important; }
    .rounded-xl  { border-radius: ${radius} !important; }
    .rounded-2xl { border-radius: ${radius} !important; }
    `}
  `;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function loadBrand(): BrandConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_BRAND, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_BRAND };
}

export function saveBrand(brand: BrandConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(brand));
}

export function resetBrand(): void {
  localStorage.removeItem(STORAGE_KEY);
  applyBrand(DEFAULT_BRAND);
}

/** Apply brand — sets CSS variables AND injects derived theme styles. */
export function applyBrand(brand: BrandConfig): void {
  const palette = generatePalette(brand.primary);
  const root    = document.documentElement;

  root.style.setProperty('--brand-primary',   brand.primary);
  root.style.setProperty('--brand-secondary', brand.secondary);
  root.style.setProperty('--brand-logo',       `url('${brand.logoUrl}')`);

  injectThemeStyles(brand, palette);
  window.dispatchEvent(new CustomEvent('brand-changed', { detail: brand }));
}

/** React hook — returns current brand and re-renders on every applyBrand() call. */
export function useBrand(): BrandConfig {
  const [brand, setBrand] = useState<BrandConfig>(loadBrand);
  useEffect(() => {
    const handler = (e: Event) => setBrand((e as CustomEvent<BrandConfig>).detail);
    window.addEventListener('brand-changed', handler);
    return () => window.removeEventListener('brand-changed', handler);
  }, []);
  return brand;
}

/**
 * Resolve brand config from a URL or @handle.
 * Handles instagram.com URLs, @usernames, and regular websites.
 */
export async function resolveBrand(rawUrl: string): Promise<BrandConfig> {
  const igUsername = parseInstagramUrl(rawUrl.trim());
  if (igUsername) return resolveInstagramBrand(igUsername);

  const domain  = parseDomain(rawUrl);
  const preset  = PRESETS[domain] ?? {};
  const favicon = faviconUrl(domain);

  let primary = preset.primary ?? null;
  if (!primary) primary = await extractDominantColor(favicon) ?? '#6366F1';

  const secondary = preset.secondary ?? lighten(primary, 40);
  const partial   = { domain, name: preset.name ?? capitalise(domain.split('.')[0]), logoUrl: favicon, primary, secondary };

  return {
    ...partial,
    vibe:      preset.vibe      ?? autoVibe(partial),
    fontStyle: preset.fontStyle ?? detectFontStyle(partial),
  };
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

function lighten(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + amount);
  const g = Math.min(255, ((num >> 8)  & 0xff) + amount);
  const b = Math.min(255, ( num        & 0xff) + amount);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
