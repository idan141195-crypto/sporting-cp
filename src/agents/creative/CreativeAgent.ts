// ─── Creative Agent ─────────────────────────────────────────────────────────────
// Tools: image gen (Flux), video gen (Luma), captions (GPT-4o-mini), brand context

import { runAgentLoop } from '../runAgentLoop';
import { CREATIVE_SYSTEM_PROMPT } from './creative.prompts';
import type { ClaudeToolDefinition, AgentAction } from '../types';
import { generate } from '../../lib/replicateApi';
import { generateCaption } from '../../lib/captionGenerator';
import { getBrand } from '../../lib/brandContext';
import type { SocialPlatform } from '../../lib/captionGenerator';
import type Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';

// Replicate model IDs
const FLUX_FAST  = 'black-forest-labs/flux-schnell';
const FLUX_HIGH  = 'black-forest-labs/flux-dev';
const LUMA_MODEL = 'luma/dream-machine';

const FORMAT_MAP: Record<string, { width: number; height: number }> = {
  '1:1':  { width: 1024, height: 1024 },
  '4:5':  { width: 1024, height: 1280 },
  '9:16': { width: 768,  height: 1344 },
  '16:9': { width: 1344, height: 768  },
};

const TOOLS: ClaudeToolDefinition[] = [
  {
    name: 'generate_image',
    description: 'Generate a marketing image using Flux AI. Returns a URL to the generated image.',
    input_schema: {
      type: 'object',
      properties: {
        prompt:  { type: 'string', description: 'Detailed visual description for image generation' },
        format:  { type: 'string', description: 'Aspect ratio: 1:1 (feed), 4:5 (feed), 9:16 (stories/reels), 16:9 (YouTube)', enum: ['1:1', '4:5', '9:16', '16:9'] },
        quality: { type: 'string', description: 'fast = Flux Schnell (seconds), high = Flux Dev (better quality)', enum: ['fast', 'high'] },
      },
      required: ['prompt', 'format'],
    },
  },
  {
    name: 'generate_video',
    description: 'Generate a short marketing video using Luma Dream Machine. Returns a URL to the generated video.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Scene description and motion direction' },
        format: { type: 'string', description: 'Aspect ratio for the video', enum: ['9:16', '16:9', '1:1'] },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_captions',
    description: 'Generate platform-specific social media captions using GPT-4o-mini.',
    input_schema: {
      type: 'object',
      properties: {
        creative_description: { type: 'string', description: 'What the creative shows — used to write the caption' },
        platform:             { type: 'string', description: 'Target social platform', enum: ['instagram', 'facebook', 'tiktok'] },
      },
      required: ['creative_description', 'platform'],
    },
  },
  {
    name: 'get_brand_context',
    description: 'Retrieve the current saved brand profile: colors, tone, industry, keywords. Call this before generating to ensure brand consistency.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

// ─── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const token = import.meta.env.VITE_REPLICATE_API_TOKEN ?? '';

  switch (name) {
    case 'generate_image': {
      const prompt  = input.prompt as string;
      const format  = (input.format as string) ?? '1:1';
      const quality = (input.quality as string) ?? 'fast';
      const model   = quality === 'high' ? FLUX_HIGH : FLUX_FAST;
      const dims    = FORMAT_MAP[format] ?? FORMAT_MAP['1:1'];

      const brand = getBrand();
      const fullPrompt = brand
        ? `${prompt}. Brand style: ${brand.tone}, ${brand.keywords.join(', ')}, color palette: ${brand.colors.slice(0, 3).join(', ')}`
        : prompt;

      const url = await generate(token, model, { prompt: fullPrompt, ...dims, num_outputs: 1 });
      return { url, format, model };
    }

    case 'generate_video': {
      const prompt = input.prompt as string;
      const brand  = getBrand();
      const fullPrompt = brand
        ? `${prompt}. Style: ${brand.tone} aesthetic, ${brand.keywords.join(', ')}`
        : prompt;

      const url = await generate(token, LUMA_MODEL, {
        prompt:          fullPrompt,
        aspect_ratio:    (input.format as string) ?? '9:16',
        loop:            false,
        duration:        5,
      });
      return { url, type: 'video' };
    }

    case 'generate_captions': {
      const description = input.creative_description as string;
      const platform    = (input.platform as SocialPlatform) ?? 'instagram';
      const brand       = getBrand();
      const result      = await generateCaption(description, platform, brand?.name, brand?.tone);
      return { platform, caption: result.caption, hashtags: result.hashtags, full: result.full };
    }

    case 'get_brand_context': {
      const brand = getBrand();
      if (!brand) return { note: 'No brand profile saved. User can add one via Settings.' };
      return {
        name:      brand.name,
        tone:      brand.tone,
        industry:  brand.industry,
        colors:    brand.colors,
        keywords:  brand.keywords,
        fontStyle: brand.fontStyle,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── Public runner ─────────────────────────────────────────────────────────────

export async function runCreativeAgent(
  userContent: string,
  history:     Anthropic.MessageParam[],
  onAction:    (action: Omit<AgentAction, 'id' | 'timestamp'>) => void,
): Promise<{ text: string; updatedHistory: Anthropic.MessageParam[] }> {
  return runAgentLoop({
    agentId:      'creative',
    model:        MODEL,
    systemPrompt: CREATIVE_SYSTEM_PROMPT,
    history,
    userContent,
    tools:        TOOLS,
    executeTool,
    onAction,
  });
}
