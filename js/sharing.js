/**
 * sharing.js — URL hash fragment sharing via lz-string compression
 *
 * Format: #v1/<lz-uri-encoded-json>
 * Payload: { type, content, language, label }
 *
 * Max practical shareable text: ~8KB raw (compresses to stay under URL limits)
 */

const MAX_SHAREABLE_BYTES = 8 * 1024; // 8KB raw text limit for URL sharing
const HASH_PREFIX = 'v1/';

/**
 * Encode a clip for URL sharing. Returns null if too large or image.
 */
export function encodeForURL(clip, rawText) {
  if (!rawText || !window.LZString) return null;

  const byteLen = new Blob([rawText]).size;
  if (byteLen > MAX_SHAREABLE_BYTES) return null;

  const payload = JSON.stringify({
    t: rawText,
    l: clip.language || null,
    n: clip.label || null,
  });

  try {
    const encoded = LZString.compressToEncodedURIComponent(payload);
    return `${location.origin}${location.pathname}#${HASH_PREFIX}${encoded}`;
  } catch {
    return null;
  }
}

/**
 * Decode a shared clip from the URL hash. Returns clip-like object or null.
 */
export function decodeFromURL(hash) {
  if (!hash || !window.LZString) return null;
  if (!hash.startsWith(HASH_PREFIX)) return null;

  const encoded = hash.slice(HASH_PREFIX.length);
  if (!encoded) return null;

  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const { t, l, n } = JSON.parse(json);
    return { type: 'text', content: t, language: l || null, label: n || null, shared: true };
  } catch {
    return null;
  }
}

/**
 * Copy text to clipboard. Returns true on success.
 */
export async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  // Fallback: execCommand
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  return ok;
}

/**
 * Try to generate a share URL for a clip. Returns { url, tooBig, isImage }.
 */
export function getShareInfo(clip, rawText) {
  if (clip.type === 'image') return { url: null, isImage: true };
  const url = encodeForURL(clip, rawText);
  if (!url) return { url: null, tooBig: true };
  return { url };
}

export { MAX_SHAREABLE_BYTES };
