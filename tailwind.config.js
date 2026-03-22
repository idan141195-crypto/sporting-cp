/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Dynamic brand tokens (all update live via CSS variables) ──────────
        'brand-primary':    'var(--brand-primary)',
        'brand-secondary':  'var(--brand-secondary)',
        'brand-surface':    'var(--brand-surface)',
        'brand-surface-card':'var(--brand-surface-card)',
        'brand-surface-elv':'var(--brand-surface-elv)',
        'brand-muted':      'var(--brand-muted)',
        'brand-glow':       'var(--brand-glow)',
        'brand-contrast':   'var(--brand-contrast)',
        'brand-text-secondary': 'var(--brand-text-secondary)',
        // ── Legacy tokens (preserved for other components) ────────────────────
        'electric-yellow': '#a78bfa',
        'yellow-glow':     '#7c3aed',
        'deep-black':      '#080808',
        'pitch-dark':      '#111111',
        'card-dark':       '#1A1A1A',
        'border-dark':     '#2A2A2A',
        'danger-red':      '#be123c',
        'success-green':   '#059669',
        'muted-gray':      '#5A5A5A',
        'text-secondary':  '#9A9A9A',
        // ── ScaleAI Command Center palette ────────────────────────────────────
        'obsidian':              '#07090F',
        'obsidian-light':        '#0C1018',
        'obsidian-card':         '#101520',
        'obsidian-border':       '#1A2030',
        'neon-cyan':             '#06D6F0',
        'neon-cyan-muted':       '#0891B2',
        'cyber-amber':           '#F59E0B',
        'cyber-amber-muted':     '#B45309',
        'profit-emerald':        '#10B981',
        'profit-emerald-muted':  '#059669',
        'learning-blue':         '#818CF8',
        'learning-blue-muted':   '#4F46E5',
      },
      fontFamily: {
        display: ['Barlow Condensed', 'Impact', 'Arial Black', 'sans-serif'],
        body:    ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono:    ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Consolas', 'Liberation Mono', 'monospace'],
      },
      boxShadow: {
        'yellow-glow':   '0 0 16px rgba(167,139,250,0.35), 0 0 40px rgba(167,139,250,0.12)',
        'yellow-sm':     '0 0 8px rgba(167,139,250,0.4)',
        'red-glow':      '0 0 16px rgba(190,18,60,0.45)',
        'green-glow':    '0 0 12px rgba(5,150,105,0.35)',
        // ScaleAI glows
        'cyan-glow':     '0 0 20px rgba(6,214,240,0.35), 0 0 50px rgba(6,214,240,0.1)',
        'cyan-sm':       '0 0 8px rgba(6,214,240,0.4)',
        'amber-glow':    '0 0 16px rgba(245,158,11,0.35), 0 0 40px rgba(245,158,11,0.1)',
        'emerald-glow':  '0 0 16px rgba(16,185,129,0.35), 0 0 40px rgba(16,185,129,0.1)',
        'indigo-glow':   '0 0 16px rgba(129,140,248,0.35)',
        'glass':         '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      animation: {
        // Legacy
        'pulse-red':    'pulse-red 1.5s ease-in-out infinite',
        'glow-yellow':  'glow-yellow 2s ease-in-out infinite alternate',
        'drip':         'drip 1.8s ease-in-out infinite',
        'slide-in':     'slide-in 0.4s ease-out',
        'ekg-line':     'ekg-line 3s linear infinite',
        'flatline':     'flatline 0.6s ease-out forwards',
        // ScaleAI
        'pulse-cyan':   'pulse-cyan 2s ease-in-out infinite',
        'glow-cyan':    'glow-cyan 2.5s ease-in-out infinite alternate',
        'pulse-amber':  'pulse-amber 2s ease-in-out infinite',
        'float':        'float 3s ease-in-out infinite',
        'fade-in-up':   'fade-in-up 0.35s ease-out',
      },
      keyframes: {
        'pulse-red': {
          '0%, 100%': { boxShadow: '0 0 6px rgba(190,18,60,0.2)' },
          '50%':      { boxShadow: '0 0 20px rgba(190,18,60,0.6)' },
        },
        'glow-yellow': {
          '0%':   { boxShadow: '0 0 6px rgba(167,139,250,0.2)' },
          '100%': { boxShadow: '0 0 24px rgba(167,139,250,0.55)' },
        },
        'drip': {
          '0%':   { transform: 'translateY(-4px)', opacity: '0' },
          '50%':  { opacity: '1' },
          '100%': { transform: 'translateY(14px)', opacity: '0' },
        },
        'slide-in': {
          '0%':   { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'ekg-line': {
          '0%':   { strokeDashoffset: '1000' },
          '100%': { strokeDashoffset: '0' },
        },
        'flatline': {
          '0%':   { transform: 'scaleY(1)' },
          '100%': { transform: 'scaleY(0.05)' },
        },
        'pulse-cyan': {
          '0%, 100%': { opacity: '0.55' },
          '50%':      { opacity: '1' },
        },
        'glow-cyan': {
          '0%':   { boxShadow: '0 0 6px rgba(6,214,240,0.15)' },
          '100%': { boxShadow: '0 0 22px rgba(6,214,240,0.5)' },
        },
        'pulse-amber': {
          '0%, 100%': { opacity: '0.55' },
          '50%':      { opacity: '1' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-3px)' },
        },
        'fade-in-up': {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
