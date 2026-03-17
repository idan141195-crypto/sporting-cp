import React from 'react';

interface HeaderProps {
  criticalCount: number;
  uploadedFileName?: string;
  onToggleChat: () => void;
  isChatOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  criticalCount,
  uploadedFileName,
  onToggleChat,
  isChatOpen,
}) => {
  return (
    <header className="border-b border-border-dark bg-pitch-dark sticky top-0 z-50">
      <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between gap-4">

        {/* ── Brand ── */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative">
            <img
              src="/bodo-glimt/sporting-cp-logo.png"
              alt="Bodø/Glimt"
              className="w-11 h-11 rounded-full border-2 border-electric-yellow shadow-yellow-sm"
            />
            {/* Live pulse dot */}
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success-green rounded-full border-2 border-pitch-dark animate-ping" />
          </div>
          <div>
            <h1 className="font-display font-black text-white uppercase tracking-widest text-base leading-none">
              Bodø/Glimt
            </h1>
            <p className="text-electric-yellow text-[10px] tracking-widest uppercase font-mono mt-0.5">
              Website Management System
            </p>
          </div>
        </div>

        {/* ── Centre: Data status strip ── */}
        <div className="hidden md:flex items-center gap-3 flex-1 justify-center">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-success-green/10 border border-success-green/30 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-success-green animate-pulse" />
            <span className="text-success-green text-[10px] font-bold uppercase tracking-widest">Live Data</span>
          </div>

          {uploadedFileName && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-electric-yellow/10 border border-electric-yellow/30 rounded-full">
              <span className="text-[10px]">📄</span>
              <span className="text-electric-yellow text-[10px] font-bold uppercase tracking-widest truncate max-w-[160px]">
                {uploadedFileName}
              </span>
            </div>
          )}

          {criticalCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-danger-red/10 border border-danger-red/40 rounded-full animate-pulse">
              <span className="text-danger-red text-[10px] font-bold uppercase tracking-widest">
                ⚡ {criticalCount} Critical Alert{criticalCount > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* ── Right: Coach toggle ── */}
        <button
          onClick={onToggleChat}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-xs uppercase tracking-widest
            transition-all duration-300 shrink-0
            ${isChatOpen
              ? 'bg-electric-yellow text-deep-black border-electric-yellow shadow-yellow-glow'
              : 'bg-card-dark text-text-secondary border-border-dark hover:border-electric-yellow hover:text-electric-yellow'}
          `}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
              <circle cx="12" cy="6" r="3" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M18 10l2-1.5M18 10l1 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          <span className="hidden sm:inline">AI Coach</span>
          {isChatOpen
            ? <span className="text-deep-black font-black">✕</span>
            : <span className="text-electric-yellow">→</span>
          }
        </button>
      </div>
    </header>
  );
};

export default Header;
