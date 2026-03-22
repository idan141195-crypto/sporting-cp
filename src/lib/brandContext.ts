// ─── Brand Context ─────────────────────────────────────────────────────────
// Stores brand profile in localStorage and provides prompt-building utilities.

export interface BrandProfile {
  url:       string;
  name:      string;
  colors:    string[];   // hex values extracted from site
  fontStyle: string;     // e.g. 'minimalist sans-serif', 'luxury serif', 'bold display'
  tone:      string;     // 'luxury' | 'aggressive' | 'soft' | 'playful' | 'professional'
  industry:  string;
  keywords:  string[];   // 3–5 style descriptors
  scannedAt: string;
}

const LS_KEY = 'scaleai_brand_v2';

export function getBrand(): BrandProfile | null {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? 'null'); } catch { return null; }
}

export function saveBrand(p: BrandProfile): void {
  localStorage.setItem(LS_KEY, JSON.stringify(p));
}

export function clearBrand(): void {
  localStorage.removeItem(LS_KEY);
}

// Build the suffix that gets appended to every generation prompt when brand is active
export function brandPromptSuffix(p: BrandProfile): string {
  const parts: string[] = [];
  if (p.colors.length)   parts.push(`color palette: ${p.colors.slice(0, 4).join(', ')}`);
  if (p.tone)            parts.push(`${p.tone} tone`);
  if (p.fontStyle)       parts.push(`${p.fontStyle} aesthetic`);
  if (p.keywords.length) parts.push(p.keywords.join(', '));
  return parts.length
    ? `. Brand style guide: ${parts.join(' · ')}.`
    : '';
}

// ── Brand scanner ──────────────────────────────────────────────────────────
// Fetches the site via CORS proxy, strips HTML, then uses Claude to analyze.
// callAI: (prompt) => string  (inject claude/openai caller from outside)

export async function scanBrand(
  url:    string,
  callAI: (systemPrompt: string, userMsg: string) => Promise<string>,
): Promise<BrandProfile> {
  // CORS proxy — fetch raw HTML
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  const proxyRes = await fetch(proxyUrl, { signal: AbortSignal.timeout(20000) });
  if (!proxyRes.ok) throw new Error(`Could not reach site (${proxyRes.status})`);

  const data = await proxyRes.json();
  const html = (data.contents as string) ?? '';

  // Extract CSS hex colors
  const hexes = [...html.matchAll(/#([0-9a-fA-F]{6})\b/g)]
    .map(m => `#${m[1].toUpperCase()}`)
    .filter((c, i, a) => a.indexOf(c) === i)
    .slice(0, 8);

  // Strip HTML for text content
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 3500);

  const response = await callAI(
    'You are a brand analyst. Extract concise brand attributes from website content.',
    `URL: ${url}\nCSS colors found: ${hexes.join(', ')}\n\nPage content:\n${text}\n\nReturn ONLY a JSON object with these keys:\n{"name":"Brand Name","colors":["#HEX1","#HEX2","#HEX3"],"fontStyle":"minimalist sans-serif","tone":"luxury","industry":"fashion","keywords":["premium","dark","sleek"]}`,
  );

  const start = response.indexOf('{');
  const end   = response.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Could not parse brand data');
  const parsed = JSON.parse(response.slice(start, end + 1)) as Partial<BrandProfile>;

  return {
    url,
    name:      parsed.name      ?? new URL(url).hostname,
    colors:    parsed.colors    ?? hexes.slice(0, 3),
    fontStyle: parsed.fontStyle ?? 'sans-serif',
    tone:      parsed.tone      ?? 'professional',
    industry:  parsed.industry  ?? '',
    keywords:  parsed.keywords  ?? [],
    scannedAt: new Date().toISOString(),
  };
}
