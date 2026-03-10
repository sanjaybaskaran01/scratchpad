/**
 * clips.js — Content type detection, compression, hashing, and image optimization
 * detectLanguage() is removed — hljs handles language detection at paste time.
 */
import LZString from 'lz-string';

// ── Content hashing (for duplicate detection) ─────────────────────────────────

export async function hashText(text) {
  const sample = text.slice(0, 65536);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sample));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

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

// ── Language label helpers (used with hljs language names) ────────────────────

export const LANG_LABELS = {
  python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', jsx: 'JSX',
  css: 'CSS', html: 'HTML', sql: 'SQL', json: 'JSON', yaml: 'YAML',
  bash: 'Bash', shell: 'Shell', go: 'Go', rust: 'Rust', toml: 'TOML', diff: 'Diff',
  xml: 'XML', markdown: 'Markdown', plaintext: 'Plain Text',
};

export function langLabel(lang) {
  return LANG_LABELS[lang] || (lang ? lang.toUpperCase() : 'Plain Text');
}

export function langToExt(lang) {
  const map = {
    javascript: 'js', typescript: 'ts', python: 'py', bash: 'sh', shell: 'sh',
    css: 'css', html: 'html', json: 'json', yaml: 'yml', sql: 'sql',
    go: 'go', rust: 'rs', jsx: 'jsx', toml: 'toml', diff: 'diff',
    xml: 'xml', markdown: 'md',
  };
  return map[lang] || 'txt';
}

// ── Content type detection ────────────────────────────────────────────────────

export function detectType(clipboardData) {
  const items = Array.from(clipboardData.items);
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return 'image';
  }
  for (const item of items) {
    if (item.kind === 'file' && (item.type.startsWith('text/') || item.type === '')) {
      const file = item.getAsFile();
      if (file) return 'text-file';
    }
  }
  const types = Array.from(clipboardData.types);
  if (types.includes('text/plain') || types.includes('text/html')) return 'text';
  return 'unknown';
}

export function extractText(clipboardData) {
  return clipboardData.getData('text/plain') || clipboardData.getData('text/html') || '';
}

export function extractImage(clipboardData) {
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      return item.getAsFile();
    }
  }
  return null;
}

export async function extractTextFile(clipboardData) {
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (!file) continue;
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

export function compressText(text) {
  const originalSize = new Blob([text]).size;
  try {
    const compressed = LZString.compressToUTF16(text);
    const compressedSize = new Blob([compressed]).size;
    if (compressedSize < originalSize) {
      return { compressed: true, data: compressed, originalSize, size: compressedSize };
    }
  } catch { /* fall through */ }
  return { compressed: false, data: text, originalSize, size: originalSize };
}

export function decompressText(clip) {
  if (!clip.compressed) return clip.content;
  try {
    return LZString.decompressFromUTF16(clip.content) || clip.content;
  } catch {
    return clip.content;
  }
}

// ── Image optimization ────────────────────────────────────────────────────────

const MAX_IMAGE_DIMENSION = 1920;
const MAX_IMAGE_BYTES     = 5 * 1024 * 1024; // 5 MB

export function getImageDimensions(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

export async function optimizeImage(rawBlob) {
  if (rawBlob.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large (${(rawBlob.size / 1024 / 1024).toFixed(1)} MB). Max is 5 MB.`);
  }

  const dimensions = await getImageDimensions(rawBlob);
  const { w, h } = dimensions;

  // Guard against image bombs — extremely large dimensions can crash the browser
  // by allocating a massive canvas (e.g. 100k x 100k = ~40 GB)
  if (w > 10000 || h > 10000) {
    throw new Error(`Image dimensions too large (${w}×${h}). Max is 10,000px per side.`);
  }

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(w, h));

  const newW = Math.round(w * scale);
  const newH = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width  = newW;
  canvas.height = newH;
  const ctx = canvas.getContext('2d');

  await new Promise((res, rej) => {
    const url = URL.createObjectURL(rawBlob);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); ctx.drawImage(img, 0, 0, newW, newH); res(); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image load failed')); };
    img.src = url;
  });

  const toBlob = (type, quality) =>
    new Promise(r => canvas.toBlob(b => r(b), type, quality));

  const [webp, jpeg] = await Promise.all([
    toBlob('image/webp', 0.82).catch(() => null),
    toBlob('image/jpeg', 0.85).catch(() => null),
  ]);

  const candidates = [rawBlob, webp, jpeg].filter(Boolean);
  const best = candidates.reduce((a, b) => (b.size < a.size ? b : a));

  // Use scaled dimensions if we actually downscaled, otherwise original
  const finalDims = scale < 1 ? { w: newW, h: newH } : dimensions;
  return { blob: best, dimensions: finalDims, originalSize: rawBlob.size };
}

export { MAX_IMAGE_BYTES };
