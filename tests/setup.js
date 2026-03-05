/**
 * Global test setup — runs before every unit test file.
 */
import { vi } from 'vitest';
// Sets all global IDB types (IDBRequest, IDBFactory, etc.) needed by the `idb` package.
import 'fake-indexeddb/auto';

// ── Web APIs missing from jsdom ───────────────────────────────────────────────

// URL.createObjectURL / revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-object-url');
global.URL.revokeObjectURL = vi.fn();

// Blob.prototype.arrayBuffer — jsdom's sliced Blobs are missing this method.
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload  = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsArrayBuffer(this);
    });
  };
}

// HTMLCanvasElement — jsdom doesn't implement the canvas rendering model
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawImage: vi.fn(),
}));
HTMLCanvasElement.prototype.toBlob = vi.fn(function (callback, type) {
  callback(new Blob(['<mock-pixel-data>'], { type: type || 'image/png' }));
});

// localStorage — in-memory implementation
const _lsData = {};
Object.defineProperty(global, 'localStorage', {
  value: {
    getItem:    (k)    => Object.prototype.hasOwnProperty.call(_lsData, k) ? _lsData[k] : null,
    setItem:    (k, v) => { _lsData[k] = String(v); },
    removeItem: (k)    => { delete _lsData[k]; },
    clear:      ()     => { Object.keys(_lsData).forEach(k => delete _lsData[k]); },
    get length()       { return Object.keys(_lsData).length; },
    key:        (i)    => Object.keys(_lsData)[i] ?? null,
  },
  writable: true,
  configurable: true,
});

// navigator.storage.estimate — not implemented in jsdom
Object.defineProperty(global.navigator, 'storage', {
  value: {
    estimate: vi.fn().mockResolvedValue({ usage: 512_000, quota: 50 * 1024 * 1024 }),
  },
  writable: true,
  configurable: true,
});
