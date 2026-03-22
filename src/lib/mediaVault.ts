// ─── Media Vault ──────────────────────────────────────────────────────────────
// IndexedDB-backed local media library.
// Files are stored locally for preview; uploaded to Replicate on demand for API use.

const DB_NAME    = 'scaleai_vault';
const DB_VERSION = 1;
const STORE      = 'media';

export interface VaultFile {
  id:         string;
  name:       string;
  mime:       string;
  blob:       Blob;
  thumb:      string;      // base64 JPEG thumbnail (~160px)
  remoteUrl?: string;      // Replicate file URL once uploaded
  addedAt:    string;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: 'id' });
    };
    r.onsuccess = e => res((e.target as IDBOpenDBRequest).result);
    r.onerror   = e => rej((e.target as IDBOpenDBRequest).error);
  });
}

export async function vaultList(): Promise<VaultFile[]> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    r.onsuccess = () => res((r.result ?? []).sort((a: VaultFile, b: VaultFile) => b.addedAt.localeCompare(a.addedAt)));
    r.onerror   = () => rej(r.error);
  });
}

export async function vaultAdd(file: File): Promise<VaultFile> {
  const thumb = await makeThumbnail(file);
  const entry: VaultFile = {
    id: crypto.randomUUID(), name: file.name, mime: file.type,
    blob: file, thumb, addedAt: new Date().toISOString(),
  };
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE, 'readwrite').objectStore(STORE).add(entry);
    r.onsuccess = () => res(entry);
    r.onerror   = () => rej(r.error);
  });
}

export async function vaultDelete(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
    r.onsuccess = () => res();
    r.onerror   = () => rej(r.error);
  });
}

export async function vaultUpdate(entry: VaultFile): Promise<void> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE, 'readwrite').objectStore(STORE).put(entry);
    r.onsuccess = () => res();
    r.onerror   = () => rej(r.error);
  });
}

// ── Replicate file upload ─────────────────────────────────────────────────────
// Uploads blob to Replicate's own CDN → returns a public URL the API can access.

export async function uploadToReplicate(
  blob:   Blob,
  name:   string,
  token:  string,
  signal?: AbortSignal,
): Promise<string> {
  const form = new FormData();
  form.append('content', blob, name);
  const res = await fetch('https://api.replicate.com/v1/files', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
    body: form, signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`File upload failed (${res.status}): ${txt}`);
  }
  const data = await res.json();
  return data.urls?.get ?? data.url ?? '';
}

// ── Thumbnail generator ───────────────────────────────────────────────────────

export function makeThumbnail(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 160;
        const r   = Math.min(MAX / img.width, MAX / img.height, 1);
        const c   = document.createElement('canvas');
        c.width = img.width * r; c.height = img.height * r;
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = rej;
      img.src = e.target!.result as string;
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}
