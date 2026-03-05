/**
 * clips.test.js — unit tests for src/lib/clips.js
 *
 * Covers: hashing, credential detection, langLabel/langToExt,
 *         content-type detection, compression round-trips.
 * Note: detectLanguage() has been removed — hljs handles detection at paste time.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  hashText, hashBlob,
  detectCredentials,
  langLabel, langToExt,
  detectType, extractText, extractTextFile,
  compressText, decompressText,
} from '../../src/lib/clips.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeClipData({ items = [], types = [], data = {} } = {}) {
  return {
    items: items.map(({ kind, type, file }) => ({
      kind,
      type,
      getAsFile: () => file ?? null,
    })),
    types,
    getData: (t) => data[t] ?? '',
  };
}

// ── hashText ───────────────────────────────────────────────────────────────────

describe('hashText', () => {
  it('returns a 20-character hex string', async () => {
    const h = await hashText('hello world');
    expect(h).toMatch(/^[0-9a-f]{20}$/);
  });

  it('is deterministic — same input yields same hash', async () => {
    const a = await hashText('console.log("hi")');
    const b = await hashText('console.log("hi")');
    expect(a).toBe(b);
  });

  it('differs for different inputs', async () => {
    const a = await hashText('foo');
    const b = await hashText('bar');
    expect(a).not.toBe(b);
  });

  it('handles empty string without throwing', async () => {
    const h = await hashText('');
    expect(h).toMatch(/^[0-9a-f]{20}$/);
  });
});

// ── hashBlob ───────────────────────────────────────────────────────────────────

describe('hashBlob', () => {
  it('returns a 20-character hex string', async () => {
    const blob = new Blob(['binary content'], { type: 'image/png' });
    const h = await hashBlob(blob);
    expect(h).toMatch(/^[0-9a-f]{20}$/);
  });

  it('is deterministic for identical blobs', async () => {
    const blob1 = new Blob(['same data'], { type: 'image/png' });
    const blob2 = new Blob(['same data'], { type: 'image/png' });
    expect(await hashBlob(blob1)).toBe(await hashBlob(blob2));
  });

  it('differs for different blobs', async () => {
    const a = new Blob(['data-a'], { type: 'image/png' });
    const b = new Blob(['data-b'], { type: 'image/png' });
    expect(await hashBlob(a)).not.toBe(await hashBlob(b));
  });
});

// ── detectCredentials ─────────────────────────────────────────────────────────

describe('detectCredentials', () => {
  it('detects AWS access key', () => {
    expect(detectCredentials('AKIAIOSFODNN7EXAMPLE1234')).toContain('AWS Access Key');
  });

  it('detects GitHub personal access token', () => {
    const token = 'ghp_' + 'a'.repeat(36);
    expect(detectCredentials(token)).toContain('GitHub Token');
  });

  it('detects OpenAI API key', () => {
    const key = 'sk-' + 'a'.repeat(32);
    expect(detectCredentials(key)).toContain('OpenAI API Key');
  });

  it('detects Anthropic API key', () => {
    const key = 'sk-ant-' + 'a'.repeat(32);
    expect(detectCredentials(key)).toContain('Anthropic API Key');
  });

  it('detects Stripe live key', () => {
    const key = 'sk_live_' + 'a'.repeat(24);
    expect(detectCredentials(key)).toContain('Stripe Key');
  });

  it('detects PEM private key block', () => {
    expect(detectCredentials('-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----'))
      .toContain('Private Key (PEM)');
  });

  it('detects Bearer token', () => {
    expect(detectCredentials('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9'))
      .toContain('Generic Bearer Token');
  });

  it('detects postgres connection string', () => {
    expect(detectCredentials('postgres://user:password@localhost:5432/db'))
      .toContain('Connection String');
  });

  it('detects .env secret assignment', () => {
    expect(detectCredentials('API_KEY=supersecretvalue123'))
      .toContain('.env secret');
  });

  it('returns empty array for clean text', () => {
    expect(detectCredentials('Hello, this is a normal code comment.')).toEqual([]);
  });

  it('returns empty array for text longer than 50 000 chars', () => {
    const huge = 'AKIAIOSFODNN7EXAMPLE1234 ' + 'x'.repeat(50_000);
    expect(detectCredentials(huge)).toEqual([]);
  });

  it('returns empty array for falsy input', () => {
    expect(detectCredentials('')).toEqual([]);
    expect(detectCredentials(null)).toEqual([]);
  });
});

// ── langLabel ──────────────────────────────────────────────────────────────────

describe('langLabel', () => {
  it('maps known language keys to display names', () => {
    expect(langLabel('python')).toBe('Python');
    expect(langLabel('javascript')).toBe('JavaScript');
    expect(langLabel('typescript')).toBe('TypeScript');
    expect(langLabel('bash')).toBe('Bash');
    expect(langLabel('json')).toBe('JSON');
  });

  it('uppercases unknown language keys', () => {
    expect(langLabel('kotlin')).toBe('KOTLIN');
  });

  it('returns "Plain Text" for null / undefined', () => {
    expect(langLabel(null)).toBe('Plain Text');
    expect(langLabel(undefined)).toBe('Plain Text');
    expect(langLabel('')).toBe('Plain Text');
  });
});

// ── langToExt ──────────────────────────────────────────────────────────────────

describe('langToExt', () => {
  const cases = [
    ['javascript', 'js'], ['typescript', 'ts'], ['python', 'py'],
    ['bash', 'sh'],       ['json', 'json'],      ['yaml', 'yml'],
    ['go', 'go'],         ['rust', 'rs'],         ['jsx', 'jsx'],
    ['sql', 'sql'],       ['css', 'css'],          ['html', 'html'],
  ];

  cases.forEach(([lang, ext]) => {
    it(`${lang} → .${ext}`, () => expect(langToExt(lang)).toBe(ext));
  });

  it('falls back to .txt for unknown languages', () => {
    expect(langToExt('kotlin')).toBe('txt');
    expect(langToExt(null)).toBe('txt');
    expect(langToExt(undefined)).toBe('txt');
  });
});

// ── detectType ────────────────────────────────────────────────────────────────

describe('detectType', () => {
  it('returns "image" when a file item has an image MIME type', () => {
    const cd = makeClipData({
      items: [{ kind: 'file', type: 'image/png', file: new Blob() }],
      types: ['Files'],
    });
    expect(detectType(cd)).toBe('image');
  });

  it('prioritises image over text when both are present', () => {
    const cd = makeClipData({
      items: [
        { kind: 'file', type: 'image/png',  file: new Blob() },
        { kind: 'file', type: 'text/plain', file: new Blob() },
      ],
      types: ['Files'],
    });
    expect(detectType(cd)).toBe('image');
  });

  it('returns "text-file" for a text/ file item', () => {
    const cd = makeClipData({
      items: [{ kind: 'file', type: 'text/plain', file: new Blob(['hello']) }],
      types: ['Files'],
    });
    expect(detectType(cd)).toBe('text-file');
  });

  it('returns "text-file" for a file item with empty MIME type', () => {
    const cd = makeClipData({
      items: [{ kind: 'file', type: '', file: new Blob(['data']) }],
      types: ['Files'],
    });
    expect(detectType(cd)).toBe('text-file');
  });

  it('returns "text" for a plain text paste (no file)', () => {
    const cd = makeClipData({
      items: [{ kind: 'string', type: 'text/plain' }],
      types: ['text/plain'],
    });
    expect(detectType(cd)).toBe('text');
  });

  it('returns "unknown" when nothing matches', () => {
    const cd = makeClipData({ items: [], types: [] });
    expect(detectType(cd)).toBe('unknown');
  });
});

// ── extractText ───────────────────────────────────────────────────────────────

describe('extractText', () => {
  it('returns plain text when available', () => {
    const cd = makeClipData({
      types: ['text/plain'],
      data: { 'text/plain': 'hello plain', 'text/html': '<b>hello</b>' },
    });
    expect(extractText(cd)).toBe('hello plain');
  });

  it('falls back to HTML when plain text is absent', () => {
    const cd = makeClipData({
      types: ['text/html'],
      data: { 'text/html': '<b>hello</b>' },
    });
    expect(extractText(cd)).toBe('<b>hello</b>');
  });

  it('returns empty string when no text data exists', () => {
    const cd = makeClipData({ types: [], data: {} });
    expect(extractText(cd)).toBe('');
  });
});

// ── compressText / decompressText ─────────────────────────────────────────────

describe('compressText / decompressText', () => {
  it('does NOT compress text shorter than 1 KB', () => {
    const short = 'short text';
    const result = compressText(short);
    expect(result.compressed).toBe(false);
    expect(result.data).toBe(short);
  });

  it('compresses text longer than 1 KB', () => {
    const long = 'a'.repeat(2000);
    const result = compressText(long);
    expect(result.compressed).toBe(true);
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('originalSize');
    expect(result.originalSize).toBe(new Blob([long]).size);
  });

  it('round-trips: compress then decompress returns original text', () => {
    const original = 'const x = 1;\n'.repeat(200); // >1KB
    const compressed = compressText(original);
    expect(compressed.compressed).toBe(true);

    const clip = { compressed: compressed.compressed, content: compressed.data };
    expect(decompressText(clip)).toBe(original);
  });

  it('decompressText returns content directly for non-compressed clips', () => {
    const clip = { compressed: false, content: 'plain text' };
    expect(decompressText(clip)).toBe('plain text');
  });
});
