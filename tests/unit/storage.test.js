/**
 * storage.test.js — integration tests for src/lib/storage.js
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

// ── BroadcastChannel mock ────────────────────────────────────────────────────
// Simulates cross-tab messaging: all instances share a global listener list.

const bcListeners = [];

class MockBroadcastChannel {
  constructor(name) {
    this.name = name;
    this._handlers = [];
    bcListeners.push(this);
  }
  postMessage(data) {
    // Deliver to ALL instances with same name (including self for single-process testing)
    for (const ch of bcListeners) {
      if (ch.name === this.name) {
        const event = { data };
        for (const h of ch._handlers) h(event);
        if (ch.onmessage) ch.onmessage(event);
      }
    }
  }
  addEventListener(type, handler) {
    if (type === 'message') this._handlers.push(handler);
  }
  removeEventListener(type, handler) {
    if (type === 'message') {
      this._handlers = this._handlers.filter(h => h !== handler);
    }
  }
  close() {
    const idx = bcListeners.indexOf(this);
    if (idx >= 0) bcListeners.splice(idx, 1);
  }
}

global.BroadcastChannel = MockBroadcastChannel;

let storage;

beforeEach(async () => {
  vi.resetModules();

  global.indexedDB  = new IDBFactory();
  global.IDBKeyRange = IDBKeyRange;

  // Clear all existing channels
  bcListeners.length = 0;

  sessionStorage.clear();
  localStorage.clear();

  storage = await import('../../src/lib/storage.js');
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
    const all = await storage.getAllClips();
    expect(all.some(c => c.id === clip.id)).toBe(true);
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
    await makeTextClip({ createdAt: 1_000_000, ephemeral: false });
    await makeTextClip({ createdAt: 2_000_000, ephemeral: false });

    const all = await storage.getAllClips();
    expect(all.length).toBe(2);
    expect(all[0].createdAt).toBeGreaterThan(all[1].createdAt);
  });

  it('merges session clips and IDB clips (session clip wins on duplicate id)', async () => {
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
    await storage.pinClip(clip.id);

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
      createdAt: Date.now() - 48 * 60 * 60 * 1000, // 48h ago
    });

    const count = await storage.purgeExpired();
    expect(count).toBeGreaterThanOrEqual(1);

    const all = await storage.getAllClips();
    expect(all.some(c => c.id === clip.id)).toBe(false);
  });

  it('keeps pinned clips even if they appear expired', async () => {
    const clip = await makeTextClip({ pinned: true, ephemeral: false });
    await storage.pinClip(clip.id);

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

// ── Cross-tab sync (BroadcastChannel) ────────────────────────────────────────

describe('onStorageChange — cross-tab sync', () => {
  it('fires when a non-ephemeral text clip is saved', async () => {
    const events = [];
    storage.onStorageChange((msg) => events.push(msg));

    await makeTextClip({ ephemeral: false });
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('save');
    expect(events[0].clipId).toMatch(/^clip_/);
    expect(typeof events[0].timestamp).toBe('number');
  });

  it('does NOT fire for ephemeral (session) text clips', async () => {
    const events = [];
    storage.onStorageChange((msg) => events.push(msg));

    await storage.saveTextClip({ content: 'ephemeral', ephemeral: true });
    expect(events).toHaveLength(0);
  });

  it('fires when an image clip is saved', async () => {
    const events = [];
    storage.onStorageChange((msg) => events.push(msg));

    const blob = new Blob(['<img>'], { type: 'image/png' });
    await storage.saveImageClip(blob, { label: 'test' });
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('save');
  });

  it('fires when an IDB clip is deleted', async () => {
    const clip = await makeTextClip({ ephemeral: false });
    const events = [];
    storage.onStorageChange((msg) => events.push(msg));

    await storage.deleteClip(clip.id);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('delete');
    expect(events[0].clipId).toBe(clip.id);
  });

  it('does NOT fire when a session clip is deleted', async () => {
    const clip = await storage.saveTextClip({ content: 'x', ephemeral: true });
    const events = [];
    storage.onStorageChange((msg) => events.push(msg));

    await storage.deleteClip(clip.id);
    expect(events).toHaveLength(0);
  });

  it('fires on pinClip (from session)', async () => {
    const clip = await storage.saveTextClip({ content: 'pin me', ephemeral: true });
    const events = [];
    storage.onStorageChange((msg) => events.push(msg));

    await storage.pinClip(clip.id);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('pin');
  });

  it('fires on pinClip (from IDB)', async () => {
    const clip = await makeTextClip({ ephemeral: false });
    const events = [];
    storage.onStorageChange((msg) => events.push(msg));

    await storage.pinClip(clip.id);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('pin');
  });

  it('fires on unpinClip', async () => {
    const clip = await makeTextClip({ pinned: true, ephemeral: false });
    const events = [];
    storage.onStorageChange((msg) => events.push(msg));

    await storage.unpinClip(clip.id);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('unpin');
  });

  it('fires on restoreClip (IDB text)', async () => {
    const clip = await makeTextClip({ ephemeral: false });
    await storage.deleteClip(clip.id);
    const events = [];
    storage.onStorageChange((msg) => events.push(msg));

    await storage.restoreClip(clip);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('restore');
  });

  it('fires on restoreClip (image)', async () => {
    const blob = new Blob(['<img>'], { type: 'image/png' });
    const clip = await storage.saveImageClip(blob, { label: 'img' });
    await storage.deleteClip(clip.id);
    const events = [];
    storage.onStorageChange((msg) => events.push(msg));

    await storage.restoreClip(clip, blob);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('restore');
  });

  it('does NOT fire on restoreClip for ephemeral text clips', async () => {
    const clip = await storage.saveTextClip({ content: 'e', ephemeral: true });
    const snapshot = { ...clip };
    await storage.deleteClip(clip.id);
    const events = [];
    storage.onStorageChange((msg) => events.push(msg));

    await storage.restoreClip(snapshot);
    expect(events).toHaveLength(0);
  });

  it('cleanup function removes the listener', async () => {
    const events = [];
    const unsub = storage.onStorageChange((msg) => events.push(msg));

    await makeTextClip({ ephemeral: false });
    expect(events).toHaveLength(1);

    unsub();
    await makeTextClip({ ephemeral: false });
    expect(events).toHaveLength(1); // no new events after unsub
  });

  it('multiple listeners all receive events', async () => {
    const events1 = [];
    const events2 = [];
    storage.onStorageChange((msg) => events1.push(msg));
    storage.onStorageChange((msg) => events2.push(msg));

    await makeTextClip({ ephemeral: false });
    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);
  });

  it('tracks a sequence of save → pin → delete correctly', async () => {
    const events = [];
    storage.onStorageChange((msg) => events.push(msg));

    const clip = await makeTextClip({ ephemeral: false });
    await storage.pinClip(clip.id);
    await storage.deleteClip(clip.id);

    expect(events).toHaveLength(3);
    expect(events.map(e => e.action)).toEqual(['save', 'pin', 'delete']);
    expect(events.every(e => e.clipId === clip.id)).toBe(true);
  });

  it('rapid-fire saves produce one event per save', async () => {
    const events = [];
    storage.onStorageChange((msg) => events.push(msg));

    await Promise.all([
      makeTextClip({ ephemeral: false }),
      makeTextClip({ ephemeral: false }),
      makeTextClip({ ephemeral: false }),
    ]);
    expect(events).toHaveLength(3);
  });
});

// ── Multi-tab data consistency ───────────────────────────────────────────────

describe('multi-tab data consistency', () => {
  it('getAllClips reflects IDB changes made since last call', async () => {
    const clip1 = await makeTextClip({ ephemeral: false });
    const firstLoad = await storage.getAllClips();
    expect(firstLoad.some(c => c.id === clip1.id)).toBe(true);

    // Simulate "another tab" saving a clip (direct IDB write)
    const clip2 = await makeTextClip({ ephemeral: false });
    const secondLoad = await storage.getAllClips();
    expect(secondLoad.some(c => c.id === clip2.id)).toBe(true);
    expect(secondLoad.length).toBeGreaterThan(firstLoad.length);
  });

  it('getAllClips reflects IDB deletions', async () => {
    const clip = await makeTextClip({ ephemeral: false });
    expect((await storage.getAllClips()).some(c => c.id === clip.id)).toBe(true);

    await storage.deleteClip(clip.id);
    expect((await storage.getAllClips()).some(c => c.id === clip.id)).toBe(false);
  });

  it('pinClip from one tab is visible via getAllClips from another', async () => {
    const clip = await storage.saveTextClip({ content: 'test', ephemeral: true });
    await storage.pinClip(clip.id);

    const all = await storage.getAllClips();
    const found = all.find(c => c.id === clip.id);
    expect(found).toBeDefined();
    expect(found.pinned).toBe(true);
    expect(found.ephemeral).toBe(false);
  });

  it('concurrent saves with different IDs do not overwrite each other', async () => {
    const results = await Promise.all([
      storage.saveTextClip({ content: 'clip-A', id: 'clip_A', ephemeral: false }),
      storage.saveTextClip({ content: 'clip-B', id: 'clip_B', ephemeral: false }),
      storage.saveTextClip({ content: 'clip-C', id: 'clip_C', ephemeral: false }),
    ]);

    const all = await storage.getAllClips();
    for (const clip of results) {
      expect(all.some(c => c.id === clip.id)).toBe(true);
    }
  });

  it('deleting a clip that was just pinned in IDB succeeds', async () => {
    const clip = await storage.saveTextClip({ content: 'pin-then-delete', ephemeral: true });
    await storage.pinClip(clip.id);
    await storage.deleteClip(clip.id);

    const all = await storage.getAllClips();
    expect(all.some(c => c.id === clip.id)).toBe(false);
  });

  it('restoreClip after delete re-adds the clip to getAllClips', async () => {
    const clip = await makeTextClip({ ephemeral: false });
    const snapshot = { ...clip };
    await storage.deleteClip(clip.id);
    expect((await storage.getAllClips()).some(c => c.id === clip.id)).toBe(false);

    await storage.restoreClip(snapshot);
    expect((await storage.getAllClips()).some(c => c.id === clip.id)).toBe(true);
  });

  it('image clip save + delete + restore round-trip preserves blob', async () => {
    const blob = new Blob(['<pixel-data>'], { type: 'image/png' });
    const clip = await storage.saveImageClip(blob, { label: 'roundtrip' });

    const blobBefore = await storage.getBlob(clip.blobId);
    expect(blobBefore).not.toBeNull();

    await storage.deleteClip(clip.id);
    expect(await storage.getBlob(clip.blobId)).toBeNull();

    await storage.restoreClip(clip, blob);
    const blobAfter = await storage.getBlob(clip.blobId);
    expect(blobAfter).not.toBeNull();
  });
});
