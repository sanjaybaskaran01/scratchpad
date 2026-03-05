/**
 * storage.js — IndexedDB + sessionStorage abstraction for scratchpad
 *
 * Clip object shape:
 * {
 *   id: string,
 *   type: 'text' | 'image',
 *   content: string | null,       // text content (possibly lz-compressed)
 *   language: string | null,      // detected/manual language
 *   compressed: boolean,
 *   sizeBytes: number,
 *   originalSizeBytes: number,
 *   label: string,
 *   ephemeral: boolean,           // true = sessionStorage only
 *   pinned: boolean,
 *   createdAt: number,
 *   expiresAt: number,
 *   accessedAt: number,
 *   contentHash: string | null,   // SHA-256 prefix for duplicate detection
 *   dimensions: {w,h} | null,     // for images
 *   mimeType: string | null,      // for images
 *   lineCount: number | null,     // for text
 *   schemaVersion: number,
 * }
 * Images are stored as Blobs in the 'blobs' object store.
 * The clip record stores blobId pointing to that store.
 */

const DB_NAME = 'scratchpad_db';
const DB_VERSION = 2; // bumped for contentHash index
const CLIP_TTL_MS = 24 * 60 * 60 * 1000; // 24h default
const SOFT_LIMIT_BYTES = 50 * 1024 * 1024; // 50 MB

let db = null;

function openDB() {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      const t = e.target.transaction;
      if (!d.objectStoreNames.contains('clips')) {
        const clips = d.createObjectStore('clips', { keyPath: 'id' });
        clips.createIndex('createdAt', 'createdAt');
        clips.createIndex('expiresAt', 'expiresAt');
        clips.createIndex('pinned', 'pinned');
        clips.createIndex('contentHash', 'contentHash');
      } else if (e.oldVersion < 2) {
        // Migration v1 → v2: add contentHash index
        const store = t.objectStore('clips');
        if (!store.indexNames.contains('contentHash')) {
          store.createIndex('contentHash', 'contentHash');
        }
      }
      if (!d.objectStoreNames.contains('blobs')) {
        d.createObjectStore('blobs', { keyPath: 'blobId' });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(stores, mode, fn) {
  return openDB().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(stores, mode);
    t.onerror = () => reject(t.error);
    resolve(fn(t));
  }));
}

function idbGet(store, key) {
  return tx(store, 'readonly', t => new Promise((res, rej) => {
    const r = t.objectStore(store).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

function idbPut(store, value) {
  return tx(store, 'readwrite', t => new Promise((res, rej) => {
    const r = t.objectStore(store).put(value);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

function idbDelete(store, key) {
  return tx(store, 'readwrite', t => new Promise((res, rej) => {
    const r = t.objectStore(store).delete(key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  }));
}

function idbGetAll(store) {
  return tx(store, 'readonly', t => new Promise((res, rej) => {
    const r = t.objectStore(store).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

// ── Session storage (ephemeral clips) ────────────────────────────────────────

const SESSION_KEY = 'scratchpad_session_clips';

function getSessionClips() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]');
  } catch { return []; }
}

function saveSessionClips(clips) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(clips));
  } catch (e) {
    console.warn('scratchpad: sessionStorage write failed', e);
  }
}

// ── Settings (localStorage) ────────────────────────────────────────────────

const SETTINGS_KEY = 'scratchpad_settings';

export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch { return {}; }
}

export function saveSetting(key, value) {
  const s = getSettings();
  s[key] = value;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (e) {
    console.warn('scratchpad: localStorage write failed', e);
  }
}

// ── Clip ID generation ────────────────────────────────────────────────────────

function genId() {
  return `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save a text clip. Ephemeral clips go to sessionStorage; saved go to IndexedDB.
 */
export async function saveTextClip(clip) {
  const full = {
    id: clip.id || genId(),
    type: 'text',
    content: clip.content,
    language: clip.language || null,
    compressed: clip.compressed || false,
    sizeBytes: clip.sizeBytes || new Blob([clip.content]).size,
    originalSizeBytes: clip.originalSizeBytes || new Blob([clip.content]).size,
    label: clip.label || '',
    ephemeral: clip.ephemeral !== false,
    pinned: clip.pinned || false,
    createdAt: clip.createdAt || Date.now(),
    expiresAt: clip.pinned ? Infinity : (clip.createdAt || Date.now()) + CLIP_TTL_MS,
    accessedAt: Date.now(),
    contentHash: clip.contentHash || null,
    lineCount: clip.lineCount || null,
    dimensions: null,
    mimeType: null,
    schemaVersion: 2,
  };

  if (full.ephemeral) {
    const clips = getSessionClips();
    const existing = clips.findIndex(c => c.id === full.id);
    if (existing >= 0) clips[existing] = full; else clips.unshift(full);
    saveSessionClips(clips);
  } else {
    await idbPut('clips', full);
  }
  return full;
}

/**
 * Save an image clip (Blob) to IndexedDB.
 */
export async function saveImageClip(blob, meta = {}) {
  const id = meta.id || genId();
  const blobId = `blob_${id}`;
  const clip = {
    id,
    type: 'image',
    content: null,
    blobId,
    mimeType: blob.type || 'image/png',
    language: null,
    compressed: false,
    sizeBytes: blob.size,
    originalSizeBytes: meta.originalSizeBytes || blob.size,
    label: meta.label || '',
    ephemeral: false,
    pinned: meta.pinned || false,
    createdAt: Date.now(),
    expiresAt: meta.pinned ? Infinity : Date.now() + CLIP_TTL_MS,
    accessedAt: Date.now(),
    contentHash: meta.contentHash || null,
    dimensions: meta.dimensions || null,
    lineCount: null,
    schemaVersion: 2,
  };
  await Promise.all([
    idbPut('blobs', { blobId, data: blob }),
    idbPut('clips', clip),
  ]);
  return clip;
}

/**
 * Find a clip by its content hash (for duplicate detection).
 * Checks session clips first, then IndexedDB.
 */
export async function findByHash(hash) {
  if (!hash) return null;
  const session = getSessionClips().find(c => c.contentHash === hash);
  if (session) return session;
  const saved = await idbGetAll('clips');
  return saved.find(c => c.contentHash === hash) || null;
}

/**
 * Promote an ephemeral session clip to a saved IndexedDB clip.
 */
export async function pinClip(id) {
  // Check session first
  const sessionClips = getSessionClips();
  const idx = sessionClips.findIndex(c => c.id === id);
  if (idx >= 0) {
    const clip = { ...sessionClips[idx], ephemeral: false, pinned: true, expiresAt: Infinity };
    sessionClips.splice(idx, 1);
    saveSessionClips(sessionClips);
    await idbPut('clips', clip);
    return clip;
  }
  // Already in IDB — update pin status
  const clip = await idbGet('clips', id);
  if (clip) {
    clip.pinned = true;
    clip.expiresAt = Infinity;
    await idbPut('clips', clip);
    return clip;
  }
  return null;
}

/**
 * Unpin a saved clip (convert back to 24h TTL).
 */
export async function unpinClip(id) {
  const clip = await idbGet('clips', id);
  if (clip) {
    clip.pinned = false;
    clip.expiresAt = Date.now() + CLIP_TTL_MS;
    await idbPut('clips', clip);
    return clip;
  }
  return null;
}

/**
 * Delete a clip by id.
 */
export async function deleteClip(id) {
  // Remove from session
  const sessionClips = getSessionClips();
  const idx = sessionClips.findIndex(c => c.id === id);
  if (idx >= 0) {
    sessionClips.splice(idx, 1);
    saveSessionClips(sessionClips);
    return;
  }
  // Remove from IDB (and blob if image)
  const clip = await idbGet('clips', id);
  if (clip) {
    await idbDelete('clips', id);
    if (clip.blobId) await idbDelete('blobs', clip.blobId);
  }
}

/**
 * Get a blob for an image clip.
 */
export async function getBlob(blobId) {
  const record = await idbGet('blobs', blobId);
  return record ? record.data : null;
}

/**
 * Load all clips (session + saved), newest first.
 */
export async function getAllClips() {
  const [saved, session] = await Promise.all([
    idbGetAll('clips'),
    Promise.resolve(getSessionClips()),
  ]);
  // Merge, deduplicate by id (session wins), sort newest first
  const map = new Map();
  saved.forEach(c => map.set(c.id, c));
  session.forEach(c => map.set(c.id, c)); // session overrides
  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Purge expired clips from IndexedDB.
 */
export async function purgeExpired() {
  const clips = await idbGetAll('clips');
  const now = Date.now();
  const expired = clips.filter(c => !c.pinned && c.expiresAt !== Infinity && c.expiresAt < now);
  await Promise.all(expired.map(c => deleteClip(c.id)));
  return expired.length;
}

/**
 * Estimate total storage used (IndexedDB clips + session).
 * Returns bytes.
 */
export async function estimateStorageUsed() {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    return est.usage || 0;
  }
  // Fallback: sum clip sizes
  const clips = await getAllClips();
  return clips.reduce((sum, c) => sum + (c.sizeBytes || 0), 0);
}

export { SOFT_LIMIT_BYTES, CLIP_TTL_MS };
