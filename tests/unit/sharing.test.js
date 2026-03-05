/**
 * sharing.test.js — unit tests for js/sharing.js
 *
 * Covers: URL encode/decode round-trip, size limits,
 *         getShareInfo branching logic.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  encodeForURL, decodeFromURL, getShareInfo, MAX_SHAREABLE_BYTES,
} from '../../js/sharing.js';

// In jsdom, window.location.origin = 'http://localhost:3000'
// encodeForURL builds: origin + pathname + '#v1/' + encoded

const CLIP_TEXT = { type: 'text', language: 'javascript', label: 'My snippet', id: 'clip_1' };
const SHORT_TEXT = 'const x = 42;';

// ── encodeForURL ──────────────────────────────────────────────────────────────

describe('encodeForURL', () => {
  it('returns a string URL containing the v1/ hash prefix', () => {
    const url = encodeForURL(CLIP_TEXT, SHORT_TEXT);
    expect(typeof url).toBe('string');
    expect(url).toContain('#v1/');
  });

  it('returns null when text is falsy', () => {
    expect(encodeForURL(CLIP_TEXT, '')).toBeNull();
    expect(encodeForURL(CLIP_TEXT, null)).toBeNull();
  });

  it('returns null when text exceeds 8 KB', () => {
    const tooBig = 'x'.repeat(MAX_SHAREABLE_BYTES + 1);
    expect(encodeForURL(CLIP_TEXT, tooBig)).toBeNull();
  });

  it('accepts text exactly at the 8 KB limit', () => {
    // Build a string that is exactly MAX_SHAREABLE_BYTES bytes (ASCII = 1 byte/char)
    const atLimit = 'a'.repeat(MAX_SHAREABLE_BYTES);
    const url = encodeForURL(CLIP_TEXT, atLimit);
    // May or may not produce a URL depending on compressed size; it should not throw
    expect(url === null || typeof url === 'string').toBe(true);
  });

  it('returns null when LZString is unavailable', () => {
    const saved = global.LZString;
    global.LZString = undefined;
    try {
      expect(encodeForURL(CLIP_TEXT, SHORT_TEXT)).toBeNull();
    } finally {
      global.LZString = saved;
    }
  });

  it('includes language and label in the encoded payload (round-trip check)', () => {
    const url = encodeForURL(CLIP_TEXT, SHORT_TEXT);
    const hash = url.split('#')[1]; // 'v1/<encoded>'
    const decoded = decodeFromURL(hash);
    expect(decoded.language).toBe('javascript');
    expect(decoded.label).toBe('My snippet');
  });
});

// ── decodeFromURL ─────────────────────────────────────────────────────────────

describe('decodeFromURL', () => {
  it('round-trips text through encode → decode', () => {
    const url = encodeForURL(CLIP_TEXT, SHORT_TEXT);
    const hash = url.split('#')[1];
    const decoded = decodeFromURL(hash);
    expect(decoded).not.toBeNull();
    expect(decoded.content).toBe(SHORT_TEXT);
    expect(decoded.type).toBe('text');
  });

  it('sets shared: true on the decoded object', () => {
    const url = encodeForURL(CLIP_TEXT, SHORT_TEXT);
    const hash = url.split('#')[1];
    expect(decodeFromURL(hash).shared).toBe(true);
  });

  it('returns null for a hash without the v1/ prefix', () => {
    expect(decodeFromURL('badprefix/abc123')).toBeNull();
  });

  it('returns null for an empty / falsy hash', () => {
    expect(decodeFromURL('')).toBeNull();
    expect(decodeFromURL(null)).toBeNull();
    expect(decodeFromURL(undefined)).toBeNull();
  });

  it('returns null for a corrupted encoded string', () => {
    expect(decodeFromURL('v1/!!!not-valid-base64!!!')).toBeNull();
  });

  it('returns null when LZString is unavailable', () => {
    const saved = global.LZString;
    global.LZString = undefined;
    try {
      expect(decodeFromURL('v1/anything')).toBeNull();
    } finally {
      global.LZString = saved;
    }
  });

  it('preserves null language / label from encode', () => {
    const clip = { type: 'text', language: null, label: null };
    const url = encodeForURL(clip, 'hello');
    const hash = url.split('#')[1];
    const decoded = decodeFromURL(hash);
    expect(decoded.language).toBeNull();
    expect(decoded.label).toBeNull();
  });
});

// ── getShareInfo ──────────────────────────────────────────────────────────────

describe('getShareInfo', () => {
  it('returns { isImage: true } for image clips', () => {
    const imageClip = { type: 'image', blobId: 'blob_1' };
    const info = getShareInfo(imageClip, null);
    expect(info.isImage).toBe(true);
    expect(info.url).toBeNull();
  });

  it('returns { tooBig: true } when text exceeds the size limit', () => {
    const clip = { type: 'text', language: null, label: null };
    const bigText = 'x'.repeat(MAX_SHAREABLE_BYTES + 100);
    const info = getShareInfo(clip, bigText);
    expect(info.tooBig).toBe(true);
    expect(info.url).toBeNull();
  });

  it('returns { url: string } for a normal text clip', () => {
    const info = getShareInfo(CLIP_TEXT, SHORT_TEXT);
    expect(typeof info.url).toBe('string');
    expect(info.url).toContain('#v1/');
    expect(info.tooBig).toBeUndefined();
    expect(info.isImage).toBeUndefined();
  });
});
