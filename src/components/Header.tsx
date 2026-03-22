import React from 'react';
import { useBrand } from '../lib/BrandingService';

interface HeaderProps {
  criticalCount: number;
  uploadedFileName?: string;
  onToggleChat: () => void;
  isChatOpen: boolean;
  metaAccountId?: string;
}

export const Header: React.FC<HeaderProps> = ({
  criticalCount,
  uploadedFileName,
  onToggleChat,
  isChatOpen,
  metaAccountId,
}) => {
  const brand = useBrand();
  const metaUrl = metaAccountId
    ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${metaAccountId.replace('act_', '')}`
    : 'https://adsmanager.facebook.com';
  return (
    <header className="border-b border-border-dark bg-pitch-dark sticky top-0 z-50">
      <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between gap-4">

        {/* ── Brand ── */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative">
            <img
              src={brand.logoUrl}
              alt={brand.name}
              className="w-11 h-11 rounded-full border-2 object-contain"
              style={{ borderColor: brand.primary, boxShadow: `0 0 8px ${brand.primary}66` }}
              onError={e => { (e.currentTarget as HTMLImageElement).src = '/bodo-glimt/sporting-cp-logo.png'; }}
            />
            {/* Live pulse dot */}
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success-green rounded-full border-2 border-pitch-dark animate-ping" />
          </div>
          <div>
            <h1 className="font-display font-black text-white uppercase tracking-widest text-base leading-none">
              {brand.name}
            </h1>
            <p className="text-[10px] tracking-widest uppercase font-mono mt-0.5" style={{ color: brand.primary }}>
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
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ background: `${brand.primary}18`, border: `1px solid ${brand.primary}40` }}
            >
              <span className="text-[10px]">📄</span>
              <span className="text-[10px] font-bold uppercase tracking-widest truncate max-w-[160px]" style={{ color: brand.primary }}>
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

        {/* ── Right: Meta Ads Manager shortcut + Coach toggle ── */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={metaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#1877F2]/40 bg-[#1877F2]/10 text-[#4493F8] hover:bg-[#1877F2]/25 hover:border-[#1877F2]/70 font-bold text-xs uppercase tracking-widest transition-all duration-300 shrink-0"
            title={metaAccountId ? `Open Meta Ads Manager — ${metaAccountId}` : 'Open Meta Ads Manager'}
          >
            {/* Facebook "f" icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
              <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06c0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
            </svg>
            <span className="hidden sm:inline">Meta Ads</span>
            <span className="opacity-60">↗</span>
          </a>

          <button
            onClick={onToggleChat}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-xs uppercase tracking-widest transition-all duration-300 shrink-0"
            style={isChatOpen
              ? { background: brand.primary, color: '#080808', borderColor: brand.primary, boxShadow: `0 0 16px ${brand.primary}55` }
              : { background: '#1A1A1A', color: '#9A9A9A', borderColor: '#2A2A2A' }
            }
            onMouseEnter={e => { if (!isChatOpen) { (e.currentTarget as HTMLElement).style.borderColor = brand.primary; (e.currentTarget as HTMLElement).style.color = brand.primary; } }}
            onMouseLeave={e => { if (!isChatOpen) { (e.currentTarget as HTMLElement).style.borderColor = '#2A2A2A'; (e.currentTarget as HTMLElement).style.color = '#9A9A9A'; } }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
              <circle cx="12" cy="6" r="3" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M18 10l2-1.5M18 10l1 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <span className="hidden sm:inline">AI Coach</span>
            {isChatOpen
              ? <span className="font-black" style={{ color: '#080808' }}>✕</span>
              : <span style={{ color: brand.primary }}>→</span>
            }
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
