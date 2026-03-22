// ─── Orchestrator Agent ────────────────────────────────────────────────────────
// Tools: delegates to Analyst, Creative, Campaigner via the AgentContext dispatch

import { runAgentLoop } from '../runAgentLoop';
import { ORCHESTRATOR_SYSTEM_PROMPT } from './orchestrator.prompts';
import type { ClaudeToolDefinition, AgentAction } from '../types';
import { runAnalystAgent } from '../analyst/AnalystAgent';
import { runCreativeAgent } from '../creative/CreativeAgent';
import { runCampaignerAgent } from '../campaigner/CampaignerAgent';
import type Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

const TOOLS: ClaudeToolDefinition[] = [
  {
    name: 'ask_analyst',
    description: 'Ask the Analyst agent to retrieve performance data, ROAS scores, top/bottom campaigns, or creative fatigue signals.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'What you need from the Analyst — be specific' },
      },
      required: ['question'],
    },
  },
  {
    name: 'ask_creative',
    description: 'Ask the Creative Studio agent to generate images, videos, or platform-specific captions.',
    input_schema: {
      type: 'object',
      properties: {
        task:    { type: 'string', description: 'What to generate (image/video/captions)' },
        context: { type: 'string', description: 'Brand info or Analyst findings to guide generation' },
      },
      required: ['task'],
    },
  },
  {
    name: 'ask_campaigner',
    description: 'Ask the Ads Manager agent to structure campaigns, attach creatives to ad sets, or publish live ads.',
    input_schema: {
      type: 'object',
      properties: {
        task:    { type: 'string', description: 'What campaign action to perform' },
        context: { type: 'string', description: 'Relevant context: creative URLs, ad set IDs, or Analyst decisions' },
      },
      required: ['task'],
    },
  },
  {
    name: 'respond_to_user',
    description: 'Send the final consolidated response to the user after completing all sub-tasks.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Final response to show the user' },
      },
      required: ['message'],
    },
  },
];

// ─── Sub-agent histories (kept in closure to maintain conversation state) ──────
// In the orchestrator, sub-agents are called fresh each time (no persistent history
// across orchestrator turns) to keep sub-tasks independent and focused.

// ─── Tool executor ─────────────────────────────────────────────────────────────

function makeExecutor(
  pairs:    unknown[],
  onAction: (action: Omit<AgentAction, 'id' | 'timestamp'>) => void,
) {
  return async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'ask_analyst': {
        const result = await runAnalystAgent(
          input.question as string,
          [],                // fresh history for sub-task
          pairs,
          onAction,
        );
        return result.text;
      }

      case 'ask_creative': {
        const combined = input.context
          ? `${input.task}\n\nContext from analysis: ${input.context}`
          : input.task as string;
        const result = await runCreativeAgent(combined, [], onAction);
        return result.text;
      }

      case 'ask_campaigner': {
        const combined = input.context
          ? `${input.task}\n\nContext: ${input.context}`
          : input.task as string;
        const result = await runCampaignerAgent(combined, [], onAction);
        return result.text;
      }

      case 'respond_to_user':
        // The orchestrator uses this to signal its final answer;
        // the text is returned via the normal end_turn flow too.
        return { delivered: true, message: input.message };

      default:
        throw new Error(`Unknown orchestrator tool: ${name}`);
    }
  };
}

// ─── Public runner ─────────────────────────────────────────────────────────────

export async function runOrchestratorAgent(
  userContent: string,
  history:     Anthropic.MessageParam[],
  pairs:       unknown[],
  onAction:    (action: Omit<AgentAction, 'id' | 'timestamp'>) => void,
): Promise<{ text: string; updatedHistory: Anthropic.MessageParam[] }> {
  return runAgentLoop({
    agentId:      'orchestrator',
    model:        MODEL,
    systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
    history,
    userContent,
    tools:        TOOLS,
    executeTool:  makeExecutor(pairs, onAction),
    onAction,
    maxRounds:    15,    // orchestrator may need more rounds for complex multi-agent flows
  });
}
