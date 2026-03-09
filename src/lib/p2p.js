/**
 * p2p.js — WebRTC/PeerJS clip sharing + AES-GCM encryption
 * Zero-trace: signaling server sees only peer IDs, never clip content or the key.
 */
import Peer from 'peerjs';

const CHUNK_SIZE = 65536; // 64 KB
export const READY_MAGIC = 'SCRATCHPAD_READY_v1';

// ── Code generation ───────────────────────────────────────────────────────────

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, b => ALPHABET[b % 36]).join('');
}

export function codeToPeerId(code) {
  return 'sc-' + code.toLowerCase();
}

// ── Key derivation (PBKDF2 → AES-GCM 256-bit) ────────────────────────────────

export async function deriveKey(code) {
  const raw = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(code),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('scratchpad-p2p-v1'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Encrypt / decrypt ─────────────────────────────────────────────────────────

export async function encrypt(cryptoKey, plaintextBuffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plaintextBuffer);
  const out = new Uint8Array(12 + ciphertext.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ciphertext), 12);
  return out.buffer;
}

export async function decrypt(cryptoKey, cipherBuffer) {
  const bytes = new Uint8Array(cipherBuffer);
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
}

// ── READY handshake ───────────────────────────────────────────────────────────

export async function makeReadySignal(key) {
  return encrypt(key, new TextEncoder().encode(READY_MAGIC));
}

export async function verifyReadySignal(key, buf) {
  try {
    const decrypted = await decrypt(key, buf);
    return new TextDecoder().decode(decrypted) === READY_MAGIC;
  } catch {
    return false;
  }
}

// ── Payload serialization ─────────────────────────────────────────────────────

export async function serializeClip(clip, blob) {
  let bodyBuf, mimeType = null;
  if (clip.type === 'image' && blob) {
    bodyBuf = new Uint8Array(await blob.arrayBuffer());
    mimeType = blob.type;
  } else {
    bodyBuf = new TextEncoder().encode(clip.content ?? '');
  }

  const chunked = bodyBuf.byteLength > CHUNK_SIZE;
  const totalChunks = chunked ? Math.ceil(bodyBuf.byteLength / CHUNK_SIZE) : 1;

  const meta = {
    type: clip.type,
    language: clip.language,
    label: clip.label,
    compressed: clip.compressed,
    lineCount: clip.lineCount,
    mimeType,
    dimensions: clip.dimensions,
    chunked,
    totalChunks,
  };

  return {
    metaBuf: new TextEncoder().encode(JSON.stringify(meta)),
    bodyBuf,
  };
}

export function* chunkBuffer(buf, size = CHUNK_SIZE) {
  if (buf.byteLength === 0) { yield buf; return; }
  let offset = 0;
  while (offset < buf.byteLength) {
    yield buf.slice(offset, offset + size);
    offset += size;
  }
}

export function deserializeMeta(buf) {
  return JSON.parse(new TextDecoder().decode(buf));
}

// ── ICE / TURN configuration ─────────────────────────────────────────────────

const TURN_WORKER_URL = import.meta.env.VITE_TURN_WORKER_URL || '';

export const FALLBACK_ICE = {
  iceServers: [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
};

export async function fetchIceServers() {
  if (!TURN_WORKER_URL) return FALLBACK_ICE;
  try {
    const res = await fetch(`${TURN_WORKER_URL}/turn-credentials`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(res.status);
    const iceServers = await res.json();
    return { iceServers, iceCandidatePoolSize: 10 };
  } catch {
    console.warn('TURN credential fetch failed, using STUN-only fallback');
    return FALLBACK_ICE;
  }
}

// ── PeerJS helpers ────────────────────────────────────────────────────────────

export function createSenderPeer(code, iceConfig) {
  return new Peer(codeToPeerId(code), { config: iceConfig || FALLBACK_ICE });
}

export function createReceiverPeer(iceConfig) {
  return new Peer({ config: iceConfig || FALLBACK_ICE });
}

export function connectToPeer(peer, code) {
  return peer.connect(codeToPeerId(code), { reliable: true, serialization: 'raw' });
}

export function monitorIceState(conn, onFailed) {
  const pc = conn.peerConnection;
  if (!pc) return;
  pc.addEventListener('iceconnectionstatechange', () => {
    if (pc.iceConnectionState === 'failed') onFailed();
  });
}
