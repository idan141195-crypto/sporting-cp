// ─── Caption Generator ─────────────────────────────────────────────────────
// GPT-4o-mini platform-specific captions + hashtags (~$0.002/call)

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok';

export interface CaptionResult {
  platform: SocialPlatform;
  caption:  string;
  hashtags: string[];
  full:     string;   // caption + "\n\n" + hashtags joined
}

const PLATFORM_GUIDE: Record<SocialPlatform, string> = {
  instagram: `Visual, aesthetic, community-focused tone.
- 1–3 short sentences max
- Warm + aspirational language
- 8–12 relevant hashtags (mix niche + broad)
- 1–2 emojis to set mood`,
  facebook:  `Direct, conversion-oriented tone.
- Clear CTA in the last sentence (Shop now / Learn more / Get yours)
- 1–2 sentences, no fluff
- 3–5 hashtags max
- No emojis unless brand uses them`,
  tiktok:    `High-energy, hook-first tone.
- FIRST LINE must be a scroll-stopping hook (question or bold statement)
- 3–4 short punchy sentences
- 5–8 trending hashtags including #fyp #foryou
- 1–3 energetic emojis`,
};

export async function generateCaption(
  prompt:      string,
  platform:    SocialPlatform,
  brandName?:  string,
  brandTone?:  string,
): Promise<CaptionResult> {
  const brandCtx = brandName
    ? `Brand: ${brandName}${brandTone ? ` · Tone: ${brandTone}` : ''}\n`
    : '';

  const res = await openai.chat.completions.create({
    model:      'gpt-4o-mini',
    max_tokens: 350,
    messages: [{
      role:    'user',
      content: `Write a ${platform.toUpperCase()} social media caption for this creative content:\n"${prompt}"\n${brandCtx}\nStyle rules:\n${PLATFORM_GUIDE[platform]}\n\nReturn ONLY valid JSON:\n{"caption":"...","hashtags":["#tag1","#tag2",...]}`,
    }],
  });

  const text  = res.choices[0].message.content ?? '';
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');

  let caption  = text;
  let hashtags: string[] = [];

  if (start !== -1 && end !== -1) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as { caption?: string; hashtags?: string[] };
      caption  = parsed.caption  ?? text;
      hashtags = parsed.hashtags ?? [];
    } catch { /* use raw text */ }
  }

  const full = hashtags.length
    ? `${caption}\n\n${hashtags.join(' ')}`
    : caption;

  return { platform, caption, hashtags, full };
}

export async function generateAllCaptions(
  prompt:     string,
  brandName?: string,
  brandTone?: string,
): Promise<CaptionResult[]> {
  return Promise.all(
    (['instagram', 'facebook', 'tiktok'] as SocialPlatform[]).map(p =>
      generateCaption(prompt, p, brandName, brandTone)
    )
  );
}
