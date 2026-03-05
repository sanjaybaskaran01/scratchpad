/**
 * clips.js — Content type detection, compression, hashing, and image optimization
 */

// ── Content hashing (for duplicate detection) ─────────────────────────────────

/**
 * SHA-256 hash of text content (first 64KB). Returns 20-char hex prefix.
 */
export async function hashText(text) {
  const sample = text.slice(0, 65536);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sample));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

/**
 * SHA-256 hash of image blob (first 128KB sample). Returns 20-char hex prefix.
 */
export async function hashBlob(blob) {
  const sample = blob.slice(0, 131072);
  const buf = await crypto.subtle.digest('SHA-256', await sample.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

// ── Credential pattern detection ──────────────────────────────────────────────

const CREDENTIAL_PATTERNS = [
  { label: 'AWS Access Key',       re: /AKIA[0-9A-Z]{16}/ },
  { label: 'GitHub Token',         re: /gh[pousr]_[A-Za-z0-9_]{36,255}/ },
  { label: 'OpenAI API Key',       re: /sk-[A-Za-z0-9]{32,}/ },
  { label: 'Anthropic API Key',    re: /sk-ant-[A-Za-z0-9\-_]{32,}/ },
  { label: 'Stripe Key',           re: /sk_live_[A-Za-z0-9]{24,}/ },
  { label: 'Private Key (PEM)',    re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: 'Generic Bearer Token', re: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/ },
  { label: 'Connection String',    re: /(postgres|mysql|mongodb|redis):\/\/[^@]+:[^@]+@/ },
  { label: '.env secret',          re: /^[A-Z_]{3,}_(KEY|SECRET|TOKEN|PASSWORD|PASS|PWD|API_KEY)\s*=\s*.+/m },
];

export function detectCredentials(text) {
  if (!text || text.length > 50000) return [];
  return CREDENTIAL_PATTERNS.filter(p => p.re.test(text)).map(p => p.label);
}

// ── Language detection ────────────────────────────────────────────────────────

const LANGUAGE_HINTS = [
  { lang: 'python',     re: /^(import |from |def |class |if __name__|#!\/usr\/bin\/env python|#!\/usr\/bin\/python)/m },
  { lang: 'javascript', re: /\b(const|let|var|function|=>|require\(|module\.exports|import .+ from)\b/ },
  { lang: 'typescript', re: /\b(interface |type |enum |implements |as |\.tsx?['"])\b|:\s*(string|number|boolean|void|any)\b/ },
  { lang: 'jsx',        re: /<[A-Z][A-Za-z]*[\s/>]|return\s*\([\s\n]*</ },
  { lang: 'css',        re: /^\s*[.#]?[a-zA-Z][\w-]*\s*\{[\s\S]*?\}/m },
  { lang: 'html',       re: /<!DOCTYPE|<html|<head|<body|<div|<span|<p /i },
  { lang: 'sql',        re: /\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|DROP|ALTER|JOIN|WHERE|FROM)\b/i },
  { lang: 'json',       re: /^\s*[\[{][\s\S]*[\]}]\s*$/ },
  { lang: 'yaml',       re: /^[a-zA-Z_-]+:\s*.+/m },
  { lang: 'bash',       re: /^#!\/usr\/bin\/(bash|sh|zsh)|^\s*(echo|export|cd|ls|grep|awk|sed|curl|git)\s/m },
  { lang: 'go',         re: /\b(package main|func |import \(|var |:=|fmt\.)\b/ },
  { lang: 'rust',       re: /\b(fn |let mut |impl |use std|pub struct|enum |match |cargo)\b/ },
  { lang: 'toml',       re: /^\[[\w.]+\]\s*\n/m },
  { lang: 'diff',       re: /^[+-]{3} |^@@ /m },
];

const LANG_LABELS = {
  python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', jsx: 'JSX',
  css: 'CSS', html: 'HTML', sql: 'SQL', json: 'JSON', yaml: 'YAML',
  bash: 'Bash', go: 'Go', rust: 'Rust', toml: 'TOML', diff: 'Diff',
};

export function detectLanguage(text) {
  if (!text) return null;
  const sample = text.slice(0, 2000);

  // JSON: parse first (most reliable)
  if (/^\s*[\[{]/.test(sample)) {
    try { JSON.parse(text); return 'json'; } catch {}
  }

  for (const { lang, re } of LANGUAGE_HINTS) {
    if (re.test(sample)) return lang;
  }
  return null;
}

export function langLabel(lang) {
  return LANG_LABELS[lang] || (lang ? lang.toUpperCase() : 'Plain Text');
}

export function langToExt(lang) {
  const map = {
    javascript: 'js', typescript: 'ts', python: 'py', bash: 'sh',
    css: 'css', html: 'html', json: 'json', yaml: 'yml', sql: 'sql',
    go: 'go', rust: 'rs', jsx: 'jsx', toml: 'toml', diff: 'diff',
  };
  return map[lang] || 'txt';
}

// ── Content type detection ────────────────────────────────────────────────────

/**
 * Detect what kind of content was pasted.
 * Returns: 'image' | 'text-file' | 'text' | 'unknown'
 */
export function detectType(clipboardData) {
  const items = Array.from(clipboardData.items);

  // Image takes priority
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return 'image';
  }

  // Text file pasted from file manager (e.g. .txt file copied in Finder)
  for (const item of items) {
    if (item.kind === 'file' && (item.type.startsWith('text/') || item.type === '')) {
      const file = item.getAsFile();
      if (file) return 'text-file';
    }
  }

  // Regular text paste
  const types = Array.from(clipboardData.types);
  if (types.includes('text/plain') || types.includes('text/html')) return 'text';

  return 'unknown';
}

/**
 * Extract text string from paste event (prefers plain text over HTML).
 */
export function extractText(clipboardData) {
  return clipboardData.getData('text/plain') || clipboardData.getData('text/html') || '';
}

/**
 * Extract image Blob from paste event.
 */
export function extractImage(clipboardData) {
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      return item.getAsFile();
    }
  }
  return null;
}

/**
 * Read a text file from paste event. Returns Promise<{text, filename}> or null.
 */
export async function extractTextFile(clipboardData) {
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (!file) continue;
      // Read text files: text/*, empty type (some OS), common extensions
      const isText = file.type.startsWith('text/') || file.type === '' ||
        /\.(txt|md|csv|log|conf|cfg|ini|env|sh|py|js|ts|json|yaml|yml|toml|sql|html|css|xml|svg)$/i.test(file.name);
      if (isText) {
        const text = await file.text();
        return { text, filename: file.name };
      }
    }
  }
  return null;
}

// ── Compression ───────────────────────────────────────────────────────────────

const COMPRESS_THRESHOLD = 1024; // 1KB

export function compressText(text) {
  if (!window.LZString || text.length < COMPRESS_THRESHOLD) {
    return { compressed: false, data: text, originalSize: text.length, size: text.length };
  }
  try {
    const data = LZString.compressToUTF16(text);
    return {
      compressed: true,
      data,
      originalSize: new Blob([text]).size,
      size: new Blob([data]).size,
    };
  } catch {
    return { compressed: false, data: text, originalSize: text.length, size: text.length };
  }
}

export function decompressText(clip) {
  if (!clip.compressed) return clip.content;
  if (!window.LZString) return clip.content;
  try {
    return LZString.decompressFromUTF16(clip.content) || clip.content;
  } catch {
    return clip.content;
  }
}

// ── Image optimization ────────────────────────────────────────────────────────

const MAX_IMAGE_DIMENSION = 1920;
const MAX_IMAGE_BYTES     = 5 * 1024 * 1024; // 5 MB hard limit

/**
 * Get image dimensions from a Blob. Returns Promise<{w, h}>.
 */
export function getImageDimensions(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

/**
 * Optimize an image Blob:
 * 1. Reject if > 5MB
 * 2. Downscale if wider/taller than 1920px
 * 3. Try WebP and JPEG compression — keep whichever is smallest
 * Returns { blob, dimensions, originalSize }
 */
export async function optimizeImage(rawBlob) {
  if (rawBlob.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large (${(rawBlob.size / 1024 / 1024).toFixed(1)} MB). Max is 5 MB.`);
  }

  const dimensions = await getImageDimensions(rawBlob);
  const { w, h } = dimensions;
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(w, h));

  // Skip optimization if already small and no resize needed
  if (scale === 1 && rawBlob.size < 200 * 1024) {
    return { blob: rawBlob, dimensions, originalSize: rawBlob.size };
  }

  const newW = Math.round(w * scale);
  const newH = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width  = newW;
  canvas.height = newH;
  const ctx = canvas.getContext('2d');

  // Draw at new dimensions
  await new Promise((res, rej) => {
    const url = URL.createObjectURL(rawBlob);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); ctx.drawImage(img, 0, 0, newW, newH); res(); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image load failed')); };
    img.src = url;
  });

  const toBlob = (type, quality) =>
    new Promise(r => canvas.toBlob(b => r(b), type, quality));

  // Try WebP and JPEG — pick the smallest
  const [webp, jpeg] = await Promise.all([
    toBlob('image/webp', 0.82).catch(() => null),
    toBlob('image/jpeg', 0.85).catch(() => null),
  ]);

  const candidates = [rawBlob, webp, jpeg].filter(Boolean);
  const best = candidates.reduce((a, b) => (b.size < a.size ? b : a));

  return { blob: best, dimensions: { w: newW, h: newH }, originalSize: rawBlob.size };
}

export { MAX_IMAGE_BYTES };
