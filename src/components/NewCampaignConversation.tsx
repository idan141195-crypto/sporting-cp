// ─── New Campaign Conversation ────────────────────────────────────────────────
// Replaces the static NewCampaignPanel with a conversational Campaigner Agent UI.
// Slides in from the right (same CSS pattern as the existing settings/campaign panels).

import React, { useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { AGENT_META } from '../agents/types';
import { AgentChatPanel } from './AgentChatPanel';
import { useAgentBus } from '../agents/AgentContext';

interface NewCampaignConversationProps {
  isOpen:   boolean;
  onClose:  () => void;
}

const CAMPAIGNER_GREETING =
  "I'm your **Ads Manager**. Let's build a campaign together.\n\n" +
  "To get started, tell me:\n" +
  "1. **What product or offer** are you promoting?\n" +
  "2. **What's the goal?** (Purchases / Traffic / Awareness)\n" +
  "3. **Daily budget** and target audience\n\n" +
  "I'll fetch your active ad sets and propose the best structure.";

export const NewCampaignConversation: React.FC<NewCampaignConversationProps> = ({ isOpen, onClose }) => {
  const { setActiveAgent } = useAgentBus();
  const meta = AGENT_META['campaigner'];

  // When the panel opens, switch the Agent Hub focus to Campaigner
  useEffect(() => {
    if (isOpen) setActiveAgent('campaigner');
  }, [isOpen, setActiveAgent]);

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30"
          onClick={onClose}
          style={{ background: 'rgba(0,0,0,0.25)' }}
        />
      )}

      {/* Slide-in panel */}
      <div
        className="fixed top-0 right-0 h-full z-40 flex flex-col transition-transform duration-300"
        style={{
          width:      '460px',
          background: 'var(--brand-surface-card)',
          borderLeft: '1px solid var(--brand-muted)',
          transform:  isOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {/* ── Header ── */}
        <div
          className="shrink-0 flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--brand-muted)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: `${meta.color}20`, border: `1px solid ${meta.color}40` }}
            >
              <Plus size={15} color={meta.color} />
            </div>
            <div>
              <p className="text-white font-black text-sm uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>
                New Campaign
              </p>
              <p className="text-[10px] font-mono mt-0.5" style={{ color: meta.color }}>
                Powered by {meta.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
          >
            <X size={13} color="#9ca3af" />
          </button>
        </div>

        {/* ── Conversation ── */}
        <div className="flex-1 min-h-0">
          <AgentChatPanel
            agentId="campaigner"
            greeting={CAMPAIGNER_GREETING}
            placeholder="Describe your campaign goal…"
          />
        </div>
      </div>
    </>
  );
};
