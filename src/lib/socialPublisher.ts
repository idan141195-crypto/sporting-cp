// ─── Social Publisher ──────────────────────────────────────────────────────
// Direct API publishing to Instagram, Facebook, and TikTok.
//
// Required env vars:
//   VITE_META_ACCESS_TOKEN          — User long-lived access token (60 days)
//   VITE_META_INSTAGRAM_ACCOUNT_ID  — Instagram Business Account ID
//   VITE_META_FACEBOOK_PAGE_ID      — Facebook Page ID (optional)
//   VITE_TIKTOK_ACCESS_TOKEN        — TikTok user token (requires server OAuth)
//
// Note: Meta calls are made directly from the browser.
// TikTok requires a backend proxy at /api/tiktok/publish due to OAuth constraints.

const META_VERSION = 'v20.0';
const META_BASE    = `https://graph.facebook.com/${META_VERSION}`;

export interface MetaCredentials {
  accessToken:         string;
  instagramAccountId:  string;
  facebookPageId?:     string;
  adAccountId?:        string;   // WITHOUT "act_" — e.g. "123456789"
}

export interface PublishResult {
  platform: string;
  success:  boolean;
  postId?:  string;
  url?:     string;
  error?:   string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function metaPost(endpoint: string, body: Record<string, string>): Promise<{ id?: string; error?: { message: string } }> {
  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return res.json();
}

// ── Instagram ────────────────────────────────────────────────────────────────
// Flow: Create media container → poll until FINISHED → publish

async function waitForContainer(
  containerId:  string,
  accessToken:  string,
  maxWaitMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const res  = await fetch(`${META_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`);
    const data = await res.json() as { status_code?: string };
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED')
      throw new Error(`Container status: ${data.status_code}`);
  }
  throw new Error('Timed out waiting for Instagram container');
}

export async function publishToInstagram(
  mediaUrl:  string,
  caption:   string,
  creds:     MetaCredentials,
  mediaType: 'image' | 'video' = 'image',
): Promise<PublishResult> {
  const { accessToken, instagramAccountId } = creds;
  try {
    // Step 1 — Create container
    const containerBody: Record<string, string> = { caption, access_token: accessToken };
    if (mediaType === 'video') {
      containerBody.media_type = 'REELS';
      containerBody.video_url  = mediaUrl;
    } else {
      containerBody.image_url = mediaUrl;
    }

    const container = await metaPost(`${META_BASE}/${instagramAccountId}/media`, containerBody);
    if (container.error) throw new Error(container.error.message);

    // Step 2 — For video, wait until container is processed
    if (mediaType === 'video') {
      await waitForContainer(container.id!, accessToken);
    }

    // Step 3 — Publish
    const publish = await metaPost(`${META_BASE}/${instagramAccountId}/media_publish`, {
      creation_id:  container.id!,
      access_token: accessToken,
    });
    if (publish.error) throw new Error(publish.error.message);

    return { platform: 'instagram', success: true, postId: publish.id };
  } catch (e: unknown) {
    return { platform: 'instagram', success: false, error: (e as Error).message };
  }
}

// ── Facebook ──────────────────────────────────────────────────────────────────

export async function publishToFacebook(
  mediaUrl:  string,
  caption:   string,
  creds:     MetaCredentials,
  mediaType: 'image' | 'video' = 'image',
): Promise<PublishResult> {
  const { accessToken, facebookPageId } = creds;
  if (!facebookPageId) return { platform: 'facebook', success: false, error: 'VITE_META_FACEBOOK_PAGE_ID not set' };

  try {
    const endpoint = mediaType === 'video'
      ? `${META_BASE}/${facebookPageId}/videos`
      : `${META_BASE}/${facebookPageId}/photos`;

    const body: Record<string, string> = {
      [mediaType === 'video' ? 'file_url' : 'url']: mediaUrl,
      caption,
      access_token: accessToken,
    };

    const data = await metaPost(endpoint, body);
    if (data.error) throw new Error(data.error.message);

    return { platform: 'facebook', success: true, postId: data.id };
  } catch (e: unknown) {
    return { platform: 'facebook', success: false, error: (e as Error).message };
  }
}

// ── TikTok ───────────────────────────────────────────────────────────────────
// TikTok Direct Post API requires a server-side OAuth flow.
// Route your backend to: POST /api/tiktok/publish
// which calls: POST https://open.tiktokapis.com/v2/post/publish/video/init/
//
// Required backend env vars (NOT client-safe):
//   TIKTOK_CLIENT_KEY
//   TIKTOK_CLIENT_SECRET

export async function publishToTikTok(
  videoUrl:    string,
  caption:     string,
  accessToken: string,
): Promise<PublishResult> {
  try {
    // Proxy through your backend — TikTok OAuth is server-side only
    const res = await fetch('/api/tiktok/publish', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ videoUrl, caption, accessToken }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(txt || `Backend returned ${res.status}`);
    }

    const data = await res.json() as { data?: { publish_id?: string } };
    return { platform: 'tiktok', success: true, postId: data.data?.publish_id };
  } catch (e: unknown) {
    return {
      platform: 'tiktok',
      success:  false,
      error:    (e as Error).message,
    };
  }
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

export async function publishToAll(
  mediaUrl:    string,
  caption:     string,
  platforms:   ('instagram' | 'facebook' | 'tiktok')[],
  creds:       MetaCredentials,
  mediaType:   'image' | 'video' = 'image',
  tiktokToken?: string,
): Promise<PublishResult[]> {
  return Promise.all(
    platforms.map(p => {
      if (p === 'instagram') return publishToInstagram(mediaUrl, caption, creds, mediaType);
      if (p === 'facebook')  return publishToFacebook(mediaUrl, caption, creds, mediaType);
      if (p === 'tiktok')    return publishToTikTok(mediaUrl, caption, tiktokToken ?? '');
      return Promise.resolve({ platform: p, success: false, error: 'Unknown platform' });
    })
  );
}

// ── Env helpers ──────────────────────────────────────────────────────────────

export function getMetaCredentials(): MetaCredentials {
  return {
    accessToken:        import.meta.env.VITE_META_ACCESS_TOKEN        ?? '',
    instagramAccountId: import.meta.env.VITE_META_INSTAGRAM_ACCOUNT_ID ?? '',
    facebookPageId:     import.meta.env.VITE_META_FACEBOOK_PAGE_ID    ?? '',
    adAccountId:        import.meta.env.VITE_META_AD_ACCOUNT_ID       ?? '',
  };
}

export function hasMeta(): boolean {
  const c = getMetaCredentials();
  return !!(c.accessToken && c.instagramAccountId);
}

// ── Token validation ──────────────────────────────────────────────────────────
// Hits /me to confirm the token is still alive.
// Returns null if valid, or an error string if expired/invalid.

export async function validateMetaToken(accessToken: string): Promise<string | null> {
  if (!accessToken) return 'No Meta access token configured';
  try {
    const res  = await fetch(`${META_BASE}/me?fields=id&access_token=${accessToken}`);
    const data = await res.json() as { id?: string; error?: { message: string; code?: number } };
    if (data.error) {
      const code = data.error.code;
      if (code === 190) return 'Meta token has expired — generate a new long-lived token';
      if (code === 100) return 'Invalid Meta access token';
      return `Meta token error: ${data.error.message}`;
    }
    return null; // valid
  } catch {
    return 'Could not reach Meta API — check your internet connection';
  }
}
