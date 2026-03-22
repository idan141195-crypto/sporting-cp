// ─── Distribution History ──────────────────────────────────────────────────
// localStorage portfolio of all published assets.
// Max 200 entries; newest first.

const LS_KEY = 'scaleai_distribution_v1';
const MAX    = 200;

export interface PlacementResult {
  placementId:  string;      // e.g. 'ig_story'
  platform:     string;
  label:        string;
  success:      boolean;
  postId?:      string;
  postUrl?:     string;
  error?:       string;
}

export interface AdIntegrationResult {
  adSetId:    string;
  adSetName:  string;
  action:     'add' | 'replace';
  success:    boolean;
  creativeId?: string;
  adId?:       string;
  error?:      string;
}

export interface DistributionRecord {
  id:             string;
  mediaUrl:       string;
  mediaType:      'image' | 'video';
  prompt:         string;
  format:         string;
  publishedAt:    string;
  placements:     PlacementResult[];
  adIntegrations: AdIntegrationResult[];
}

export function getHistory(): DistributionRecord[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'); }
  catch { return []; }
}

export function saveRecord(r: DistributionRecord): void {
  const history = getHistory();
  history.unshift(r);
  localStorage.setItem(LS_KEY, JSON.stringify(history.slice(0, MAX)));
}

export function clearHistory(): void {
  localStorage.removeItem(LS_KEY);
}
