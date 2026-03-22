import React, { useCallback, useEffect, useRef, useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import {
  runDiagnosis, detectFileType, analyzeCampaigns, analyzeFunnel, summarizeForLLM,
} from '../lib/scale-engine';
import type { DiagnosisReport } from '../lib/scale-engine';
import { Send, Sparkles, Zap } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string; role: 'user' | 'assistant'; content: string;
  timestamp: string; isReport?: boolean;
}

interface AICoachChatProps {
  uploadedFileName?: string;  uploadedFileContent?: string;
  secondFileName?: string;    secondFileContent?: string;
  dashboardContext?: string;
}

const QUICK_PROMPTS = [
  'Which campaigns to pause?',
  'Where is the funnel leaking?',
  'Geographic opportunities',
  'Exec summary',
  'What to scale now?',
];

function formatTime(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function renderContent(content: string): React.ReactNode[] {
  return content.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} style={{ color: '#67e8f9', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

function parseCSVRows(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const delim   = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delim).map(h => h.replace(/^["']|["']$/g, '').trim().toLowerCase());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(delim).map(v => v.replace(/^["']|["']$/g, '').trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
}

function buildSystemPrompt(report: DiagnosisReport | null, dashboardContext?: string): string {
  const campaignData = report && report.campaigns.length > 0
    ? (report.campaigns.length > 15
        ? summarizeForLLM(report)
        : JSON.stringify(report.campaigns.map(c => ({
            name: c.name, platform: c.platform, country: c.country,
            spend: c.spend, revenue: c.revenue, roas: +c.roas.toFixed(2),
            status: c.status, ctr: +c.ctr.toFixed(1), conversions: c.conversions,
            conversionRate: +c.conversionRate.toFixed(2),
          })), null, 2))
    : null;

  return `You are the strategic intelligence behind "ScaleAI" — an AI-powered command center for E-commerce owners. Your mission is to bridge the gap between complex marketing data (Facebook, Google, TikTok) and Shopify sales performance.

## Language & Tone
- Default language: **English**. If the user writes in Hebrew — reply in Hebrew.
- Style: Direct, executive, non-technical. Do NOT explain "how" the AI calculated it; explain "what" the business owner must do.
- Never present dry data. Every metric must be wrapped in business context.
  - Instead of "ROAS is 4.5" → say "Instagram is currently your most efficient growth channel at 4.5x ROAS"
- Always end with a clear next action.

## Core Algorithm — Go/No-Go (7-day rolling average)
- ROAS > 5.0 → **SCALE**: Recommend budget increase of +15%
- ROAS 3.0–5.0 → **OPTIMIZE**: Identify specific creative or audience fatigue
- ROAS < 3.0 → **CRITICAL**: Recommend immediate pause
- Gross Margin: 40% | Break-even ROAS = 2.5x
- **CR Guardrail**: If CR < 2% while CTR is high → prioritize landing page/checkout issues before ad creative
- Retargeting ROAS must be ≥ 2× Prospecting ROAS
- Video with high CTR but low ROAS → "Creative Trap — high engagement, zero purchase intent"

## Funnel Diagnostics
- Drop > 30% → DROP DETECTED
- Drop > 50% → FLOW OBSTACLE
- Drop Cart→Checkout > 40% → CHECKOUT FRICTION

## Insight Tiles (when asked for full analysis or "diagnosis")
Return 4–6 structured insight tiles in this exact format for each tile:
**[TILE NAME]**
Value: [primary metric]
Context: [one sentence — the "why" behind the number]
Status: [🟢 GREEN / 🟠 ORANGE / 🔴 RED]
Action: [exact next step]

## Response Format
- Use **bold** for key metrics and numbers
- Short, punchy sentences
- Every response implies an action: SCALE / PAUSE / INVESTIGATE / OPTIMIZE
${dashboardContext ? `\n## Live Dashboard Data\n${dashboardContext}` : ''}
${campaignData ? `\n## Campaign Data (${report!.campaigns.length} campaigns)\n${campaignData}` : ''}
${report && report.funnelSteps.length > 0 ? `\n## Funnel Data\n${JSON.stringify(report.funnelSteps.map(s => ({
  step: s.label, users: s.users, dropPct: +s.dropPct.toFixed(1), alert: s.alertLevel,
})), null, 2)}` : ''}
${report && report.topCountry ? `\n## Top Market: ${report.topCountry.country} | ROAS ${report.topCountry.roas.toFixed(1)}x` : ''}
${report && report.flags.length > 0 ? `\n## Active Flags\n${report.flags.map(f => `[${f.severity.toUpperCase()}] ${f.type}: ${f.message}`).join('\n')}` : ''}`;
}

// ─── Client ───────────────────────────────────────────────────────────────────

const client = new Anthropic({ apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY, dangerouslyAllowBrowser: true });

// ─── Component ────────────────────────────────────────────────────────────────

export const AICoachChat: React.FC<AICoachChatProps> = ({
  uploadedFileName, uploadedFileContent,
  secondFileName,   secondFileContent,
  dashboardContext,
}) => {
  const [messages,      setMessages]      = useState<ChatMessage[]>([{
    id: '0', role: 'assistant', timestamp: formatTime(),
    content: `ScaleAI Coach is live — powered by Claude.\n\nUpload a **CSV or Excel file** and I'll analyze it using the full Scale algorithm.\n\nOr ask me anything — I have full context of your dashboard data.`,
  }]);
  const [input,         setInput]         = useState('');
  const [isTyping,      setIsTyping]      = useState(false);
  const [report,        setReport]        = useState<DiagnosisReport | null>(null);
  const [contextFiles,  setContextFiles]  = useState<string[]>([]);
  const [isDiagnosing,  setIsDiagnosing]  = useState(false);
  const [historyForApi, setHistoryForApi] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 300); }, []);

  const addAssistantMessage = (content: string, isReport = false) => {
    const msg: ChatMessage = { id: Date.now().toString(), role: 'assistant', content, timestamp: formatTime(), isReport };
    setMessages(p => [...p, msg]);
    setHistoryForApi(p => [...p, { role: 'assistant', content }]);
  };

  const processFile = useCallback((fileName: string, content: string) => {
    const rows = parseCSVRows(content);
    if (rows.length === 0) return;
    const fileType  = detectFileType(rows);
    setContextFiles(prev => prev.includes(fileName) ? prev : [...prev, fileName]);
    const newReport = runDiagnosis(uploadedFileContent ?? content, secondFileContent);
    setReport(newReport);

    let summary = '';
    if (fileType === 'campaigns') {
      const campaigns = analyzeCampaigns(rows);
      const scalers   = campaigns.filter(c => c.status === 'SCALE').length;
      const critical  = campaigns.filter(c => c.status === 'CRITICAL').length;
      const topRoas   = Math.max(...campaigns.map(c => c.roas));
      summary = `**${fileName}** loaded — ${rows.length} campaigns detected.\n\n⚡ **${scalers} SCALE** · ⚙️ **${campaigns.filter(c=>c.status==='OPTIMIZE').length} OPTIMIZE** · 🟥 **${critical} CRITICAL**\nTop ROAS: **${topRoas.toFixed(1)}x**\n\nAsk me anything or run Full Diagnosis for a complete breakdown.`;
    } else if (fileType === 'funnel') {
      const steps   = analyzeFunnel(rows);
      const leaks   = steps.filter(s => s.alertLevel !== 'none');
      const maxDrop = steps.length > 1 ? Math.max(...steps.map(s => s.dropPct)) : 0;
      summary = `**${fileName}** loaded — ${rows.length} funnel steps.\n\n${leaks.length > 0 ? `💧 **${leaks.length} leak(s)** found. Biggest drop: **${maxDrop.toFixed(0)}%**` : '✅ Funnel looks healthy.'}\n\nType "full diagnosis" for a complete breakdown.`;
    } else {
      summary = `**${fileName}** loaded (${rows.length} rows).\n\nColumns: ${Object.keys(rows[0] ?? {}).slice(0, 6).join(', ')}...\n\nWhat would you like to know?`;
    }
    addAssistantMessage(summary);
  }, [uploadedFileContent, secondFileContent]);

  useEffect(() => { if (uploadedFileName && uploadedFileContent) processFile(uploadedFileName, uploadedFileContent); }, [uploadedFileName, uploadedFileContent]);
  useEffect(() => { if (secondFileName   && secondFileContent)   processFile(secondFileName,   secondFileContent);   }, [secondFileName, secondFileContent]);
  useEffect(() => { if (uploadedFileContent || secondFileContent) setReport(runDiagnosis(uploadedFileContent, secondFileContent)); }, [uploadedFileContent, secondFileContent]);

  const callClaude = async (userMessage: string) => {
    setIsTyping(true);
    const newHistory = [...historyForApi, { role: 'user' as const, content: userMessage }];
    setHistoryForApi(newHistory);
    const msgId = Date.now().toString();
    setMessages(p => [...p, { id: msgId, role: 'assistant', content: '', timestamp: formatTime() }]);

    try {
      let accumulated = '';
      const stream = client.messages.stream({
        model: 'claude-sonnet-4-6', max_tokens: 1024,
        system: buildSystemPrompt(report, dashboardContext),
        messages: newHistory,
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          accumulated += event.delta.text;
          setMessages(p => p.map(m => m.id === msgId ? { ...m, content: accumulated } : m));
        }
      }
      setHistoryForApi(p => [...p, { role: 'assistant', content: accumulated }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages(p => p.map(m => m.id === msgId ? { ...m, content: `Connection error: ${msg}` } : m));
    } finally { setIsTyping(false); }
  };

  const runFullDiagnosis = async () => {
    if (isDiagnosing) return;
    setIsDiagnosing(true);
    const currentReport = report ?? runDiagnosis(uploadedFileContent, secondFileContent);
    setReport(currentReport);

    const funnelCtx = currentReport.funnelSteps.length > 0
      ? `\n\nFUNNEL:\n${currentReport.funnelSteps.map(s => `${s.label}: ${s.users.toLocaleString()} users | drop: ${s.dropPct.toFixed(1)}% | alert: ${s.alertLevel}`).join('\n')}` : '';
    const flagCtx   = currentReport.flags.length > 0
      ? `\n\nFLAGS:\n${currentReport.flags.map(f => `[${f.severity.toUpperCase()}] ${f.type}: ${f.message} → Fix: ${f.recommendation}`).join('\n')}` : '';
    const convCtx   = currentReport.campaigns.length > 0
      ? `\n\nCONVERSION: Blended ROAS ${currentReport.blendedRoas.toFixed(2)}x | Revenue $${currentReport.totalRevenue.toLocaleString()} | Spend $${currentReport.totalSpend.toLocaleString()}\nCritical: ${currentReport.criticalCampaigns.length} | Checkout friction: ${currentReport.checkoutFriction ? 'YES' : 'NO'}` : '';

    await callClaude(`You are "Scale" — a Shopify & E-commerce Website Technical Auditor.\n\nRun a FULL SITE TECHNICAL DIAGNOSIS. Find website bugs, UX blockers, and technical faults.\n\n🔴 CRITICAL BLOCKERS (revenue-stopping bugs): checkout errors, cart abandonment triggers, 404s, mobile checkout broken, PageSpeed < 50\n\n🟠 CONVERSION KILLERS: missing trust badges, add-to-cart below fold, slow images, price not visible, CLS issues\n\n🟡 UX FRICTION: deep navigation, no sticky header, inconsistent fonts, popup blocking checkout\n\n⚪ TECHNICAL: duplicate meta, missing alt text, broken schema, sync scripts in head\n\nSCORING: critical=-20pts, conversion killer=-10pts, UX friction=-5pts, start at 100.\n\n${funnelCtx}${flagCtx}${convCtx}\n\nOUTPUT: 1) Site Health Score 2) Issues by category 3) TOP 3 priority fixes 4) One quick win < 1 hour`);
    setIsDiagnosing(false);
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;
    setMessages(p => [...p, { id: Date.now().toString(), role: 'user', content: trimmed, timestamp: formatTime() }]);
    setInput('');
    if (/full diagnosis|diagnos|full report|analyze all|run analysis/.test(trimmed.toLowerCase())) {
      await runFullDiagnosis(); return;
    }
    await callClaude(trimmed);
  };

  const hasData = (report?.campaigns.length ?? 0) > 0 || (report?.funnelSteps.length ?? 0) > 0 || !!dashboardContext;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: '#080808', border: '1px solid #1a2332',
      borderRadius: 16, overflow: 'hidden',
      height: 'calc(100vh - 180px)', minHeight: 520,
    }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid #1a2332',
        background: '#0d1117', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'linear-gradient(135deg, #06b6d4, #0284c7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, position: 'relative',
            boxShadow: '0 0 20px rgba(6,182,212,0.3)',
          }}>
            <Sparkles size={17} color="#fff" />
            <div style={{
              position: 'absolute', bottom: -1, right: -1,
              width: 10, height: 10, borderRadius: '50%',
              background: '#22c55e', border: '2px solid #0d1117',
            }} />
          </div>
          <div>
            <div style={{ color: '#f9fafb', fontWeight: 800, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              AI Coach
            </div>
            <div style={{ color: hasData ? '#67e8f9' : '#22c55e', fontSize: 10, marginTop: 2, fontFamily: 'monospace' }}>
              ● {hasData ? (contextFiles.length > 0 ? `${contextFiles.length} file(s) loaded` : 'Dashboard data active') : 'Claude connected'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {contextFiles.map(f => (
            <span key={f} style={{
              background: '#06b6d412', border: '1px solid #06b6d430', color: '#67e8f9',
              fontSize: 9, padding: '3px 9px', borderRadius: 20, fontFamily: 'monospace',
              maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {f.split('.')[0]}
            </span>
          ))}
          <button
            onClick={runFullDiagnosis}
            disabled={isDiagnosing || isTyping}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 9, fontWeight: 700, fontSize: 11,
              cursor: isDiagnosing || isTyping ? 'not-allowed' : 'pointer', border: 'none',
              background: isDiagnosing || isTyping ? '#1f2937' : 'linear-gradient(135deg, #06b6d4, #0284c7)',
              color: isDiagnosing || isTyping ? '#4b5563' : '#fff',
              letterSpacing: '0.05em', textTransform: 'uppercase',
              boxShadow: isDiagnosing || isTyping ? 'none' : '0 0 16px rgba(6,182,212,0.35)',
            }}>
            {isDiagnosing
              ? <><span style={{ animation: 'spin 1.5s linear infinite', display: 'inline-block' }}>⚽</span> Analysing…</>
              : <><Zap size={12} /> Full Site Diagnosis</>}
          </button>
        </div>
      </div>

      {/* ── Messages feed ───────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '18px 24px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {messages.map(msg => (
          <div key={msg.id} style={{
            display: 'flex',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            gap: 10, alignItems: 'flex-start',
            maxWidth: 780, width: '100%',
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>

            {msg.role === 'assistant' && (
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'linear-gradient(135deg, #06b6d4, #0284c7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 2,
              }}>
                <Sparkles size={13} color="#fff" />
              </div>
            )}

            <div style={msg.role === 'user' ? {
              maxWidth: '75%', background: '#06b6d410',
              border: '1px solid #06b6d430',
              borderRadius: '14px 14px 4px 14px',
              padding: '10px 14px', color: '#a5f3fc',
              fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
            } : msg.isReport ? {
              flex: 1, background: '#0d1117',
              border: '1px solid #06b6d430',
              borderRadius: '4px 14px 14px 14px',
              padding: '12px 16px', color: '#d1d5db',
              fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap',
            } : {
              flex: 1, background: '#0d1117',
              border: '1px solid #1a2332',
              borderRadius: '4px 14px 14px 14px',
              padding: '12px 16px', color: '#d1d5db',
              fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap',
            }}>
              {msg.isReport && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #1a2332' }}>
                  <span style={{ color: '#67e8f9', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em' }}>⚡ Scale Diagnosis Report</span>
                </div>
              )}
              <p style={{ margin: 0 }}>{renderContent(msg.content)}</p>
              {msg.content === '' && (
                <span style={{ display: 'inline-block', width: 7, height: 15, background: '#06b6d4', borderRadius: 2, animation: 'pulse 1s ease-in-out infinite' }} />
              )}
              <p style={{ color: '#374151', fontSize: 9, marginTop: 7, fontFamily: 'monospace' }}>{msg.timestamp}</p>
            </div>
          </div>
        ))}

        {isTyping && messages[messages.length - 1]?.content !== '' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'linear-gradient(135deg, #06b6d4, #0284c7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Sparkles size={13} color="#fff" />
            </div>
            <div style={{
              background: '#0d1117', border: '1px solid #1a2332',
              borderRadius: '4px 14px 14px 14px',
              padding: '14px 18px', display: 'flex', gap: 5, alignItems: 'center',
            }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 7, height: 7, borderRadius: '50%', background: '#06b6d4',
                  display: 'inline-block',
                  animation: 'bounce 1s ease-in-out infinite',
                  animationDelay: `${i * 0.15}s`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Quick prompts ───────────────────────────────────────────────────── */}
      <div style={{ padding: '8px 24px', display: 'flex', gap: 7, overflowX: 'auto', flexShrink: 0, borderTop: '1px solid #0f1923' }}>
        {QUICK_PROMPTS.map(p => (
          <button key={p} onClick={() => sendMessage(p)} disabled={isTyping}
            style={{ flexShrink: 0, fontSize: 11, padding: '6px 14px', background: '#0d1117', border: '1px solid #1a2332', color: '#4b5563', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#06b6d4'; (e.currentTarget as HTMLElement).style.color = '#67e8f9'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1a2332'; (e.currentTarget as HTMLElement).style.color = '#4b5563'; }}>
            {p}
          </button>
        ))}
      </div>

      {/* ── Input bar ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '12px 24px 18px', borderTop: '1px solid #1a2332', flexShrink: 0, background: '#080808' }}>
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-end',
          background: '#0d1117',
          border: `1px solid ${input ? '#06b6d450' : '#1a2332'}`,
          borderRadius: 14, padding: '12px 14px', transition: 'border-color 0.2s',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Ask the Coach…  (↵ send · Shift+↵ newline)"
            rows={1}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f9fafb', fontSize: 13, resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, maxHeight: 100, overflowY: 'auto' }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isTyping}
            style={{
              width: 38, height: 38, borderRadius: 10,
              background: input.trim() && !isTyping ? 'linear-gradient(135deg, #06b6d4, #0284c7)' : '#1f2937',
              border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() && !isTyping ? 'pointer' : 'default',
              flexShrink: 0, transition: 'background 0.2s',
              boxShadow: input.trim() && !isTyping ? '0 0 14px rgba(6,182,212,0.4)' : 'none',
            }}>
            <Send size={15} color={input.trim() && !isTyping ? '#fff' : '#374151'} />
          </button>
        </div>
        <div style={{ color: '#1f2937', fontSize: 10, textAlign: 'center', marginTop: 7, fontFamily: 'monospace' }}>
          Claude Sonnet · {hasData ? (contextFiles.length > 0 ? contextFiles.join(' + ') : 'Dashboard data') : 'Ready'}
        </div>
      </div>

      <style>{`
        @keyframes spin    { from { transform: rotate(0)   } to { transform: rotate(360deg) } }
        @keyframes pulse   { 0%,100% { opacity: 0.4 } 50% { opacity: 1 } }
        @keyframes bounce  { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
      `}</style>
    </div>
  );
};

export default AICoachChat;
