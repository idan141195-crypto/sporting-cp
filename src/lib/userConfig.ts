// ─── User Config ─────────────────────────────────────────────────────────────
// Persistent localStorage service for per-user onboarding configuration.

export interface UserConfig {
  completed:              boolean;
  // Brand DNA
  websiteUrl:             string;
  brandName:              string;
  logoUrl:                string;
  primaryColor:           string;
  secondaryColor:         string;
  industry:               string;
  tone:                   string;
  keywords:               string[];
  // Meta / Facebook Ads
  metaAccessToken:        string;
  metaAdAccountId:        string;
  metaFacebookPageId:     string;
  metaInstagramAccountId: string;
}

const KEY = 'zipit_user_config_v1';

const DEFAULTS: UserConfig = {
  completed:              false,
  websiteUrl:             '',
  brandName:              '',
  logoUrl:                '',
  primaryColor:           '',
  secondaryColor:         '',
  industry:               '',
  tone:                   '',
  keywords:               [],
  metaAccessToken:        '',
  metaAdAccountId:        '',
  metaFacebookPageId:     '',
  metaInstagramAccountId: '',
};

export function getUserConfig(): UserConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function saveUserConfig(patch: Partial<UserConfig>): UserConfig {
  const next = { ...getUserConfig(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

export function clearUserConfig(): void {
  localStorage.removeItem(KEY);
}
