import React from 'react';

export type CampaignStatus = 'SCALE' | 'OPTIMIZE' | 'CRITICAL';

export interface Campaign {
  id: string;
  name: string;
  platform: string;
  spend: number;
  revenue: number;
  roas: number;
  ctr: number;
  conversions: number;
  country: string;
  status: CampaignStatus;
  recommendation: string;
}

interface PlayerCardProps {
  campaign: Campaign;
}

const statusConfig: Record<CampaignStatus, {
  label: string;
  badge: string;
  icon: string;
  cardClass: string;
  badgeStyle: React.CSSProperties;
  borderStyle: React.CSSProperties;
}> = {
  SCALE: {
    label: 'TOP SCORER',
    badge: 'SCALE',
    icon: '⚡',
    cardClass: '',
    badgeStyle:  { background: 'var(--brand-primary)', color: '#080808' },
    borderStyle: { borderColor: 'var(--brand-primary)', boxShadow: '0 0 8px color-mix(in srgb, var(--brand-primary) 35%, transparent)' },
  },
  OPTIMIZE: {
    label: 'ON THE BENCH',
    badge: 'OPTIMIZE',
    icon: '⚙️',
    cardClass: '',
    badgeStyle:  { background: '#eab308', color: '#080808' },
    borderStyle: { borderColor: '#eab308' },
  },
  CRITICAL: {
    label: 'SUB OUT',
    badge: 'CRITICAL',
    icon: '🟥',
    cardClass: 'animate-pulse-red',
    badgeStyle:  { background: '#be123c', color: '#ffffff' },
    borderStyle: { borderColor: '#be123c' },
  },
};

const platformIcon: Record<string, string> = {
  Facebook:  'FB',
  Meta:      'FB',
  Instagram: 'IG',
  Google:    'GG',
  TikTok:    'TK',
  Shopify:   'SH',
};

export const PlayerCard: React.FC<PlayerCardProps> = ({ campaign }) => {
  const cfg = statusConfig[campaign.status];
  const roasStyle: React.CSSProperties =
    campaign.roas > 5
      ? { color: 'var(--brand-primary)' }
      : campaign.roas >= 3
      ? { color: '#eab308' }
      : { color: '#be123c' };

  return (
    <div
      className={`relative bg-card-dark border-2 rounded-lg p-4 transition-all duration-300 hover:scale-[1.02] cursor-pointer ${cfg.cardClass} overflow-hidden`}
      style={{ minWidth: '200px', ...cfg.borderStyle }}
    >
      {/* Red overlay for CRITICAL */}
      {campaign.status === 'CRITICAL' && (
        <div className="absolute inset-0 bg-danger-red overlay-pulse-red rounded-lg pointer-events-none" />
      )}

      {/* Platform badge */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <span className="text-xs font-bold bg-border-dark text-text-secondary px-2 py-1 rounded font-mono tracking-wider">
          {platformIcon[campaign.platform] ?? campaign.platform.substring(0, 2).toUpperCase()}
        </span>
        <span className="text-xs font-bold px-2 py-1 rounded font-display tracking-widest" style={cfg.badgeStyle}>
          {cfg.icon} {cfg.badge}
        </span>
      </div>

      {/* Campaign name */}
      <h3 className="font-display text-white text-sm font-bold uppercase tracking-wide mb-1 relative z-10 truncate">
        {campaign.name}
      </h3>
      <p className="text-text-secondary text-xs mb-3 relative z-10">{campaign.country}</p>

      {/* ROAS — the hero stat */}
      <div className="relative z-10 mb-3">
        <p className="text-text-secondary text-xs uppercase tracking-widest mb-1">ROAS</p>
        <p className="font-display text-3xl font-black" style={roasStyle}>
          {campaign.roas.toFixed(1)}x
        </p>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-2 relative z-10 text-xs">
        <div>
          <p className="text-text-secondary uppercase tracking-wider">Spend</p>
          <p className="text-white font-semibold">${campaign.spend.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-text-secondary uppercase tracking-wider">Revenue</p>
          <p className="text-white font-semibold">${campaign.revenue.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-text-secondary uppercase tracking-wider">CTR</p>
          <p className="text-white font-semibold">{campaign.ctr.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-text-secondary uppercase tracking-wider">Conv.</p>
          <p className="text-white font-semibold">{campaign.conversions}</p>
        </div>
      </div>

      {/* Recommendation */}
      <div className="mt-3 pt-3 border-t border-border-dark relative z-10">
        <p className="text-text-secondary text-xs leading-relaxed">{campaign.recommendation}</p>
      </div>

      {/* Status label bottom */}
      <p
        className="absolute bottom-0 right-0 text-[10px] font-display font-black px-2 py-1 rounded-tl"
        style={cfg.badgeStyle}
      >
        {cfg.label}
      </p>
    </div>
  );
};

export default PlayerCard;
