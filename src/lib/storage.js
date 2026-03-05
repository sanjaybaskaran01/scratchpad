/**
 * storage.js — IndexedDB + sessionStorage abstraction, backed by `idb`.
 */
import { openDB as idbOpen } from 'idb';

const DB_NAME    = 'scratchpad_db';
const DB_VERSION = 2;
const CLIP_TTL_MS    = 24 * 60 * 60 * 1000; // 24 h default
const SOFT_LIMIT_BYTES = 50 * 1024 * 1024;  // 50 MB

let db = null;

async function getDB() {
  if (db) return db;
  db = await idbOpen(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion, newVersion, transaction) {
      if (oldVersion < 1) {
        const clips = database.createObjectStore('clips', { keyPath: 'id' });
        clips.createIndex('createdAt',   'createdAt');
        clips.createIndex('expiresAt',   'expiresAt');
        clips.createIndex('pinned',      'pinned');
        clips.createIndex('contentHash', 'contentHash');
        database.createObjectStore('blobs', { keyPath: 'blobId' });
      }
      if (oldVersion >= 1 && oldVersion < 2) {
        const store = transaction.objectStore('clips');
        if (!store.indexNames.contains('contentHash')) {
          store.createIndex('contentHash', 'contentHash');
        }
      }
    },
  });
  return db;
}

// ── Session storage (ephemeral clips) ─────────────────────────────────────────

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
    console.warn('typehere: sessionStorage write failed', e);
  }
}

// ── Settings (localStorage) ───────────────────────────────────────────────────

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
    console.warn('typehere: localStorage write failed', e);
  }
}

// ── Clip ID generation ────────────────────────────────────────────────────────

function genId() {
  return `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

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
    const d = await getDB();
    await d.put('clips', full);
  }
  return full;
}

export async function saveImageClip(blob, meta = {}) {
  const id    = meta.id || genId();
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
  const d = await getDB();
  await Promise.all([
    d.put('blobs', { blobId, data: blob }),
    d.put('clips', clip),
  ]);
  return clip;
}

/**
 * Restore a previously deleted clip exactly as it was, preserving all fields.
 * For image clips, pass the blob that was fetched before deletion.
 */
export async function restoreClip(clip, blob = null) {
  if (clip.type === 'image' && blob) {
    const d = await getDB();
    await Promise.all([
      d.put('clips', clip),
      d.put('blobs', { blobId: clip.blobId, data: blob }),
    ]);
  } else if (clip.type === 'text') {
    if (clip.ephemeral) {
      const clips = getSessionClips();
      const idx = clips.findIndex(c => c.id === clip.id);
      if (idx >= 0) clips[idx] = clip; else clips.unshift(clip);
      saveSessionClips(clips);
    } else {
      const d = await getDB();
      await d.put('clips', clip);
    }
  }
}

export async function findByHash(hash) {
  if (!hash) return null;
  const session = getSessionClips().find(c => c.contentHash === hash);
  if (session) return session;
  const d = await getDB();
  const saved = await d.getAll('clips');
  return saved.find(c => c.contentHash === hash) || null;
}

export async function pinClip(id) {
  const sessionClips = getSessionClips();
  const idx = sessionClips.findIndex(c => c.id === id);
  if (idx >= 0) {
    const clip = { ...sessionClips[idx], ephemeral: false, pinned: true, expiresAt: Infinity };
    sessionClips.splice(idx, 1);
    saveSessionClips(sessionClips);
    const d = await getDB();
    await d.put('clips', clip);
    return clip;
  }
  const d = await getDB();
  const clip = await d.get('clips', id);
  if (clip) {
    clip.pinned   = true;
    clip.expiresAt = Infinity;
    await d.put('clips', clip);
    return clip;
  }
  return null;
}

export async function unpinClip(id) {
  const d = await getDB();
  const clip = await d.get('clips', id);
  if (clip) {
    clip.pinned   = false;
    clip.expiresAt = Date.now() + CLIP_TTL_MS;
    await d.put('clips', clip);
    return clip;
  }
  return null;
}

export async function deleteClip(id) {
  const sessionClips = getSessionClips();
  const idx = sessionClips.findIndex(c => c.id === id);
  if (idx >= 0) {
    sessionClips.splice(idx, 1);
    saveSessionClips(sessionClips);
    return;
  }
  const d = await getDB();
  const clip = await d.get('clips', id);
  if (clip) {
    await d.delete('clips', id);
    if (clip.blobId) await d.delete('blobs', clip.blobId);
  }
}

export async function getBlob(blobId) {
  const d = await getDB();
  const record = await d.get('blobs', blobId);
  return record ? record.data : null;
}

export async function getAllClips() {
  const d = await getDB();
  const [saved, session] = await Promise.all([
    d.getAll('clips'),
    Promise.resolve(getSessionClips()),
  ]);
  const map = new Map();
  saved.forEach(c => map.set(c.id, c));
  session.forEach(c => map.set(c.id, c));
  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function purgeExpired() {
  const d = await getDB();
  const clips = await d.getAll('clips');
  const now = Date.now();
  const expired = clips.filter(c => !c.pinned && c.expiresAt !== Infinity && c.expiresAt < now);
  await Promise.all(expired.map(c => deleteClip(c.id)));
  return expired.length;
}

export async function estimateStorageUsed() {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    return est.usage || 0;
  }
  const clips = await getAllClips();
  return clips.reduce((sum, c) => sum + (c.sizeBytes || 0), 0);
}

export { SOFT_LIMIT_BYTES, CLIP_TTL_MS };
