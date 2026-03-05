/**
 * p2p.test.js — unit tests for src/lib/p2p.js
 *
 * Covers: code generation, peer ID derivation, AES-GCM encrypt/decrypt,
 *         PBKDF2 key derivation, READY handshake, clip serialization,
 *         buffer chunking, meta deserialization, and PeerJS helper factories.
 *
 * PeerJS is mocked (WebRTC is not available in jsdom).
 * crypto.subtle is available via jsdom → Node.js built-ins.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// Must be declared before any import that touches peerjs.
// vitest hoists vi.mock() calls to the top of the file.
vi.mock('peerjs', () => {
  const MockPeer = vi.fn().mockImplementation(() => ({
    on:      vi.fn(),
    connect: vi.fn().mockReturnValue({ on: vi.fn() }),
    destroy: vi.fn(),
  }));
  return { default: MockPeer };
});

import Peer from 'peerjs';
import {
  generateCode, codeToPeerId, READY_MAGIC,
  deriveKey, encrypt, decrypt,
  makeReadySignal, verifyReadySignal,
  serializeClip, chunkBuffer, deserializeMeta,
  createSenderPeer, createReceiverPeer, connectToPeer,
} from '../../src/lib/p2p.js';

// ── Shared keys (derived once — PBKDF2 is intentionally slow) ────────────────
// Deriving in parallel shaves time versus sequential awaits.

let sharedKey;   // key for 'TESTKEY1'
let altKey;      // key for 'ALTKEY22' — different, used for wrong-key checks

beforeAll(async () => {
  [sharedKey, altKey] = await Promise.all([
    deriveKey('TESTKEY1'),
    deriveKey('ALTKEY22'),
  ]);
});

// ── Fixture ───────────────────────────────────────────────────────────────────

const TEXT_CLIP = {
  id:         'clip_test',
  type:       'text',
  content:    'const x = 42;',
  language:   'javascript',
  label:      'Test snippet',
  compressed: false,
  lineCount:  1,
  dimensions: null,
};

// ── generateCode ──────────────────────────────────────────────────────────────

describe('generateCode', () => {
  it('returns exactly 8 characters', () => {
    expect(generateCode()).toHaveLength(8);
  });

  it('only contains uppercase alphanumeric characters [A-Z0-9]', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateCode()).toMatch(/^[A-Z0-9]{8}$/);
    }
  });

  it('generates different codes across calls (entropy check)', () => {
    const codes = new Set(Array.from({ length: 30 }, generateCode));
    // With 36^8 ≈ 2.8T possibilities, 30 draws should always be unique
    expect(codes.size).toBeGreaterThan(1);
  });

  it('can be formatted as XXXX-XXXX by the caller', () => {
    const code = generateCode();
    const formatted = code.slice(0, 4) + '-' + code.slice(4);
    expect(formatted).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });
});

// ── codeToPeerId ──────────────────────────────────────────────────────────────

describe('codeToPeerId', () => {
  it('prepends "sc-" and lowercases the code', () => {
    expect(codeToPeerId('XK9P2M7T')).toBe('sc-xk9p2m7t');
  });

  it('lowercases mixed-case input', () => {
    expect(codeToPeerId('AbCd1234')).toBe('sc-abcd1234');
  });

  it('is idempotent — same code always gives the same peer ID', () => {
    const code = 'TESTCODE';
    expect(codeToPeerId(code)).toBe(codeToPeerId(code));
  });

  it('roundtrips with generateCode: formatted peer ID starts with "sc-"', () => {
    const peerId = codeToPeerId(generateCode());
    expect(peerId).toMatch(/^sc-[a-z0-9]{8}$/);
  });
});

// ── READY_MAGIC ───────────────────────────────────────────────────────────────

describe('READY_MAGIC', () => {
  it('is the expected sentinel string', () => {
    expect(READY_MAGIC).toBe('SCRATCHPAD_READY_v1');
  });
});

// ── deriveKey ─────────────────────────────────────────────────────────────────

describe('deriveKey', () => {
  it('returns a CryptoKey', async () => {
    const key = await deriveKey('SOMEKEY1');
    expect(key).toBeInstanceOf(CryptoKey);
  });

  it('is non-extractable', async () => {
    const key = await deriveKey('SOMEKEY1');
    expect(key.extractable).toBe(false);
  });

  it('has AES-GCM as its algorithm', async () => {
    const key = await deriveKey('SOMEKEY1');
    expect(key.algorithm.name).toBe('AES-GCM');
    expect(key.algorithm.length).toBe(256);
  });

  it('allows encrypt and decrypt usage', async () => {
    const key = await deriveKey('SOMEKEY1');
    expect(key.usages).toContain('encrypt');
    expect(key.usages).toContain('decrypt');
  });

  it('is deterministic — same code produces a key that encrypts/decrypts identically', async () => {
    const k1 = await deriveKey('SAMEKEY1');
    const k2 = await deriveKey('SAMEKEY1');
    const plain = new TextEncoder().encode('hello');
    // Use a fixed IV so we can compare ciphertext directly
    const iv = new Uint8Array(12); // all zeros
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k1, plain);
    const dt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k2, ct);
    expect(new TextDecoder().decode(dt)).toBe('hello');
  });

  it('different codes produce different keys (wrong key cannot decrypt)', async () => {
    const k1 = await deriveKey('KEYONE11');
    const k2 = await deriveKey('KEYTWO22');
    const plain = new TextEncoder().encode('secret');
    const iv = new Uint8Array(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k1, plain);
    await expect(crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k2, ct)).rejects.toThrow();
  });
});

// ── encrypt ───────────────────────────────────────────────────────────────────

describe('encrypt', () => {
  it('returns an ArrayBuffer', async () => {
    const ct = await encrypt(sharedKey, new TextEncoder().encode('hello'));
    expect(ct).toBeInstanceOf(ArrayBuffer);
  });

  it('output length = 12-byte IV + plaintext length + 16-byte AES-GCM tag', async () => {
    const plain = new TextEncoder().encode('hello world'); // 11 bytes
    const ct = await encrypt(sharedKey, plain);
    expect(ct.byteLength).toBe(12 + 11 + 16);
  });

  it('two encryptions of the same plaintext produce different ciphertext (random IV)', async () => {
    const plain = new TextEncoder().encode('same input');
    const ct1 = new Uint8Array(await encrypt(sharedKey, plain));
    const ct2 = new Uint8Array(await encrypt(sharedKey, plain));
    // IVs (first 12 bytes) are random — at least one byte will differ
    expect(ct1.slice(0, 12).join()).not.toBe(ct2.slice(0, 12).join());
  });

  it('accepts a Uint8Array as plaintext', async () => {
    const plain = new Uint8Array([1, 2, 3, 4, 5]);
    await expect(encrypt(sharedKey, plain)).resolves.toBeInstanceOf(ArrayBuffer);
  });

  it('handles empty plaintext', async () => {
    const ct = await encrypt(sharedKey, new Uint8Array(0));
    // 12 bytes IV + 0 bytes plaintext + 16 bytes tag
    expect(ct.byteLength).toBe(28);
  });
});

// ── decrypt ───────────────────────────────────────────────────────────────────

describe('decrypt', () => {
  it('decrypts back to the original plaintext', async () => {
    const plain = new TextEncoder().encode('hello world');
    const ct = await encrypt(sharedKey, plain);
    const dt = await decrypt(sharedKey, ct);
    expect(new TextDecoder().decode(dt)).toBe('hello world');
  });

  it('accepts a Uint8Array as cipherBuffer (not just ArrayBuffer)', async () => {
    const plain = new TextEncoder().encode('typed array test');
    const ct = new Uint8Array(await encrypt(sharedKey, plain)); // Uint8Array
    const dt = await decrypt(sharedKey, ct);
    expect(new TextDecoder().decode(dt)).toBe('typed array test');
  });

  it('round-trips empty plaintext', async () => {
    const ct = await encrypt(sharedKey, new Uint8Array(0));
    const dt = await decrypt(sharedKey, ct);
    expect(dt.byteLength).toBe(0);
  });

  it('throws when decrypting with the wrong key', async () => {
    const plain = new TextEncoder().encode('secret');
    const ct = await encrypt(sharedKey, plain);
    await expect(decrypt(altKey, ct)).rejects.toThrow();
  });

  it('throws when the ciphertext is truncated', async () => {
    const plain = new TextEncoder().encode('data');
    const ct = new Uint8Array(await encrypt(sharedKey, plain));
    const truncated = ct.slice(0, 20).buffer; // too short
    await expect(decrypt(sharedKey, truncated)).rejects.toThrow();
  });

  it('throws when a byte is flipped in the ciphertext', async () => {
    const plain = new TextEncoder().encode('important message');
    const ct = new Uint8Array(await encrypt(sharedKey, plain));
    ct[ct.length - 1] ^= 0xff; // corrupt the last byte of the auth tag
    await expect(decrypt(sharedKey, ct.buffer)).rejects.toThrow();
  });
});

// ── READY handshake ───────────────────────────────────────────────────────────

describe('makeReadySignal', () => {
  it('returns an ArrayBuffer', async () => {
    const sig = await makeReadySignal(sharedKey);
    expect(sig).toBeInstanceOf(ArrayBuffer);
  });

  it('is larger than just the IV (contains ciphertext + tag)', async () => {
    const sig = await makeReadySignal(sharedKey);
    const minLen = 12 + new TextEncoder().encode(READY_MAGIC).byteLength + 16;
    expect(sig.byteLength).toBeGreaterThanOrEqual(minLen);
  });

  it('two calls produce different outputs (random IV)', async () => {
    const s1 = new Uint8Array(await makeReadySignal(sharedKey));
    const s2 = new Uint8Array(await makeReadySignal(sharedKey));
    expect(s1.slice(0, 12).join()).not.toBe(s2.slice(0, 12).join());
  });
});

describe('verifyReadySignal', () => {
  it('returns true for a valid signal from the matching key', async () => {
    const sig = await makeReadySignal(sharedKey);
    expect(await verifyReadySignal(sharedKey, sig)).toBe(true);
  });

  it('returns false (not throw) when the key is wrong', async () => {
    const sig = await makeReadySignal(sharedKey);
    await expect(verifyReadySignal(altKey, sig)).resolves.toBe(false);
  });

  it('returns false for random bytes', async () => {
    const junk = crypto.getRandomValues(new Uint8Array(64)).buffer;
    await expect(verifyReadySignal(sharedKey, junk)).resolves.toBe(false);
  });

  it('returns false when a single byte is corrupted', async () => {
    const sig = new Uint8Array(await makeReadySignal(sharedKey));
    sig[sig.length - 1] ^= 0xff;
    await expect(verifyReadySignal(sharedKey, sig.buffer)).resolves.toBe(false);
  });

  it('returns false for an empty buffer', async () => {
    const empty = new ArrayBuffer(0);
    await expect(verifyReadySignal(sharedKey, empty)).resolves.toBe(false);
  });
});

// ── serializeClip ─────────────────────────────────────────────────────────────

describe('serializeClip', () => {
  it('returns an object with metaBuf and bodyBuf properties', async () => {
    const { metaBuf, bodyBuf } = await serializeClip(TEXT_CLIP, null);
    expect(metaBuf).toBeDefined();
    expect(bodyBuf).toBeDefined();
  });

  it('metaBuf deserializes to the correct meta fields', async () => {
    const { metaBuf } = await serializeClip(TEXT_CLIP, null);
    const meta = deserializeMeta(metaBuf);
    expect(meta).toMatchObject({
      type:       'text',
      language:   'javascript',
      label:      'Test snippet',
      compressed: false,
      lineCount:  1,
      dimensions: null,
      mimeType:   null,
    });
  });

  it('bodyBuf decodes back to clip.content', async () => {
    const { bodyBuf } = await serializeClip(TEXT_CLIP, null);
    expect(new TextDecoder().decode(bodyBuf)).toBe('const x = 42;');
  });

  it('sets chunked=false and totalChunks=1 for small content (< 64 KB)', async () => {
    const { metaBuf } = await serializeClip(TEXT_CLIP, null);
    const meta = deserializeMeta(metaBuf);
    expect(meta.chunked).toBe(false);
    expect(meta.totalChunks).toBe(1);
  });

  it('sets chunked=true and correct totalChunks for large content (> 64 KB)', async () => {
    const bigClip = { ...TEXT_CLIP, content: 'x'.repeat(130_000) };
    const { metaBuf } = await serializeClip(bigClip, null);
    const meta = deserializeMeta(metaBuf);
    expect(meta.chunked).toBe(true);
    expect(meta.totalChunks).toBe(2); // ceil(130_000 / 65_536) = 2
  });

  it('totalChunks matches actual chunk count from chunkBuffer', async () => {
    const bigClip = { ...TEXT_CLIP, content: 'a'.repeat(200_000) };
    const { metaBuf, bodyBuf } = await serializeClip(bigClip, null);
    const meta = deserializeMeta(metaBuf);
    const chunks = [...chunkBuffer(bodyBuf)];
    expect(chunks).toHaveLength(meta.totalChunks);
  });

  it('handles null content as an empty string', async () => {
    const clip = { ...TEXT_CLIP, content: null };
    const { bodyBuf } = await serializeClip(clip, null);
    expect(new TextDecoder().decode(bodyBuf)).toBe('');
  });

  it('round-trips compressed content correctly (stores the compressed string as-is)', async () => {
    const compressedClip = { ...TEXT_CLIP, content: 'lz:compressedData==', compressed: true };
    const { metaBuf, bodyBuf } = await serializeClip(compressedClip, null);
    const meta = deserializeMeta(metaBuf);
    expect(meta.compressed).toBe(true);
    expect(new TextDecoder().decode(bodyBuf)).toBe('lz:compressedData==');
  });

  it('includes image blob as bodyBuf when type is image', async () => {
    const imageClip = { ...TEXT_CLIP, type: 'image', content: null, mimeType: 'image/png' };
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    const { metaBuf, bodyBuf } = await serializeClip(imageClip, blob);
    const meta = deserializeMeta(metaBuf);
    expect(meta.type).toBe('image');
    expect(meta.mimeType).toBe('image/png');
    expect(bodyBuf.byteLength).toBe(4);
  });
});

// ── deserializeMeta ───────────────────────────────────────────────────────────

describe('deserializeMeta', () => {
  it('parses a JSON-encoded Uint8Array', () => {
    const buf = new TextEncoder().encode(JSON.stringify({ type: 'text', foo: 'bar' }));
    const meta = deserializeMeta(buf);
    expect(meta.type).toBe('text');
    expect(meta.foo).toBe('bar');
  });

  it('parses a JSON-encoded ArrayBuffer', () => {
    const buf = new TextEncoder().encode(JSON.stringify({ type: 'image' })).buffer;
    const meta = deserializeMeta(buf);
    expect(meta.type).toBe('image');
  });

  it('round-trips through serializeClip without loss', async () => {
    const { metaBuf } = await serializeClip(TEXT_CLIP, null);
    const meta = deserializeMeta(metaBuf);
    expect(meta).toMatchObject({
      type:        TEXT_CLIP.type,
      language:    TEXT_CLIP.language,
      label:       TEXT_CLIP.label,
      compressed:  TEXT_CLIP.compressed,
      lineCount:   TEXT_CLIP.lineCount,
    });
  });
});

// ── chunkBuffer ───────────────────────────────────────────────────────────────

describe('chunkBuffer', () => {
  it('yields one chunk for a buffer smaller than chunk size', () => {
    const buf = new Uint8Array([1, 2, 3, 4]);
    const chunks = [...chunkBuffer(buf, 64)];
    expect(chunks).toHaveLength(1);
    expect(new Uint8Array(chunks[0])).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('yields one chunk when buffer is exactly chunk size', () => {
    const buf = new Uint8Array(64).fill(7);
    const chunks = [...chunkBuffer(buf, 64)];
    expect(chunks).toHaveLength(1);
    expect(chunks[0].byteLength).toBe(64);
  });

  it('yields multiple chunks for a buffer larger than chunk size', () => {
    const buf = new Uint8Array(150).fill(9);
    const chunks = [...chunkBuffer(buf, 64)];
    expect(chunks).toHaveLength(3);
    expect(chunks[0].byteLength).toBe(64);
    expect(chunks[1].byteLength).toBe(64);
    expect(chunks[2].byteLength).toBe(22);
  });

  it('chunk count matches Math.ceil(buf.length / size)', () => {
    for (const [len, size] of [[100, 64], [64, 64], [63, 64], [1, 64], [200, 30]]) {
      const chunks = [...chunkBuffer(new Uint8Array(len), size)];
      expect(chunks).toHaveLength(Math.ceil(len / size) || 1);
    }
  });

  it('reassembled chunks equal the original buffer exactly', () => {
    const original = new Uint8Array(200).map((_, i) => i % 256);
    const chunks = [...chunkBuffer(original, 64)];
    const out = new Uint8Array(200);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }
    expect(out).toEqual(original);
  });

  it('yields one empty chunk for an empty buffer (ensures receiver gets totalChunks=1)', () => {
    const buf = new Uint8Array(0);
    const chunks = [...chunkBuffer(buf, 64)];
    expect(chunks).toHaveLength(1);
    expect(chunks[0].byteLength).toBe(0);
  });
});

// ── PeerJS helper factories ───────────────────────────────────────────────────

describe('createSenderPeer', () => {
  beforeEach(() => Peer.mockClear());

  it('instantiates Peer with the code-derived peer ID', () => {
    createSenderPeer('XK9P2M7T');
    expect(Peer).toHaveBeenCalledTimes(1);
    expect(Peer).toHaveBeenCalledWith('sc-xk9p2m7t');
  });

  it('returns the Peer instance', () => {
    const instance = createSenderPeer('ABCD1234');
    expect(instance).toBeDefined();
  });
});

describe('createReceiverPeer', () => {
  beforeEach(() => Peer.mockClear());

  it('instantiates Peer with no arguments (cloud assigns a random ID)', () => {
    createReceiverPeer();
    expect(Peer).toHaveBeenCalledTimes(1);
    expect(Peer).toHaveBeenCalledWith();
  });

  it('returns the Peer instance', () => {
    const instance = createReceiverPeer();
    expect(instance).toBeDefined();
  });
});

describe('connectToPeer', () => {
  it('calls peer.connect with the correct peer ID and reliable+serialization options', () => {
    const mockPeer = { connect: vi.fn().mockReturnValue({ on: vi.fn() }) };
    connectToPeer(mockPeer, 'XK9P2M7T');
    expect(mockPeer.connect).toHaveBeenCalledWith(
      'sc-xk9p2m7t',
      { reliable: true, serialization: 'none' }
    );
  });

  it('returns the DataConnection from peer.connect', () => {
    const mockConn = { on: vi.fn() };
    const mockPeer = { connect: vi.fn().mockReturnValue(mockConn) };
    expect(connectToPeer(mockPeer, 'ABCD1234')).toBe(mockConn);
  });
});

// ── Integration: full encrypt→decrypt pipeline ────────────────────────────────

describe('end-to-end: sender serializes + encrypts, receiver decrypts + deserializes', () => {
  it('receiver recovers the original clip content and meta', async () => {
    const code = 'XKTEST1T';
    const [senderKey, receiverKey] = await Promise.all([
      deriveKey(code),
      deriveKey(code),
    ]);

    // Sender side
    const { metaBuf, bodyBuf } = await serializeClip(TEXT_CLIP, null);
    const encMeta = await encrypt(senderKey, metaBuf);
    const [encBody] = await Promise.all(
      [...chunkBuffer(bodyBuf)].map(chunk => encrypt(senderKey, chunk))
    );

    // Receiver side
    const decMeta = await decrypt(receiverKey, encMeta);
    const decBody = await decrypt(receiverKey, encBody);

    const meta    = deserializeMeta(decMeta);
    const content = new TextDecoder().decode(decBody);

    expect(meta.type).toBe('text');
    expect(meta.language).toBe('javascript');
    expect(meta.label).toBe('Test snippet');
    expect(content).toBe('const x = 42;');
  });

  it('READY handshake succeeds between sender and receiver with matching code', async () => {
    const code = 'SHAREDCO';
    const [sKey, rKey] = await Promise.all([deriveKey(code), deriveKey(code)]);

    const signal = await makeReadySignal(rKey);  // receiver creates it
    expect(await verifyReadySignal(sKey, signal)).toBe(true);  // sender verifies
  });

  it('READY handshake fails when receiver uses a wrong code', async () => {
    const senderKey   = await deriveKey('REALCODE');
    const wrongRxKey  = await deriveKey('WONGCODE');

    const signal = await makeReadySignal(wrongRxKey);
    expect(await verifyReadySignal(senderKey, signal)).toBe(false);
  });
});
