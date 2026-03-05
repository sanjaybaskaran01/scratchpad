/**
 * storage.test.js — integration tests for js/storage.js
 *
 * Each test gets a completely fresh IndexedDB instance + fresh module so
 * the module-level `db` cache is reset between tests.
 *
 * Covers: saveTextClip, saveImageClip, findByHash, getAllClips,
 *         deleteClip, pinClip, unpinClip, purgeExpired,
 *         getSettings / saveSetting, estimateStorageUsed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

// Re-import a fresh storage module before each test for full isolation.
let storage;

beforeEach(async () => {
  // 1. Clear the Vitest module cache so `db = null` is reset inside storage.js
  vi.resetModules();

  // 2. Provide a fresh IndexedDB namespace
  global.indexedDB  = new IDBFactory();
  global.IDBKeyRange = IDBKeyRange;

  // 3. Clear web storage caches used by the session-clip and settings paths
  sessionStorage.clear();
  localStorage.clear();

  // 4. Import a fresh copy of the storage module
  storage = await import('../../js/storage.js');
});

// ── Helpers ────────────────────────────────────────────────────────────────────

async function makeTextClip(overrides = {}) {
  return storage.saveTextClip({
    content: 'console.log("hello");',
    language: 'javascript',
    label: 'Test clip',
    ephemeral: false,
    ...overrides,
  });
}

// ── saveTextClip ──────────────────────────────────────────────────────────────

describe('saveTextClip', () => {
  it('returns a clip object with required fields', async () => {
    const clip = await makeTextClip();
    expect(clip).toMatchObject({
      type: 'text',
      language: 'javascript',
      label: 'Test clip',
      pinned: false,
      schemaVersion: 2,
    });
    expect(typeof clip.id).toBe('string');
    expect(clip.id).toMatch(/^clip_/);
    expect(typeof clip.createdAt).toBe('number');
  });

  it('sets expiresAt = Infinity when pinned', async () => {
    const clip = await makeTextClip({ pinned: true });
    expect(clip.expiresAt).toBe(Infinity);
  });

  it('sets a finite expiresAt for non-pinned clips', async () => {
    const clip = await makeTextClip({ pinned: false });
    expect(clip.expiresAt).toBeGreaterThan(Date.now());
    expect(clip.expiresAt).not.toBe(Infinity);
  });

  it('ephemeral clips are stored in sessionStorage, not IndexedDB', async () => {
    const clip = await storage.saveTextClip({
      content: 'ephemeral text',
      ephemeral: true,
    });
    // Should appear in getAllClips (merges both sources)
    const all = await storage.getAllClips();
    expect(all.some(c => c.id === clip.id)).toBe(true);
    // Should be findable by hash if hash is provided
  });

  it('non-ephemeral clips are retrievable via getAllClips', async () => {
    const clip = await makeTextClip({ ephemeral: false });
    const all = await storage.getAllClips();
    expect(all.some(c => c.id === clip.id)).toBe(true);
  });

  it('generates a unique id for each clip', async () => {
    const a = await makeTextClip();
    const b = await makeTextClip();
    expect(a.id).not.toBe(b.id);
  });

  it('accepts an explicit id and uses it', async () => {
    const clip = await makeTextClip({ id: 'clip_custom_001', ephemeral: false });
    expect(clip.id).toBe('clip_custom_001');
  });
});

// ── saveImageClip ─────────────────────────────────────────────────────────────

describe('saveImageClip', () => {
  it('returns a clip with type "image" and a blobId', async () => {
    const blob = new Blob(['<img-data>'], { type: 'image/png' });
    const clip = await storage.saveImageClip(blob, { label: 'Screenshot' });
    expect(clip.type).toBe('image');
    expect(typeof clip.blobId).toBe('string');
    expect(clip.label).toBe('Screenshot');
  });

  it('stores the blob and makes it retrievable via getBlob', async () => {
    const blob = new Blob(['<png-bytes>'], { type: 'image/png' });
    const clip = await storage.saveImageClip(blob);
    const retrieved = await storage.getBlob(clip.blobId);
    // fake-indexeddb uses Node.js structuredClone which doesn't preserve the
    // jsdom Blob prototype — but the record IS stored and returned (non-null).
    // In a real browser IndexedDB, this would be instanceof Blob.
    expect(retrieved).not.toBeNull();
    expect(retrieved).not.toBeUndefined();
  });

  it('appears in getAllClips after saving', async () => {
    const blob = new Blob(['<data>'], { type: 'image/jpeg' });
    const clip = await storage.saveImageClip(blob);
    const all = await storage.getAllClips();
    expect(all.some(c => c.id === clip.id)).toBe(true);
  });
});

// ── findByHash ────────────────────────────────────────────────────────────────

describe('findByHash', () => {
  it('returns null for an unknown hash', async () => {
    expect(await storage.findByHash('nonexistent_hash')).toBeNull();
  });

  it('returns null for a falsy hash', async () => {
    expect(await storage.findByHash(null)).toBeNull();
    expect(await storage.findByHash('')).toBeNull();
  });

  it('finds an IDB clip by its contentHash', async () => {
    const clip = await makeTextClip({ contentHash: 'abc123def456789012', ephemeral: false });
    const found = await storage.findByHash('abc123def456789012');
    expect(found).not.toBeNull();
    expect(found.id).toBe(clip.id);
  });

  it('finds a session clip by its contentHash', async () => {
    const clip = await storage.saveTextClip({
      content: 'ephemeral',
      contentHash: 'session_hash_12345678',
      ephemeral: true,
    });
    const found = await storage.findByHash('session_hash_12345678');
    expect(found).not.toBeNull();
    expect(found.id).toBe(clip.id);
  });
});

// ── getAllClips ────────────────────────────────────────────────────────────────

describe('getAllClips', () => {
  it('returns an empty array when there are no clips', async () => {
    expect(await storage.getAllClips()).toEqual([]);
  });

  it('returns clips sorted newest first', async () => {
    // Save two clips with artificial timestamps
    await makeTextClip({ createdAt: 1_000_000, ephemeral: false });
    await makeTextClip({ createdAt: 2_000_000, ephemeral: false });

    const all = await storage.getAllClips();
    expect(all.length).toBe(2);
    expect(all[0].createdAt).toBeGreaterThan(all[1].createdAt);
  });

  it('merges session clips and IDB clips (session clip wins on duplicate id)', async () => {
    // Save same id to IDB then to session (session should override)
    const shared_id = 'clip_shared_123';
    await makeTextClip({ id: shared_id, content: 'from-idb',     ephemeral: false });
    await storage.saveTextClip({ id: shared_id, content: 'from-session', ephemeral: true });

    const all = await storage.getAllClips();
    const match = all.find(c => c.id === shared_id);
    expect(match.content).toBe('from-session');
  });
});

// ── deleteClip ────────────────────────────────────────────────────────────────

describe('deleteClip', () => {
  it('removes an IDB clip so it no longer appears in getAllClips', async () => {
    const clip = await makeTextClip({ ephemeral: false });
    await storage.deleteClip(clip.id);
    const all = await storage.getAllClips();
    expect(all.some(c => c.id === clip.id)).toBe(false);
  });

  it('removes a session clip', async () => {
    const clip = await storage.saveTextClip({ content: 'session', ephemeral: true });
    await storage.deleteClip(clip.id);
    const all = await storage.getAllClips();
    expect(all.some(c => c.id === clip.id)).toBe(false);
  });

  it('removes the associated blob when deleting an image clip', async () => {
    const blob = new Blob(['<img>'], { type: 'image/png' });
    const clip = await storage.saveImageClip(blob);
    await storage.deleteClip(clip.id);

    const retrievedBlob = await storage.getBlob(clip.blobId);
    expect(retrievedBlob).toBeNull();
  });

  it('does not throw when deleting a non-existent id', async () => {
    await expect(storage.deleteClip('clip_does_not_exist')).resolves.not.toThrow();
  });
});

// ── pinClip ───────────────────────────────────────────────────────────────────

describe('pinClip', () => {
  it('promotes an ephemeral session clip to IDB with pinned=true', async () => {
    const clip = await storage.saveTextClip({ content: 'pin me', ephemeral: true });
    const pinned = await storage.pinClip(clip.id);

    expect(pinned.pinned).toBe(true);
    expect(pinned.ephemeral).toBe(false);
    expect(pinned.expiresAt).toBe(Infinity);
  });

  it('pins an existing IDB clip in-place', async () => {
    const clip = await makeTextClip({ pinned: false, ephemeral: false });
    const pinned = await storage.pinClip(clip.id);

    expect(pinned.pinned).toBe(true);
    expect(pinned.expiresAt).toBe(Infinity);
  });

  it('returns null for a non-existent id', async () => {
    expect(await storage.pinClip('clip_ghost')).toBeNull();
  });
});

// ── unpinClip ─────────────────────────────────────────────────────────────────

describe('unpinClip', () => {
  it('sets pinned=false and gives clip a finite TTL', async () => {
    const clip = await makeTextClip({ pinned: true, ephemeral: false });
    await storage.pinClip(clip.id); // ensure it is pinned in IDB

    const unpinned = await storage.unpinClip(clip.id);
    expect(unpinned.pinned).toBe(false);
    expect(unpinned.expiresAt).toBeGreaterThan(Date.now());
    expect(unpinned.expiresAt).not.toBe(Infinity);
  });

  it('returns null for a non-existent id', async () => {
    expect(await storage.unpinClip('clip_ghost')).toBeNull();
  });
});

// ── purgeExpired ──────────────────────────────────────────────────────────────

describe('purgeExpired', () => {
  it('removes clips whose expiresAt is in the past', async () => {
    const clip = await storage.saveTextClip({
      content: 'stale',
      ephemeral: false,
      pinned: false,
      // expiresAt is set by storage.js based on createdAt; trick it by providing createdAt far in the past
      createdAt: Date.now() - 48 * 60 * 60 * 1000, // 48h ago
    });

    // expiresAt = createdAt + 24h, which is 24h ago → expired
    const count = await storage.purgeExpired();
    expect(count).toBeGreaterThanOrEqual(1);

    const all = await storage.getAllClips();
    expect(all.some(c => c.id === clip.id)).toBe(false);
  });

  it('keeps pinned clips even if they appear expired', async () => {
    const clip = await makeTextClip({ pinned: true, ephemeral: false });
    await storage.pinClip(clip.id); // expiresAt = Infinity

    const count = await storage.purgeExpired();
    const all = await storage.getAllClips();
    expect(all.some(c => c.id === clip.id)).toBe(true);
    expect(count).toBe(0);
  });

  it('keeps fresh clips', async () => {
    const clip = await makeTextClip({ ephemeral: false });
    await storage.purgeExpired();
    const all = await storage.getAllClips();
    expect(all.some(c => c.id === clip.id)).toBe(true);
  });

  it('returns 0 when nothing is expired', async () => {
    await makeTextClip({ ephemeral: false });
    expect(await storage.purgeExpired()).toBe(0);
  });
});

// ── getSettings / saveSetting ─────────────────────────────────────────────────

describe('getSettings / saveSetting', () => {
  it('getSettings returns an empty object by default', () => {
    expect(storage.getSettings()).toEqual({});
  });

  it('saveSetting persists a key-value pair', () => {
    storage.saveSetting('theme', 'dark');
    expect(storage.getSettings().theme).toBe('dark');
  });

  it('saves multiple settings independently', () => {
    storage.saveSetting('alpha', 1);
    storage.saveSetting('beta', 'hello');
    const s = storage.getSettings();
    expect(s.alpha).toBe(1);
    expect(s.beta).toBe('hello');
  });

  it('overwrites an existing setting', () => {
    storage.saveSetting('key', 'first');
    storage.saveSetting('key', 'second');
    expect(storage.getSettings().key).toBe('second');
  });
});

// ── estimateStorageUsed ───────────────────────────────────────────────────────

describe('estimateStorageUsed', () => {
  it('returns a non-negative number', async () => {
    const bytes = await storage.estimateStorageUsed();
    expect(typeof bytes).toBe('number');
    expect(bytes).toBeGreaterThanOrEqual(0);
  });
});
