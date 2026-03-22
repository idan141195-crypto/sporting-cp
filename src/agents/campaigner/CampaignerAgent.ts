// ─── Campaigner Agent ──────────────────────────────────────────────────────────
// Tools: Meta Ads API operations (metaAds.ts) + social publishing (socialPublisher.ts)

import { runAgentLoop } from '../runAgentLoop';
import { CAMPAIGNER_SYSTEM_PROMPT } from './campaigner.prompts';
import type { ClaudeToolDefinition, AgentAction } from '../types';
import {
  fetchActiveAdSets, uploadAdImage, createAdCreativeFromImage,
  fetchAdSetAds, addCreativeToAdSet, replaceAdCreative,
} from '../../lib/metaAds';
import { publishToInstagram, publishToFacebook } from '../../lib/socialPublisher';
import type { MetaCredentials } from '../../lib/socialPublisher';
import type Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';

const TOOLS: ClaudeToolDefinition[] = [
  {
    name: 'fetch_active_ad_sets',
    description: 'Get all currently active Meta ad sets with their IDs, names, budgets, and status.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'fetch_ads_in_set',
    description: 'Get all ads inside a specific ad set, including their creative IDs.',
    input_schema: {
      type: 'object',
      properties: { ad_set_id: { type: 'string', description: 'The Meta ad set ID' } },
      required: ['ad_set_id'],
    },
  },
  {
    name: 'upload_ad_image',
    description: 'Upload an image from a public URL to Meta Ads and get an image hash. Required before creating an ad creative.',
    input_schema: {
      type: 'object',
      properties: { image_url: { type: 'string', description: 'Publicly accessible URL of the image to upload' } },
      required: ['image_url'],
    },
  },
  {
    name: 'create_ad_creative',
    description: 'Create a Meta ad creative from an image hash and caption text.',
    input_schema: {
      type: 'object',
      properties: {
        image_hash:    { type: 'string', description: 'Hash returned from upload_ad_image' },
        caption:       { type: 'string', description: 'Ad copy / message for the creative' },
        creative_name: { type: 'string', description: 'Name for this creative (optional)' },
      },
      required: ['image_hash', 'caption'],
    },
  },
  {
    name: 'add_creative_to_ad_set',
    description: 'Create a new ad in an existing ad set with the given creative.',
    input_schema: {
      type: 'object',
      properties: {
        ad_set_id:   { type: 'string', description: 'Target ad set ID' },
        creative_id: { type: 'string', description: 'Creative ID from create_ad_creative' },
        ad_name:     { type: 'string', description: 'Name for the new ad (optional)' },
      },
      required: ['ad_set_id', 'creative_id'],
    },
  },
  {
    name: 'replace_ad_creative',
    description: 'Swap the creative on an existing live ad without pausing it.',
    input_schema: {
      type: 'object',
      properties: {
        ad_id:       { type: 'string', description: 'Existing ad ID to update' },
        creative_id: { type: 'string', description: 'New creative ID to apply' },
      },
      required: ['ad_id', 'creative_id'],
    },
  },
  {
    name: 'publish_to_social',
    description: 'Publish an image or video to Instagram or Facebook as an organic post.',
    input_schema: {
      type: 'object',
      properties: {
        media_url:  { type: 'string', description: 'Public URL of the image or video' },
        caption:    { type: 'string', description: 'Post caption' },
        platform:   { type: 'string', description: 'Target platform', enum: ['instagram', 'facebook'] },
        media_type: { type: 'string', description: 'Type of media', enum: ['image', 'video'] },
      },
      required: ['media_url', 'caption', 'platform'],
    },
  },
];

// ─── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const adAccountId  = import.meta.env.VITE_META_AD_ACCOUNT_ID   ?? '';
  const accessToken  = import.meta.env.VITE_META_ACCESS_TOKEN     ?? '';
  const pageId       = import.meta.env.VITE_META_FACEBOOK_PAGE_ID ?? '';
  const igAccountId  = import.meta.env.VITE_META_INSTAGRAM_ACCOUNT_ID ?? '';

  if (!accessToken) {
    throw new Error('Meta access token not configured. Set VITE_META_ACCESS_TOKEN in .env.local');
  }

  switch (name) {
    case 'fetch_active_ad_sets':
      return await fetchActiveAdSets(adAccountId, accessToken);

    case 'fetch_ads_in_set':
      return await fetchAdSetAds(input.ad_set_id as string, accessToken);

    case 'upload_ad_image':
      return { hash: await uploadAdImage(adAccountId, accessToken, input.image_url as string) };

    case 'create_ad_creative': {
      const id = await createAdCreativeFromImage(
        adAccountId,
        accessToken,
        input.image_hash as string,
        input.caption    as string,
        pageId,
        (input.creative_name as string) ?? 'ScaleAI Creative',
      );
      return { creative_id: id };
    }

    case 'add_creative_to_ad_set': {
      const adId = await addCreativeToAdSet(
        adAccountId,
        accessToken,
        input.ad_set_id   as string,
        input.creative_id as string,
        (input.ad_name as string) ?? 'ScaleAI Ad',
      );
      return { ad_id: adId, status: 'ACTIVE' };
    }

    case 'replace_ad_creative':
      await replaceAdCreative(input.ad_id as string, accessToken, input.creative_id as string);
      return { success: true };

    case 'publish_to_social': {
      const platform  = input.platform  as 'instagram' | 'facebook';
      const mediaType = (input.media_type as 'image' | 'video') ?? 'image';
      const mediaUrl  = input.media_url as string;
      const caption   = input.caption   as string;
      const creds: MetaCredentials = { accessToken, instagramAccountId: igAccountId, facebookPageId: pageId, adAccountId };

      if (platform === 'instagram') {
        const postId = await publishToInstagram(mediaUrl, caption, creds, mediaType);
        return { post_id: postId, platform: 'instagram' };
      } else {
        const postId = await publishToFacebook(mediaUrl, caption, creds, mediaType);
        return { post_id: postId, platform: 'facebook' };
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── Public runner ─────────────────────────────────────────────────────────────

export async function runCampaignerAgent(
  userContent: string,
  history:     Anthropic.MessageParam[],
  onAction:    (action: Omit<AgentAction, 'id' | 'timestamp'>) => void,
): Promise<{ text: string; updatedHistory: Anthropic.MessageParam[] }> {
  return runAgentLoop({
    agentId:      'campaigner',
    model:        MODEL,
    systemPrompt: CAMPAIGNER_SYSTEM_PROMPT,
    history,
    userContent,
    tools:        TOOLS,
    executeTool,
    onAction,
  });
}
