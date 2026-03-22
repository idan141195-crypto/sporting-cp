// ─── Analyst Agent ─────────────────────────────────────────────────────────────
// Tools: campaign diagnosis (scale-engine), Meta ad set fetching

import { runAgentLoop } from '../runAgentLoop';
import { ANALYST_SYSTEM_PROMPT } from './analyst.prompts';
import type { ClaudeToolDefinition, AgentAction } from '../types';
import { fetchActiveAdSets } from '../../lib/metaAds';
import { runDiagnosis, summarizeForLLM } from '../../lib/scale-engine';

const MODEL = 'claude-sonnet-4-6';

const TOOLS: ClaudeToolDefinition[] = [
  {
    name: 'fetch_active_ad_sets',
    description: 'Retrieve all currently active Meta ad sets with budget, status, and spend data.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'run_campaign_diagnosis',
    description: 'Run the Zolter intelligence engine on current campaign data. Returns SCALE/OPTIMIZE/CRITICAL status, flags, funnel health, and geo analysis. Use this for deep performance analysis.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_scale_decisions',
    description: 'Get the current SCALE / OPTIMIZE / CRITICAL decisions grouped by status.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_top_performers',
    description: 'Return the top campaigns ranked by ROAS.',
    input_schema: {
      type: 'object',
      properties: {
        n:              { type: 'string', description: 'Number of top results to return (default 3)' },
        roas_threshold: { type: 'string', description: 'Minimum ROAS to qualify (default 4.0)' },
      },
      required: [],
    },
  },
  {
    name: 'identify_fatigue',
    description: 'Detect campaigns showing a decaying trend signal — high spend but falling ROAS.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

// ─── Tool executor ─────────────────────────────────────────────────────────────

function makeExecutor(pairs: unknown[]) {
  return async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
    const adAccountId = import.meta.env.VITE_META_AD_ACCOUNT_ID ?? '';
    const accessToken = import.meta.env.VITE_META_ACCESS_TOKEN ?? '';

    switch (name) {
      case 'fetch_active_ad_sets': {
        if (!adAccountId || !accessToken) {
          return { note: 'Meta credentials not configured. Using demo data.', pairs };
        }
        return await fetchActiveAdSets(adAccountId, accessToken);
      }

      case 'run_campaign_diagnosis': {
        const report = runDiagnosis(undefined, undefined);
        return {
          blendedRoas:        report.blendedRoas,
          totalSpend:         report.totalSpend,
          totalRevenue:       report.totalRevenue,
          checkoutFriction:   report.checkoutFriction,
          biggestLeak:        report.biggestLeak,
          flags:              report.flags.map(f => ({ type: f.type, severity: f.severity, message: f.message, recommendation: f.recommendation })),
          summary:            summarizeForLLM(report),
          campaigns:          report.campaigns.map(c => ({
            name: c.name, roas: c.roas, status: c.status,
            spend: c.spend, trendSignal: c.trendSignal,
            ctr: c.ctr, conversionRate: c.conversionRate,
          })),
        };
      }

      case 'get_scale_decisions': {
        const report = runDiagnosis(undefined, undefined);
        const scale    = report.campaigns.filter(c => c.status === 'SCALE').map(c => ({ name: c.name, roas: c.roas }));
        const optimize = report.campaigns.filter(c => c.status === 'OPTIMIZE').map(c => ({ name: c.name, roas: c.roas }));
        const critical = report.campaigns.filter(c => c.status === 'CRITICAL').map(c => ({ name: c.name, roas: c.roas }));
        return { scale, optimize, critical };
      }

      case 'get_top_performers': {
        const n = parseInt((input.n as string) ?? '3', 10);
        const threshold = parseFloat((input.roas_threshold as string) ?? '4.0');
        const report = runDiagnosis(undefined, undefined);
        return report.campaigns
          .filter(c => c.roas >= threshold)
          .sort((a, b) => b.roas - a.roas)
          .slice(0, n)
          .map(c => ({ name: c.name, roas: c.roas, spend: c.spend, status: c.status }));
      }

      case 'identify_fatigue': {
        const report = runDiagnosis(undefined, undefined);
        return report.campaigns
          .filter(c => c.trendSignal === 'decaying')
          .map(c => ({ name: c.name, roas: c.roas, ctr: c.ctr, trendSignal: c.trendSignal }));
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  };
}

// ─── Public runner ─────────────────────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk';

export async function runAnalystAgent(
  userContent:  string,
  history:      Anthropic.MessageParam[],
  pairs:        unknown[],
  onAction:     (action: Omit<AgentAction, 'id' | 'timestamp'>) => void,
): Promise<{ text: string; updatedHistory: Anthropic.MessageParam[] }> {
  return runAgentLoop({
    agentId:      'analyst',
    model:        MODEL,
    systemPrompt: ANALYST_SYSTEM_PROMPT,
    history,
    userContent,
    tools:        TOOLS,
    executeTool:  makeExecutor(pairs),
    onAction,
  });
}
