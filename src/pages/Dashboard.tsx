import React, { useState } from 'react';
import { PlayerCard } from '../components/PlayerCard';
import type { Campaign } from '../components/PlayerCard';
import { LeakingPipeFunnel } from '../components/LeakingPipeFunnel';
import type { FunnelStep } from '../components/LeakingPipeFunnel';
import { SubstitutionBoard } from '../components/SubstitutionBoard';
import type { BudgetPlayer } from '../components/SubstitutionBoard';
import { InjuryReport } from '../components/InjuryReport';
import type { TechnicalInjury } from '../components/InjuryReport';
import { Header } from '../components/Header';
import { FileUploader } from '../components/FileUploader';
import type { UploadedFile } from '../components/FileUploader';
import { AICoachChat } from '../components/AICoachChat';
import { InsightsPanel } from '../components/InsightsPanel';
import { LiveInsightsTiles } from '../components/LiveInsightsTiles';
import { runDiagnosis, parseCSV, detectFileType } from '../lib/scale-engine';
import type { DiagnosisReport } from '../lib/scale-engine';

// ─── Mock fallback data (shown when no file is uploaded) ──────────────────────

const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: '1', name: 'Instagram Israel — Summer', platform: 'Instagram',
    spend: 3200, revenue: 22400, roas: 7.0, ctr: 4.2, conversions: 187,
    country: 'Israel', status: 'SCALE',
    recommendation: 'Increase budget by 15%. Top performer this week. Scale aggressively.',
  },
  {
    id: '2', name: 'Google Search — UK', platform: 'Google',
    spend: 5100, revenue: 20910, roas: 4.1, ctr: 3.1, conversions: 201,
    country: 'United Kingdom', status: 'OPTIMIZE',
    recommendation: 'Dive into keyword-level CPA. Pause low-intent terms. Test new ad copy.',
  },
  {
    id: '3', name: 'TikTok UK — Gen-Z Video', platform: 'TikTok',
    spend: 4800, revenue: 9600, roas: 2.0, ctr: 6.8, conversions: 54,
    country: 'United Kingdom', status: 'CRITICAL',
    recommendation: 'Pause immediately. High CTR but low intent. Video engages but does not convert.',
  },
  {
    id: '4', name: 'Facebook DE — Retargeting', platform: 'Facebook',
    spend: 1400, revenue: 8820, roas: 6.3, ctr: 3.9, conversions: 96,
    country: 'Germany', status: 'SCALE',
    recommendation: 'Retargeting ROAS is 3.1x prospecting. Expand audience lookalike size.',
  },
  {
    id: '5', name: 'Google Shopping — FR', platform: 'Google',
    spend: 2200, revenue: 6380, roas: 2.9, ctr: 2.1, conversions: 39,
    country: 'France', status: 'CRITICAL',
    recommendation: 'Below break-even threshold. Pause and audit product feed quality.',
  },
  {
    id: '6', name: 'Instagram ES — Reels', platform: 'Instagram',
    spend: 1800, revenue: 7200, roas: 4.0, ctr: 5.5, conversions: 72,
    country: 'Spain', status: 'OPTIMIZE',
    recommendation: 'Shift spend toward Reels placement — outperforming Feed by 38%.',
  },
];

const MOCK_FUNNEL: FunnelStep[] = [
  { label: 'Ad Click / Landing Page', users: 12400, icon: '📣' },
  { label: 'Product Page View',        users: 7800,  icon: '👁️' },
  { label: 'Add to Cart',              users: 2100,  icon: '🛒' },
  { label: 'Initiate Checkout',        users: 890,   icon: '💳' },
  { label: 'Payment Success',          users: 649,   icon: '✅' },
];

const MOCK_BUDGET_PLAYERS: BudgetPlayer[] = [
  { id: 'b1', name: 'TikTok UK',        platform: 'TikTok',    country: 'UK',      budget: 4800, roas: 2.0, status: 'underperformer' },
  { id: 'b2', name: 'Google FR',        platform: 'Google',    country: 'France',  budget: 2200, roas: 2.9, status: 'underperformer' },
  { id: 'b3', name: 'Instagram Israel', platform: 'Instagram', country: 'Israel',  budget: 3200, roas: 7.0, status: 'performer' },
  { id: 'b4', name: 'Facebook DE RT',   platform: 'Facebook',  country: 'Germany', budget: 1400, roas: 6.3, status: 'performer' },
  { id: 'b5', name: 'Instagram ES',     platform: 'Instagram', country: 'Spain',   budget: 1800, roas: 4.0, status: 'performer' },
];

const MOCK_INJURIES: TechnicalInjury[] = [
  {
    id: 'i1', type: '404', severity: 'critical',
    message: '404 errors detected on 3 active Facebook Ad destination URLs. Budget is being wasted on dead links.',
    url: '/products/summer-kit-2024 → Not Found',
    timestamp: '14:32', count: 38,
  },
  {
    id: 'i2', type: 'checkout_friction', severity: 'warning',
    message: 'Add-to-Cart → Checkout conversion dropped 52% vs. 7-day average. Possible shipping cost reveal issue.',
    timestamp: '13:15',
  },
  {
    id: 'i3', type: 'slow_load', severity: 'warning',
    message: 'Mobile checkout time is 3.2× longer than desktop. UX Friction on mobile payment flow.',
    timestamp: '12:58',
  },
];

// ─── CSV merge helper ─────────────────────────────────────────────────────────

function mergeCSVs(csvTexts: string[]): string {
  if (csvTexts.length === 0) return '';
  if (csvTexts.length === 1) return csvTexts[0];
  const header = csvTexts[0].trim().split(/\r?\n/)[0];
  const rows = csvTexts.map((t) => t.trim().split(/\r?\n/).slice(1)).flat();
  return [header, ...rows].join('\n');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferFunnelIcon(label: string): string {
  const l = label.toLowerCase();
  if (/ad|click|landing|traffic/.test(l))               return '📣';
  if (/product|view|browse/.test(l))                    return '👁️';
  if (/cart|basket|add/.test(l))                        return '🛒';
  if (/checkout|initiat|payment start/.test(l))         return '💳';
  if (/payment|purchase|order|success|complete|thank/.test(l)) return '✅';
  return '📊';
}

function mapFlagType(flagType: string): TechnicalInjury['type'] {
  if (flagType === 'CRITICAL_BUDGET_WASTE')       return '404';
  if (flagType === 'CHECKOUT_FRICTION')            return 'checkout_friction';
  if (flagType === 'UX_FRICTION_MOBILE')           return 'slow_load';
  if (flagType === 'RETARGETING_UNDERPERFORMING')  return 'payment_error';
  return 'slow_load';
}

function reportToCampaigns(r: DiagnosisReport): Campaign[] {
  return r.campaigns.map((c, i) => ({
    id: String(i),
    name: c.name,
    platform: c.platform,
    spend: c.spend,
    revenue: c.revenue,
    roas: c.roas,
    ctr: c.ctr ?? 0,
    conversions: c.conversions ?? 0,
    country: c.country,
    status: c.status,
    recommendation: c.action,
  }));
}

function reportToFunnelSteps(r: DiagnosisReport): FunnelStep[] {
  return r.funnelSteps.map((s) => ({
    label: s.label,
    users: s.users,
    icon: inferFunnelIcon(s.label),
  }));
}

function reportToBudgetPlayers(r: DiagnosisReport): BudgetPlayer[] {
  return r.campaigns.map((c, i) => ({
    id: String(i),
    name: c.name,
    platform: c.platform,
    country: c.country,
    budget: c.spend,
    roas: c.roas,
    status: c.roas >= 3 ? 'performer' : 'underperformer',
  }));
}

function reportToInjuries(r: DiagnosisReport): TechnicalInjury[] {
  return r.flags.map((f, i) => ({
    id: String(i),
    type: mapFlagType(f.type),
    severity: f.severity,
    message: f.message,
    timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  }));
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string; value: string; sub?: string; highlight?: boolean; alert?: boolean;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, sub, highlight, alert }) => (
  <div className={`
    bg-card-dark border rounded-xl p-4 flex flex-col gap-1
    ${highlight ? 'border-electric-yellow border-glow-yellow' :
      alert ? 'border-danger-red' : 'border-border-dark'}
  `}>
    <p className="text-text-secondary text-xs uppercase tracking-widest font-mono">{label}</p>
    <p className={`font-display font-black text-2xl ${highlight ? 'text-electric-yellow' : alert ? 'text-danger-red' : 'text-white'}`}>
      {value}
    </p>
    {sub && <p className="text-text-secondary text-xs">{sub}</p>}
  </div>
);

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'lineup' | 'funnel' | 'bench' | 'health';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'lineup', label: 'Starting Lineup',    icon: '⚽' },
  { id: 'funnel', label: 'Leaking Pipe',        icon: '🪣' },
  { id: 'bench',  label: 'Substitution Board', icon: '🔄' },
  { id: 'health', label: 'Injury Report',       icon: '🏥' },
];

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab]       = useState<Tab>('lineup');
  const [isChatOpen, setIsChatOpen]     = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [secondFile, setSecondFile]     = useState<UploadedFile | null>(null);
  const [allFiles, setAllFiles]         = useState<UploadedFile[]>([]);
  const [uploaderKey, setUploaderKey]   = useState(0);
  const [liveReport, setLiveReport]     = useState<DiagnosisReport | null>(null);
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [budgetPlayers, setBudgetPlayers]   = useState<BudgetPlayer[]>(MOCK_BUDGET_PLAYERS);

  const applyFiles = (files: UploadedFile[]) => {
    setUploadedFile(files[0] ?? null);
    setSecondFile(files[1] ?? null);
    setAllFiles(files);

    const campaignTexts: string[] = [];
    const funnelTexts: string[] = [];
    for (const f of files) {
      const rows = parseCSV(f.content);
      const type = detectFileType(rows);
      if (type === 'funnel') funnelTexts.push(f.content);
      else campaignTexts.push(f.content);
    }

    const mergedCampaigns = mergeCSVs(campaignTexts) || undefined;
    const mergedFunnel    = mergeCSVs(funnelTexts)    || undefined;
    const report = runDiagnosis(mergedCampaigns, mergedFunnel);
    setLiveReport(report);
    if (report.campaigns.length > 0) setBudgetPlayers(reportToBudgetPlayers(report));
  };

  const handleFilesLoaded = (files: UploadedFile[]) => applyFiles(files);

  const removeFile = (name: string) => {
    const remaining = allFiles.filter((f) => f.name !== name);
    if (remaining.length === 0) {
      setAllFiles([]);
      setUploadedFile(null);
      setSecondFile(null);
      setLiveReport(null);
      setUploaderKey((k) => k + 1); // reset FileUploader to idle
      return;
    }
    applyFiles(remaining);
  };

  const hasLive = liveReport !== null;
  const hasCampaigns = hasLive && liveReport!.campaigns.length > 0;
  const hasFunnel    = hasLive && liveReport!.funnelSteps.length > 0;

  const displayCampaigns    = hasCampaigns ? reportToCampaigns(liveReport!)    : MOCK_CAMPAIGNS;
  const displayFunnelSteps  = hasFunnel    ? reportToFunnelSteps(liveReport!)  : MOCK_FUNNEL;
  const displayInjuries     = hasLive && liveReport!.flags.length > 0
    ? reportToInjuries(liveReport!) : MOCK_INJURIES;

  const totalSpend   = hasCampaigns ? liveReport!.totalSpend   : displayCampaigns.reduce((s, c) => s + c.spend, 0);
  const totalRevenue = hasCampaigns ? liveReport!.totalRevenue : displayCampaigns.reduce((s, c) => s + c.revenue, 0);
  const blendedRoas  = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const totalConv    = displayCampaigns.reduce((s, c) => s + c.conversions, 0);
  const criticalCount = displayCampaigns.filter((c) => c.status === 'CRITICAL').length;

  const hasInsightsData = hasLive && (hasCampaigns || hasFunnel);

  const handleTransfer = (fromId: string, toId: string, amount: number) => {
    setBudgetPlayers((prev) =>
      prev.map((p) =>
        p.id === fromId ? { ...p, budget: p.budget - amount } :
        p.id === toId   ? { ...p, budget: p.budget + amount } : p
      )
    );
  };

  const dashboardContext = JSON.stringify({
    isLiveData: hasLive,
    summary: { totalRevenue, totalSpend, blendedRoas: blendedRoas.toFixed(2), totalConv },
    campaigns: displayCampaigns.map((c) => ({
      name: c.name, platform: c.platform, country: c.country,
      roas: c.roas, spend: c.spend, revenue: c.revenue, status: c.status,
    })),
    funnel: displayFunnelSteps.map((s, i) => ({
      step: s.label, users: s.users,
      dropPct: i > 0
        ? (((displayFunnelSteps[i - 1].users - s.users) / displayFunnelSteps[i - 1].users) * 100).toFixed(1) + '%'
        : '—',
    })),
    injuries: displayInjuries.map((inj) => ({ type: inj.type, severity: inj.severity, message: inj.message })),
  }, null, 2);

  return (
    <div className="min-h-screen bg-deep-black text-white">

      <Header
        criticalCount={criticalCount}
        uploadedFileName={uploadedFile?.name}
        onToggleChat={() => setIsChatOpen((o) => !o)}
        isChatOpen={isChatOpen}
      />

      <div className={`transition-all duration-300 ${isChatOpen ? 'mr-0 sm:mr-[420px]' : ''}`}>
        <main className="max-w-screen-xl mx-auto px-6 py-8">

          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Total Revenue"   value={`$${totalRevenue.toLocaleString()}`} highlight />
            <KpiCard label="Total Ad Spend"  value={`$${totalSpend.toLocaleString()}`}
              sub={hasLive ? '● Live data' : 'Demo data'} />
            <KpiCard
              label="Blended ROAS"
              value={`${blendedRoas.toFixed(2)}x`}
              highlight={blendedRoas >= 3}
              alert={blendedRoas < 3}
              sub={blendedRoas >= 5 ? '⚡ SCALE' : blendedRoas >= 3 ? '⚙️ OPTIMIZE' : '🟥 CRITICAL'}
            />
            <KpiCard label="Total Conversions" value={totalConv.toLocaleString()} sub={`${displayCampaigns.length} campaigns`} />
          </div>

          {/* Data Ingestion Hub */}
          <div className="mb-6">
            <FileUploader
              key={uploaderKey}
              onFilesLoaded={handleFilesLoaded}
              onInsightsClick={() => setIsInsightsOpen(true)}
              hasReport={hasInsightsData}
            />
            {/* Loaded files — managed list with individual remove */}
            {allFiles.length > 0 && (
              <div className="mt-2 bg-card-dark border border-border-dark rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border-dark">
                  <span className="text-text-secondary text-[10px] font-mono uppercase tracking-widest">
                    {allFiles.length} file{allFiles.length > 1 ? 's' : ''} loaded
                  </span>
                  <button
                    onClick={() => { setAllFiles([]); setUploadedFile(null); setSecondFile(null); setLiveReport(null); setUploaderKey((k) => k + 1); }}
                    className="text-[10px] text-text-secondary hover:text-danger-red uppercase tracking-wider font-bold transition-colors"
                  >
                    Clear all
                  </button>
                </div>
                {allFiles.map((f, i) => (
                  <div key={f.name} className="flex items-center justify-between px-3 py-2 border-b border-border-dark last:border-b-0 hover:bg-pitch-dark transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-electric-yellow text-[10px] font-mono shrink-0">{i + 1}</span>
                      <span className="text-white text-xs font-mono truncate" title={f.name}>{f.name}</span>
                      <span className="text-text-secondary text-[10px] shrink-0">
                        {f.size < 1024 ? `${f.size}B` : f.size < 1048576 ? `${(f.size / 1024).toFixed(1)}KB` : `${(f.size / 1048576).toFixed(1)}MB`}
                      </span>
                    </div>
                    <button
                      onClick={() => removeFile(f.name)}
                      className="shrink-0 ml-3 w-5 h-5 flex items-center justify-center text-text-secondary hover:text-danger-red hover:bg-danger-red/10 rounded transition-all text-xs"
                      title="Remove file"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Scale Live Insight Tiles — auto-generated from uploaded files */}
          {hasLive && liveReport && (
            <LiveInsightsTiles
              report={liveReport}
              fileNames={[uploadedFile?.name ?? '', secondFile?.name ?? ''].filter(Boolean)}
              secondFileContent={secondFile?.content}
            />
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-pitch-dark border border-border-dark rounded-xl p-1 w-fit">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest
                  transition-all duration-200
                  ${activeTab === tab.id
                    ? 'bg-electric-yellow text-deep-black shadow-yellow-sm'
                    : 'text-text-secondary hover:text-white'}
                `}
              >
                <span>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'lineup' && (
            <div className="animate-slide-in">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h2 className="text-white font-display font-black uppercase tracking-widest text-base">
                    Starting Lineup — Campaign Status
                  </h2>
                  <p className="text-text-secondary text-xs mt-1">
                    ROAS algorithm: &gt;5.0 Scale · 3.0–5.0 Optimize · &lt;3.0 Critical
                  </p>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="flex items-center gap-1 text-electric-yellow">
                    <span className="w-2 h-2 rounded-full bg-electric-yellow" />
                    {displayCampaigns.filter((c) => c.status === 'SCALE').length} Scale
                  </span>
                  <span className="flex items-center gap-1 text-yellow-400">
                    <span className="w-2 h-2 rounded-full bg-yellow-400" />
                    {displayCampaigns.filter((c) => c.status === 'OPTIMIZE').length} Optimize
                  </span>
                  <span className="flex items-center gap-1 text-danger-red">
                    <span className="w-2 h-2 rounded-full bg-danger-red" />
                    {displayCampaigns.filter((c) => c.status === 'CRITICAL').length} Critical
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayCampaigns.map((c) => <PlayerCard key={c.id} campaign={c} />)}
              </div>
            </div>
          )}

          {activeTab === 'funnel' && (
            <div className="animate-slide-in max-w-2xl">
              <LeakingPipeFunnel steps={displayFunnelSteps} dropThreshold={30} />
            </div>
          )}

          {activeTab === 'bench' && (
            <div className="animate-slide-in">
              <SubstitutionBoard
                players={budgetPlayers}
                totalBudget={budgetPlayers.reduce((s, p) => s + p.budget, 0)}
                onTransfer={handleTransfer}
              />
            </div>
          )}

          {activeTab === 'health' && (
            <div className="animate-slide-in">
              <InjuryReport injuries={displayInjuries} isLive />
            </div>
          )}
        </main>
      </div>

      {/* AI Coach Chat */}
      <AICoachChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        uploadedFileName={uploadedFile?.name}
        uploadedFileContent={uploadedFile?.content}
        secondFileName={secondFile?.name}
        secondFileContent={secondFile?.content}
        dashboardContext={dashboardContext}
      />

      {/* Insights Panel */}
      {isInsightsOpen && liveReport && (
        <InsightsPanel
          isOpen={isInsightsOpen}
          onClose={() => setIsInsightsOpen(false)}
          report={liveReport}
          fileName={uploadedFile?.name ?? 'Uploaded file'}
        />
      )}
    </div>
  );
};

export default Dashboard;
