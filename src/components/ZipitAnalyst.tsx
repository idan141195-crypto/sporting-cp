// ─── Zipit Analyst ────────────────────────────────────────────────────────────
// Auto-running AI analyst: campaigns every 15min, file analysis on upload,
// site & server health checks. Replaces the old Report Center.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, RefreshCw, CheckCircle, XCircle,
  Clock, Upload, X, TrendingUp, TrendingDown, Minus,
  Wifi, WifiOff, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useAgentBus } from '../agents/AgentContext';
import { AGENT_META } from '../agents/types';
import type { AgentAction } from '../agents/types';
import { FileUploader } from './FileUploader';
import { LiveInsightsTiles } from './LiveInsightsTiles';
import { runDiagnosis, parseCSV, detectFileType } from '../lib/scale-engine';
import type { DiagnosisReport } from '../lib/scale-engine';
import type { UploadedFile } from './FileUploader';
import type { CampaignPair } from './CampaignView';

const AUTO_INTERVAL_MS  = 15 * 60 * 1000;  // 15 minutes
const AGENT_COLOR       = AGENT_META.analyst.color;

// ─── Props ────────────────────────────────────────────────────────────────────

interface ZipitAnalystProps {
  pairs:           CampaignPair[];
  dashboardContext?: string;
  siteHealth:      string;
  isLive:          boolean;
  onOpenChat?:     () => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CountdownBadge({ nextRunAt }: { nextRunAt: number }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.round((nextRunAt - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [nextRunAt]);

  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return (
    <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', color: '#06b6d4' }}>
      next: {m}:{s.toString().padStart(2, '0')}
    </span>
  );
}

function DecisionChip({ decision }: { decision: string }) {
  const map: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
    SCALE:    { color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: <TrendingUp  size={10} /> },
    OPTIMIZE: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: <Minus       size={10} /> },
    PAUSE:    { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   icon: <TrendingDown size={10} /> },
    HOLD:     { color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: <Minus       size={10} /> },
  };
  const style = map[decision] ?? map['HOLD'];
  return (
    <span className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded"
      style={{ background: style.bg, color: style.color }}>
      {style.icon}{decision}
    </span>
  );
}

function renderContent(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} style={{ color: '#e2e8f0', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

function ActionEntry({ action }: { action: AgentAction }) {
  const time = new Date(action.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div className="flex items-start gap-2.5 py-2 border-b last:border-b-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
      <span className="shrink-0 mt-0.5">
        {action.status === 'success'
          ? <CheckCircle size={11} color="#10b981" />
          : action.status === 'error'
          ? <XCircle size={11} color="#ef4444" />
          : <Clock size={11} color="#f59e0b" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] truncate" style={{ color: '#d1d5db' }}>{action.label}</p>
        {action.detail && (
          <p className="text-[10px] font-mono mt-0.5 truncate" style={{ color: '#4b5563' }}>{action.detail}</p>
        )}
      </div>
      <span className="shrink-0 text-[10px] font-mono" style={{ color: '#374151' }}>{time}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const ZipitAnalyst: React.FC<ZipitAnalystProps> = ({
  pairs, dashboardContext, siteHealth, onOpenChat,
}) => {
  const { state, dispatch } = useAgentBus();
  const conv    = state.conversations.analyst;
  const actions = state.actionLog.filter(a => a.agentId === 'analyst').slice(0, 12);

  const isRunning    = conv.status === 'THINKING' || conv.status === 'WORKING';
  const lastResponse = [...conv.messages].reverse().find(m => m.from === 'analyst');

  // ── Auto-run timer ─────────────────────────────────────────────────────────
  const [nextRunAt, setNextRunAt] = useState(Date.now() + AUTO_INTERVAL_MS);
  const [runCount,  setRunCount]  = useState(0);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  // ── File state ─────────────────────────────────────────────────────────────
  const [allFiles,     setAllFiles]     = useState<UploadedFile[]>([]);
  const [liveReport,   setLiveReport]   = useState<DiagnosisReport | null>(null);
  const [secondFile,   setSecondFile]   = useState<UploadedFile | null>(null);
  const [uploaderKey,  setUploaderKey]  = useState(0);
  const allFilesRef = useRef<UploadedFile[]>([]);

  // ── Site health ────────────────────────────────────────────────────────────
  const healthOk = siteHealth === 'OK' || siteHealth === 'GREEN';

  // ── Build analyst prompt ───────────────────────────────────────────────────
  const buildAutoPrompt = useCallback((fileContext?: string) => {
    const campaignSummary = pairs.slice(0, 8).map(p =>
      `• ${p.adSetName}: ROAS ${p.roas?.toFixed(1) ?? 'N/A'}x | Spend $${p.spend?.toFixed(0) ?? '0'} | Status: ${p.adSetStatus} | Decision: ${p.liveDecision}`
    ).join('\n');

    const healthStr = healthOk
      ? '✅ Site health: OK'
      : `⚠️ Site health: ${siteHealth}`;

    const fileStr = fileContext
      ? `\n\nUploaded file data for analysis:\n${fileContext.slice(0, 2000)}`
      : '';

    return `Auto-check run #${runCount + 1}. Analyze everything and give me a concise action plan.

Live campaign data:
${campaignSummary || 'No campaign data available.'}

${healthStr}
${dashboardContext ? `\nDashboard context: ${dashboardContext.slice(0, 500)}` : ''}${fileStr}

Tasks:
1. Identify which campaigns to SCALE, OPTIMIZE, or PAUSE based on ROAS
2. Flag any site health issues
3. If file data provided, analyze it and surface key insights
4. Give me 3 priority actions right now`;
  }, [pairs, healthOk, siteHealth, dashboardContext, runCount]);

  // ── Run analyst ────────────────────────────────────────────────────────────
  const runAnalyst = useCallback(async (fileContext?: string) => {
    if (isRunning) return;
    const prompt = buildAutoPrompt(fileContext);
    setLastRunAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    setRunCount(c => c + 1);
    setNextRunAt(Date.now() + AUTO_INTERVAL_MS);
    await dispatch({ from: 'user', to: 'analyst', content: prompt });
  }, [isRunning, buildAutoPrompt, dispatch]);

  // ── Auto 15-min schedule ───────────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      runAnalyst();
    }, AUTO_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [runAnalyst]);

  // ── File handling ──────────────────────────────────────────────────────────
  const applyFiles = (files: UploadedFile[]) => {
    setAllFiles(files);
    setSecondFile(files[1] ?? null);
    allFilesRef.current = files;

    const campaignTexts: string[] = [];
    const funnelTexts:   string[] = [];
    for (const f of files) {
      const rows = parseCSV(f.content);
      const type = detectFileType(rows);
      if (type === 'funnel') funnelTexts.push(f.content);
      else campaignTexts.push(f.content);
    }

    const merged = [...campaignTexts, ...funnelTexts].join('\n\n');
    const report = runDiagnosis(campaignTexts.join('\n') || undefined, funnelTexts.join('\n') || undefined);
    setLiveReport(report);

    // Auto-trigger analyst with file content
    runAnalyst(merged.slice(0, 3000));
  };

  const handleFilesLoaded = (files: UploadedFile[]) => {
    const merged = [...allFilesRef.current];
    for (const f of files) {
      if (!merged.find(x => x.name === f.name)) merged.push(f);
    }
    applyFiles(merged.slice(0, 10));
  };

  const removeFile = (name: string) => {
    const remaining = allFiles.filter(f => f.name !== name);
    if (remaining.length === 0) {
      setAllFiles([]); allFilesRef.current = [];
      setSecondFile(null); setLiveReport(null); setUploaderKey(k => k + 1);
      return;
    }
    applyFiles(remaining);
  };

  // ── Activity log toggle ────────────────────────────────────────────────────
  const [logOpen, setLogOpen] = useState(true);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Header card ── */}
      <div
        className="rounded-xl p-5"
        style={{ background: 'var(--brand-surface-card)', border: `1px solid ${AGENT_COLOR}25` }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Identity */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${AGENT_COLOR}18`, border: `1px solid ${AGENT_COLOR}40` }}
            >
              <Activity size={18} color={AGENT_COLOR} />
            </div>
            <div>
              <h2
                className="text-white font-black text-sm uppercase tracking-widest"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Zipit Analyst
              </h2>
              <p className="text-[11px] font-mono mt-0.5" style={{ color: '#4b5563' }}>
                Auto-optimizes every 15 min · analyzes files · monitors site health
              </p>
            </div>
          </div>

          {/* Status + controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Health indicator */}
            <span
              className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-lg"
              style={{
                background: healthOk ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                border:     `1px solid ${healthOk ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                color:      healthOk ? '#10b981' : '#ef4444',
              }}
            >
              {healthOk ? <Wifi size={10} /> : <WifiOff size={10} />}
              {healthOk ? 'Site OK' : siteHealth}
            </span>

            {/* Countdown */}
            <CountdownBadge nextRunAt={nextRunAt} />

            {/* Last run */}
            {lastRunAt && (
              <span className="text-[10px] font-mono" style={{ color: '#4b5563' }}>
                Last: {lastRunAt}
              </span>
            )}

            {/* Open analyst chat */}
            <button
              onClick={onOpenChat}
              title="Open Analyst Chat"
              className="flex items-center gap-2 px-3 py-2 rounded-xl transition-opacity"
              style={{ background: `${AGENT_COLOR}18`, border: `1px solid ${AGENT_COLOR}40` }}
            >
              {isRunning
                ? <RefreshCw size={14} color={AGENT_COLOR} className="animate-spin" />
                : <Activity size={14} color={AGENT_COLOR} />}
              <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: AGENT_COLOR }}>
                Zipit Analyst
              </span>
            </button>
          </div>
        </div>

        {/* ── Campaign decisions strip ── */}
        {pairs.length > 0 && (
          <div className="mt-4 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: '#4b5563' }}>
              Campaign decisions — {pairs.length} campaigns
            </p>
            <div className="flex flex-wrap gap-2">
              {pairs.map(p => (
                <div
                  key={p.adSetId}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span className="text-xs text-white font-medium truncate max-w-[160px]">{p.adSetName}</span>
                  <span className="text-[10px] font-mono shrink-0" style={{ color: '#4b5563' }}>
                    {p.roas != null ? `${p.roas.toFixed(1)}x` : '—'}
                  </span>
                  <DecisionChip decision={p.liveDecision} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── File upload area — full width ── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--brand-surface-card)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <Upload size={12} color={AGENT_COLOR} />
          <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: AGENT_COLOR }}>
            Feed Documents
          </span>
        </div>
        <div className="p-3">
          <FileUploader
            key={uploaderKey}
            onFilesLoaded={handleFilesLoaded}
            onInsightsClick={() => {}}
            hasReport={liveReport !== null}
          />
          {allFiles.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono" style={{ color: '#4b5563' }}>
                  {allFiles.length} file{allFiles.length > 1 ? 's' : ''} loaded
                </span>
                <button
                  onClick={() => {
                    setAllFiles([]); allFilesRef.current = [];
                    setSecondFile(null); setLiveReport(null); setUploaderKey(k => k + 1);
                  }}
                  className="text-[10px] font-mono transition-colors"
                  style={{ color: '#6b7280' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#6b7280'; }}
                >
                  Clear all
                </button>
              </div>
              {allFiles.map((f, i) => (
                <div
                  key={f.name}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-mono shrink-0" style={{ color: AGENT_COLOR }}>{i + 1}</span>
                    <span className="text-white text-[11px] font-mono truncate">{f.name}</span>
                  </div>
                  <button
                    onClick={() => removeFile(f.name)}
                    className="shrink-0 ml-2 p-1 rounded"
                    style={{ color: '#6b7280' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#6b7280'; }}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Activity log & last analysis ── */}
      <div className="space-y-4">

          {/* Last analyst response */}
          {lastResponse && (
            <div
              className="rounded-xl p-4"
              style={{ background: 'var(--brand-surface-card)', border: `1px solid ${AGENT_COLOR}20` }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-black uppercase"
                  style={{ background: `${AGENT_COLOR}20`, color: AGENT_COLOR }}
                >
                  AI
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: AGENT_COLOR }}>
                  Latest Analysis
                </span>
                {runCount > 0 && (
                  <span className="text-[9px] font-mono ml-auto" style={{ color: '#374151' }}>
                    Run #{runCount}
                  </span>
                )}
              </div>
              <div
                className="text-sm leading-relaxed whitespace-pre-line"
                style={{ color: '#d1d5db' }}
              >
                {renderContent(lastResponse.content)}
              </div>
            </div>
          )}


          {/* Thinking state */}
          {isRunning && !lastResponse && (
            <div
              className="rounded-xl p-6 flex flex-col items-center justify-center text-center"
              style={{ background: 'var(--brand-surface-card)', border: `1px solid ${AGENT_COLOR}20`, minHeight: '140px' }}
            >
              <div className="flex gap-1.5 mb-3">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-2 h-2 rounded-full"
                    style={{ background: AGENT_COLOR, animation: `pulse 1.4s ease-in-out ${d}ms infinite` }} />
                ))}
              </div>
              <p className="text-sm font-medium" style={{ color: AGENT_COLOR }}>Analyzing…</p>
              <p className="text-[11px] font-mono mt-1" style={{ color: '#4b5563' }}>{conv.lastAction}</p>
            </div>
          )}

          {/* Action log */}
          {actions.length > 0 && (
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: 'var(--brand-surface-card)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <button
                onClick={() => setLogOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <span className="text-[10px] font-mono uppercase tracking-wider text-left" style={{ color: '#6b7280' }}>
                  Activity Log · {actions.length} events
                </span>
                {logOpen ? <ChevronUp size={12} color="#4b5563" /> : <ChevronDown size={12} color="#4b5563" />}
              </button>
              {logOpen && (
                <div className="px-4 pb-3">
                  {actions.map(a => <ActionEntry key={a.id} action={a} />)}
                </div>
              )}
            </div>
          )}
      </div>

      {/* ── Live insight tiles from uploaded files ── */}
      {liveReport && (
        <LiveInsightsTiles
          report={liveReport}
          fileNames={allFiles.map(f => f.name)}
          secondFileContent={secondFile?.content}
        />
      )}
    </div>
  );
};
