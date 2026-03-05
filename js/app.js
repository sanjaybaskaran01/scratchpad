/**
 * app.js — scratchpad (sidebar + feed, FlexSearch, scratchpad, safe shortcuts)
 */

import {
  saveTextClip, saveImageClip, deleteClip, pinClip, unpinClip,
  getAllClips, getBlob, purgeExpired, estimateStorageUsed,
  getSettings, saveSetting, findByHash, SOFT_LIMIT_BYTES,
} from './storage.js';

import {
  detectType, extractText, extractImage, extractTextFile,
  detectLanguage, langLabel, langToExt,
  compressText, decompressText,
  optimizeImage, detectCredentials,
  hashText, hashBlob,
} from './clips.js';

import { copyToClipboard, getShareInfo, decodeFromURL } from './sharing.js';

// ── State ──────────────────────────────────────────────────────────────────────

let clips          = [];
let selectedId     = null;
let activeFilter   = 'all';
let searchQuery    = '';
let searchIndex    = null;

// Scratchpad
let scratchpadId   = null;   // clip id of the live scratchpad clip
let scratchpadTimer= null;
const SP_SAVE_DELAY = 600;   // ms debounce before auto-saving scratchpad

// ── DOM refs ───────────────────────────────────────────────────────────────────

const $           = id => document.getElementById(id);
const sidebarList = $('sidebar-list');
const sidebarEmpty= $('sidebar-empty');
const clipFeed    = $('clip-feed');
const pasteZone   = $('paste-zone');
const searchInput = $('search-input');
const storagePct  = $('storage-pct');
const storageBar  = $('storage-bar');
const storageText = $('storage-text');
const toast       = $('toast');
const shortcutOverlay = $('shortcut-overlay');
const imgModal    = $('img-modal');
const imgModalSrc = $('img-modal-src');

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  await purgeExpired();
  await loadClips();
  checkURLShare();
  updateStorage();
  setInterval(updateStorage, 30_000);

  document.addEventListener('paste', onGlobalPaste);

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    render();
  });

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      document.querySelectorAll('.filter-tab').forEach(b => {
        b.classList.remove('active-tab');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active-tab');
      btn.setAttribute('aria-selected', 'true');
      render();
    });
  });

  $('new-clip-btn').addEventListener('click', openManualEntry);
  $('shortcut-close').addEventListener('click', () => setOverlay(false));
  shortcutOverlay.addEventListener('click', e => { if (e.target === shortcutOverlay) setOverlay(false); });

  $('img-modal-close').addEventListener('click', closeImageModal);
  imgModal.addEventListener('click', e => { if (e.target === imgModal) closeImageModal(); });

  document.addEventListener('keydown', onKeyDown);
}

// ── URL hash share on load ─────────────────────────────────────────────────────

async function checkURLShare() {
  const hash = location.hash.slice(1);
  if (!hash) return;
  const shared = decodeFromURL(hash);
  if (!shared) return;
  history.replaceState(null, '', location.pathname);
  await createTextClip(shared.content, { language: shared.language, label: shared.label, skipDupeCheck: true });
  showToast('Shared clip loaded!');
}

// ── FlexSearch ─────────────────────────────────────────────────────────────────

function buildSearchIndex() {
  if (!window.FlexSearch) return;
  searchIndex = new FlexSearch.Document({
    tokenize: 'forward',
    cache: 100,
    document: {
      id: 'id',
      index: [
        { field: 'text',     tokenize: 'forward' },
        { field: 'label',    tokenize: 'full' },
        { field: 'language', tokenize: 'full' },
      ],
    },
  });
  clips.forEach(clip => indexClip(clip));
}

function indexClip(clip) {
  if (!searchIndex) return;
  const rawText = clip.type === 'text' ? (decompressText(clip) || '') : '';
  searchIndex.add({
    id: clip.id,
    text: rawText.slice(0, 12000),
    label: clip.label || '',
    language: clip.language || '',
  });
}

function removeFromIndex(clipId) {
  if (!searchIndex) return;
  try { searchIndex.remove(clipId); } catch {}
}

function flexSearch(query) {
  if (!searchIndex || !query.trim()) return null; // null = no filter
  const results = searchIndex.search(query, { limit: 200, enrich: false });
  const ids = new Set(results.flatMap(r => r.result));
  return ids;
}

// ── Paste handler ──────────────────────────────────────────────────────────────

async function onGlobalPaste(e) {
  const active = document.activeElement;
  if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) return;
  e.preventDefault();

  const cd = e.clipboardData;
  if (!cd) return;
  const type = detectType(cd);

  if (type === 'image') {
    const blob = extractImage(cd);
    if (blob) await handleImagePaste(blob);
  } else if (type === 'text-file') {
    const result = await extractTextFile(cd);
    if (result) await createTextClip(result.text, { label: result.filename });
  } else if (type === 'text') {
    const text = extractText(cd);
    if (text.trim()) await createTextClip(text);
  }
}

// ── Create clips ───────────────────────────────────────────────────────────────

async function createTextClip(text, opts = {}) {
  if (!opts.skipDupeCheck) {
    const hash = await hashText(text);
    const dupe = await findByHash(hash);
    if (dupe) {
      selectAndReveal(dupe.id);
      showToast('Duplicate — scrolled to existing clip', 'warn');
      return;
    }
  }

  const hash  = await hashText(text);
  const lang  = opts.language || detectLanguage(text);
  const creds = detectCredentials(text);
  const lines = text.split('\n').length;
  const { compressed, data, originalSize, size } = compressText(text);

  const clip = await saveTextClip({
    content: data, language: lang, compressed,
    sizeBytes: size, originalSizeBytes: originalSize,
    label: opts.label || '', ephemeral: true, pinned: false,
    contentHash: hash, lineCount: lines,
  });

  clips.unshift(clip);
  indexClip(clip);
  render();
  selectAndReveal(clip.id);
  updateStorage();

  if (creds.length) {
    showToast(`⚠ Possible ${creds[0]} detected — be careful sharing this`, 'warn', 5000);
  }
}

async function handleImagePaste(rawBlob) {
  let result;
  try { result = await optimizeImage(rawBlob); }
  catch (err) { showToast(err.message, 'error'); return; }

  const { blob, dimensions, originalSize } = result;
  const hash = await hashBlob(blob);
  const dupe = await findByHash(hash);
  if (dupe) {
    selectAndReveal(dupe.id);
    showToast('Duplicate image — scrolled to existing clip', 'warn');
    return;
  }

  const savedKB = Math.round((originalSize - blob.size) / 1024);
  const clip = await saveImageClip(blob, { dimensions, originalSizeBytes: originalSize, contentHash: hash });

  clips.unshift(clip);
  indexClip(clip);
  render();
  selectAndReveal(clip.id);
  updateStorage();
  if (savedKB > 10) showToast(`Image optimized — saved ${savedKB} KB`);
}

// ── Scratchpad ─────────────────────────────────────────────────────────────────
// Typing anywhere (no focused input) opens a live scratchpad that auto-saves.

function activateScratchpad(char) {
  let card = $('scratchpad-card');
  if (!card) {
    card = buildScratchpadCard();
    // Prepend to feed, ensure feed visible
    clipFeed.classList.remove('hidden');
    pasteZone.classList.add('hidden');
    clipFeed.prepend(card);
    // Animate in
    requestAnimationFrame(() => card.classList.add('scratchpad-enter'));
  }

  const ta = $('scratchpad-ta');
  ta.focus();

  // Insert the typed character at cursor position
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  ta.value = ta.value.slice(0, s) + char + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + 1;
  ta.dispatchEvent(new Event('input'));
}

function buildScratchpadCard() {
  const card = document.createElement('div');
  card.id = 'scratchpad-card';
  card.className = 'bg-nb-card border border-nb-accent/20 rounded-xl overflow-hidden opacity-0';

  card.innerHTML = `
    <div class="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <span class="material-symbols-outlined text-nb-accent" style="font-size:14px">edit_note</span>
        <span class="text-[10px] font-bold uppercase tracking-widest text-nb-accent">Scratchpad</span>
        <span id="sp-status" class="text-[10px] text-nb-muted transition-opacity duration-300 opacity-0"></span>
      </div>
      <div class="flex items-center gap-3">
        <button id="sp-commit" class="text-[11px] text-nb-muted hover:text-nb-accent transition-colors">Save as clip  ↵</button>
        <button id="sp-discard" class="text-[11px] text-nb-muted hover:text-red-400 transition-colors">Discard  Esc</button>
      </div>
    </div>
    <textarea
      id="scratchpad-ta"
      class="w-full bg-transparent text-nb-text font-mono text-sm p-4 outline-none resize-none min-h-[130px] leading-relaxed placeholder:text-white/20"
      placeholder="Start typing… auto-saves every keystroke"
      autocomplete="off" spellcheck="false"
    ></textarea>
  `;

  const ta     = card.querySelector('#scratchpad-ta');
  const status = card.querySelector('#sp-status');

  ta.addEventListener('input', () => {
    clearTimeout(scratchpadTimer);
    status.textContent = 'Saving…';
    status.style.opacity = '1';
    scratchpadTimer = setTimeout(async () => {
      await flushScratchpad(ta.value);
      status.textContent = 'Saved';
      setTimeout(() => { status.style.opacity = '0'; }, 1200);
    }, SP_SAVE_DELAY);
  });

  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); commitScratchpad(ta.value, false); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.stopPropagation(); commitScratchpad(ta.value, true); }
  });

  card.querySelector('#sp-commit').addEventListener('click', () => {
    commitScratchpad(ta.value, true);
  });

  card.querySelector('#sp-discard').addEventListener('click', () => {
    commitScratchpad(ta.value, false);
  });

  return card;
}

async function flushScratchpad(text) {
  if (!text.trim()) return;
  const lang  = detectLanguage(text);
  const hash  = await hashText(text);
  const lines = text.split('\n').length;
  const { compressed, data, originalSize, size } = compressText(text);

  if (scratchpadId) {
    const idx = clips.findIndex(c => c.id === scratchpadId);
    if (idx >= 0) {
      const updated = {
        ...clips[idx],
        content: data, language: lang, compressed,
        sizeBytes: size, originalSizeBytes: originalSize,
        contentHash: hash, lineCount: lines,
      };
      clips[idx] = updated;
      await saveTextClip(updated);
      removeFromIndex(updated.id);
      indexClip(updated);
      renderSidebar(visibleClips()); // update sidebar only — don't destroy the textarea
      return;
    }
  }

  const clip = await saveTextClip({
    content: data, language: lang, compressed,
    sizeBytes: size, originalSizeBytes: originalSize,
    label: 'Scratchpad', ephemeral: true, pinned: false,
    contentHash: hash, lineCount: lines,
  });
  scratchpadId = clip.id;
  clips.unshift(clip);
  indexClip(clip);
  renderSidebar(visibleClips());
  selectClip(clip.id);
}

async function commitScratchpad(text, saveAsClip) {
  clearTimeout(scratchpadTimer);
  const card = $('scratchpad-card');
  if (card) {
    card.style.opacity = '0';
    card.style.transform = 'translateY(-8px)';
    card.style.transition = 'all 0.15s ease';
    setTimeout(() => card.remove(), 150);
  }

  // Remove the live scratchpad clip from list
  if (scratchpadId) {
    await deleteClip(scratchpadId);
    removeFromIndex(scratchpadId);
    clips = clips.filter(c => c.id !== scratchpadId);
    scratchpadId = null;
  }

  if (saveAsClip && text.trim()) {
    await createTextClip(text, { label: 'Scratchpad note' });
  } else {
    render(); // refresh without scratchpad
  }
}

// ── Load & render ──────────────────────────────────────────────────────────────

async function loadClips() {
  clips = await getAllClips();
  buildSearchIndex();
  render();
  if (clips.length) selectClip(clips[0].id);
}

function visibleClips() {
  let pool = clips;

  // FlexSearch filter
  if (searchQuery.trim()) {
    const ids = flexSearch(searchQuery);
    if (ids) pool = pool.filter(c => ids.has(c.id));
    else pool = pool.filter(c => {
      // Fallback simple filter if FlexSearch unavailable
      const hay = [c.label, c.language, decompressText(c)].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(searchQuery.toLowerCase());
    });
  }

  // Type filter
  if (activeFilter === 'code')  pool = pool.filter(c => c.language);
  if (activeFilter === 'image') pool = pool.filter(c => c.type === 'image');
  if (activeFilter === 'text')  pool = pool.filter(c => !c.language && c.type !== 'image');

  return pool;
}

function render() {
  const visible = visibleClips();
  renderSidebar(visible);
  renderFeed(visible);
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

function renderSidebar(visible) {
  sidebarList.innerHTML = '';
  const hasItems = visible.length > 0;
  sidebarEmpty.classList.toggle('hidden', hasItems);
  sidebarList.classList.toggle('hidden', !hasItems);

  visible.forEach(clip => {
    const el = document.createElement('div');
    el.dataset.clipId = clip.id;
    const isSelected = clip.id === selectedId;

    el.className = `sidebar-item p-3 rounded-lg cursor-pointer transition-colors duration-150 ${
      isSelected
        ? 'bg-nb-card border border-nb-accent/20'
        : 'hover:bg-white/5 border border-transparent'
    }`;

    const typeLabel = clip.type === 'image' ? 'Image' : (clip.language ? langLabel(clip.language) : 'Plain Text');
    const accentCls = isSelected ? 'text-nb-accent' : 'text-nb-muted';
    const pinEl     = clip.pinned ? `<span class="material-symbols-outlined ${accentCls}" style="font-size:12px;font-variation-settings:'FILL' 1">push_pin</span>` : '';
    const title     = clip.type === 'image' ? (clip.label || 'Pasted image') : (clip.label || previewTitle(clip));

    el.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <span class="text-[10px] font-bold uppercase tracking-widest ${accentCls}">${escHtml(typeLabel)}</span>
        ${pinEl}
      </div>
      <p class="text-xs font-medium truncate mb-1 text-nb-text">${escHtml(title)}</p>
      <p class="text-[10px] text-nb-muted">${timeAgo(clip.createdAt)}</p>
    `;

    el.addEventListener('click', () => selectAndReveal(clip.id));
    sidebarList.appendChild(el);
  });
}

function previewTitle(clip) {
  const raw = decompressText(clip) || '';
  const first = raw.split('\n').find(l => l.trim().length > 3) || '';
  return first.trim().slice(0, 55) || '(empty)';
}

// ── Feed ───────────────────────────────────────────────────────────────────────

function renderFeed(visible) {
  clipFeed.innerHTML = '';

  const hasClips = visible.length > 0;
  pasteZone.classList.toggle('hidden', hasClips);
  clipFeed.classList.toggle('hidden', !hasClips);

  if (!hasClips) return;

  visible.forEach((clip, i) => {
    const rawText = clip.type === 'text' ? decompressText(clip) : null;
    const card = buildDetailCard(clip, rawText);
    card.style.animationDelay = `${i * 30}ms`;
    card.classList.add('clip-enter');
    clipFeed.appendChild(card);
  });

  if (window.Prism) {
    requestAnimationFrame(() => {
      document.querySelectorAll('pre code[class^="language-"]').forEach(el => {
        try { Prism.highlightElement(el); } catch {}
      });
    });
  }
}

// ── Detail card ────────────────────────────────────────────────────────────────

function buildDetailCard(clip, rawText) {
  const wrap = document.createElement('div');
  wrap.id = `clip-detail-${clip.id}`;
  wrap.className = 'detail-card space-y-4';
  wrap.tabIndex = 0;

  const typeLabel = clip.type === 'image' ? 'Image' : (clip.language ? langLabel(clip.language) : 'Plain Text');
  const metaLine  = clip.type === 'image'
    ? `${timeAgo(clip.createdAt)} · ${fmtBytes(clip.sizeBytes)}${clip.dimensions ? ` · ${clip.dimensions.w}×${clip.dimensions.h}` : ''}`
    : `${timeAgo(clip.createdAt)} · ${clip.lineCount ?? (rawText?.split('\n').length ?? 0)} lines`;

  wrap.innerHTML = `
    <div class="flex items-start justify-between gap-4">
      <div>
        <h2 class="text-xl font-light text-nb-text">${escHtml(typeLabel)} Clip</h2>
        <p class="text-sm text-nb-muted mt-0.5">${escHtml(metaLine)}</p>
      </div>
      <div class="flex items-center gap-2 shrink-0 pt-1">
        <button class="btn-copy flex items-center gap-1.5 px-3 py-1.5 bg-nb-card border border-white/10 rounded text-xs hover:bg-nb-accent/10 hover:border-nb-accent/30 transition-colors">
          <span class="material-symbols-outlined" style="font-size:14px">content_copy</span>Copy
        </button>
        <button class="btn-share icon-action" title="Share URL  (s)"><span class="material-symbols-outlined" style="font-size:16px">link</span></button>
        <button class="btn-download icon-action" title="Download  (d)"><span class="material-symbols-outlined" style="font-size:16px">download</span></button>
        <button class="btn-pin icon-action ${clip.pinned ? 'text-nb-accent border-nb-accent/30' : ''}" title="Pin / unpin  (p)">
          <span class="material-symbols-outlined" style="font-size:16px;font-variation-settings:'FILL' ${clip.pinned ? 1 : 0}">${clip.pinned ? 'push_pin' : 'keep'}</span>
        </button>
        <button class="btn-delete icon-action hover:!text-red-400 hover:!border-red-400/30" title="Delete  (x)"><span class="material-symbols-outlined" style="font-size:16px">delete</span></button>
      </div>
    </div>
    ${buildContentBlock(clip, rawText)}
  `;

  wrap.querySelector('.btn-copy').addEventListener('click',     () => handleCopy(clip, rawText, wrap));
  wrap.querySelector('.btn-share').addEventListener('click',    () => handleShare(clip, rawText));
  wrap.querySelector('.btn-download').addEventListener('click', () => handleDownload(clip, rawText));
  wrap.querySelector('.btn-pin').addEventListener('click',      () => handlePin(clip));
  wrap.querySelector('.btn-delete').addEventListener('click',   () => handleDelete(clip));

  if (clip.type === 'image') {
    const imgEl = wrap.querySelector('.clip-img-thumb');
    if (imgEl) {
      getBlob(clip.blobId).then(blob => {
        if (blob) {
          imgEl.src = URL.createObjectURL(blob);
          imgEl.classList.add('img-fade-in');
        }
      });
      imgEl.addEventListener('click', () => openImageModal(clip));
    }
  }

  // Expand button
  const expandBtn = wrap.querySelector('.btn-expand');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      const expanded = expandBtn.dataset.expanded === 'true';
      if (expanded) {
        wrap.replaceWith(buildDetailCard(clip, rawText));
        if (window.Prism) {
          document.querySelectorAll('pre code[class^="language-"]').forEach(el => {
            try { Prism.highlightElement(el); } catch {}
          });
        }
      } else {
        expandBtn.dataset.expanded = 'true';
        expandBtn.textContent = 'Show less';
        const pre = wrap.querySelector('pre');
        const code = wrap.querySelector('code');
        const textBody = wrap.querySelector('.clip-text-body');
        if (pre) pre.style.maxHeight = 'none';
        if (code) { code.textContent = rawText || ''; if (window.Prism) try { Prism.highlightElement(code); } catch {} }
        if (textBody) textBody.textContent = rawText || '';
      }
    });
  }

  return wrap;
}

function buildContentBlock(clip, rawText) {
  if (clip.type === 'image') {
    const savings = clip.originalSizeBytes && clip.originalSizeBytes > clip.sizeBytes
      ? `<span class="text-[10px] text-nb-muted/60">Optimized ${fmtBytes(clip.originalSizeBytes)} → ${fmtBytes(clip.sizeBytes)}</span>` : '';
    return `
      <div class="bg-nb-card border border-white/5 rounded-xl overflow-hidden">
        <div class="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span class="text-xs font-medium text-nb-muted">${escHtml(clip.label || 'pasted-image')}</span>${savings}
        </div>
        <div class="p-4 bg-black/20 flex justify-center">
          <img class="clip-img-thumb max-h-80 object-contain rounded-lg shadow-lg cursor-zoom-in opacity-0" alt="pasted image" />
        </div>
      </div>`;
  }

  const text  = rawText || '';
  const lines = text.split('\n');
  const isLong= lines.length > 30;
  const shown = isLong ? lines.slice(0, 30).join('\n') : text;
  const lang  = clip.language;

  if (lang) {
    return `
      <div class="bg-nb-card border border-white/5 rounded-xl overflow-hidden">
        <div class="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
          <span class="text-[10px] font-bold uppercase tracking-widest text-nb-accent">${escHtml(langLabel(lang))}</span>
          ${clip.lineCount ? `<span class="text-[10px] text-nb-muted">${clip.lineCount} lines</span>` : ''}
        </div>
        <pre class="p-5 text-sm font-mono leading-relaxed overflow-x-auto${isLong ? ' max-h-[380px] overflow-y-hidden' : ''}"
             style="margin:0;background:transparent"><code class="language-${lang}">${escHtml(shown)}</code></pre>
        ${isLong ? `<button class="btn-expand w-full py-2.5 text-[11px] text-nb-accent border-t border-white/5 hover:bg-white/5 transition-colors" data-expanded="false">+ ${lines.length - 30} more lines</button>` : ''}
      </div>`;
  }

  return `
    <div class="bg-nb-card border border-white/5 rounded-xl p-6">
      <div class="flex items-center gap-2 mb-4">
        <span class="material-symbols-outlined text-nb-muted" style="font-size:16px">notes</span>
        <span class="text-[10px] uppercase tracking-widest font-bold text-nb-muted">Plain Text</span>
      </div>
      <p class="clip-text-body text-base font-light leading-relaxed text-nb-text whitespace-pre-wrap break-words">${escHtml(shown)}</p>
      ${isLong ? `<button class="btn-expand mt-4 text-xs text-nb-accent hover:underline" data-expanded="false">+ ${lines.length - 30} more lines</button>` : ''}
    </div>`;
}

// ── Selection & scroll ─────────────────────────────────────────────────────────

function selectClip(id) {
  selectedId = id;
  document.querySelectorAll('.sidebar-item').forEach(el => {
    const sel = el.dataset.clipId === id;
    el.classList.toggle('bg-nb-card', sel);
    el.classList.toggle('border-nb-accent/20', sel);
    el.classList.toggle('hover:bg-white/5', !sel);
    el.classList.toggle('border-transparent', !sel);
  });
}

function selectAndReveal(id) {
  selectClip(id);
  const el = $(`clip-detail-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('clip-highlight');
  setTimeout(() => el.classList.remove('clip-highlight'), 800);
}

// ── Actions ────────────────────────────────────────────────────────────────────

async function handleCopy(clip, rawText, card) {
  if (clip.type === 'image') {
    const blob = await getBlob(clip.blobId);
    if (blob && navigator.clipboard?.write) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        flashCopyBtn(card);
        return;
      } catch {}
    }
    showToast('Could not copy image — try downloading.', 'error');
    return;
  }
  if (rawText) {
    const ok = await copyToClipboard(rawText);
    if (ok) flashCopyBtn(card);
    else showToast('Copy failed.', 'error');
  }
}

async function handleShare(clip, rawText) {
  if (clip.type === 'image') { showToast('Images cannot be shared via URL — use Download.', 'warn'); return; }
  const { url, tooBig } = getShareInfo(clip, rawText);
  if (tooBig) { showToast('Clip too large for URL sharing (>8 KB). Use Download.', 'warn'); return; }
  if (url) { await copyToClipboard(url); showToast('Share URL copied!'); }
}

function handleDownload(clip, rawText) {
  if (clip.type === 'image') {
    getBlob(clip.blobId).then(blob => {
      if (!blob) return;
      const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      dlBlob(blob, `clip.${ext}`);
    });
    return;
  }
  dlBlob(new Blob([rawText || ''], { type: 'text/plain' }), `clip.${langToExt(clip.language)}`);
}

async function handlePin(clip) {
  if (clip.pinned) {
    await unpinClip(clip.id);
    const i = clips.findIndex(c => c.id === clip.id);
    if (i >= 0) { clips[i].pinned = false; clips[i].ephemeral = true; }
    showToast('Unpinned — expires in 24 h');
  } else {
    const updated = await pinClip(clip.id);
    if (updated) {
      const i = clips.findIndex(c => c.id === clip.id);
      if (i >= 0) clips[i] = updated;
    }
    showToast('Pinned — saved indefinitely');
  }
  render();
  updateStorage();
}

async function handleDelete(clip) {
  const detail = $(`clip-detail-${clip.id}`);
  if (detail) {
    detail.classList.add('clip-exit');
  }
  setTimeout(async () => {
    await deleteClip(clip.id);
    removeFromIndex(clip.id);
    clips = clips.filter(c => c.id !== clip.id);
    if (selectedId === clip.id) selectedId = clips[0]?.id || null;
    render();
    updateStorage();
  }, 180);
}

// ── Manual entry ───────────────────────────────────────────────────────────────

function openManualEntry() {
  const existing = $('manual-entry-card');
  if (existing) { existing.querySelector('textarea')?.focus(); return; }

  const card = document.createElement('div');
  card.id = 'manual-entry-card';
  card.className = 'bg-nb-card border border-white/10 rounded-xl overflow-hidden clip-enter';
  card.innerHTML = `
    <textarea id="manual-ta" class="w-full bg-transparent text-nb-text text-sm font-mono p-4 outline-none resize-none leading-relaxed min-h-[140px] placeholder:text-white/20"
      placeholder="Type or paste content here… (⌘↵ to save, Esc to cancel)" rows="6" autocomplete="off" spellcheck="false"></textarea>
    <div class="px-4 py-2.5 border-t border-white/5 flex items-center gap-2">
      <button id="manual-save" class="px-3 py-1.5 bg-nb-accent text-nb-side text-xs font-semibold rounded hover:bg-nb-accent/90 transition-colors">Save clip</button>
      <button id="manual-cancel" class="px-3 py-1.5 text-nb-muted text-xs hover:text-nb-text transition-colors">Cancel</button>
    </div>
  `;

  clipFeed.prepend(card);
  clipFeed.classList.remove('hidden');
  pasteZone.classList.add('hidden');
  card.querySelector('#manual-ta').focus();

  card.querySelector('#manual-save').addEventListener('click', async () => {
    const text = card.querySelector('#manual-ta').value.trim();
    if (!text) return;
    card.remove();
    await createTextClip(text);
  });

  card.querySelector('#manual-cancel').addEventListener('click', () => {
    card.remove();
    if (!clips.length) { clipFeed.classList.add('hidden'); pasteZone.classList.remove('hidden'); }
  });

  card.querySelector('#manual-ta').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); card.querySelector('#manual-cancel').click(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) card.querySelector('#manual-save').click();
  });
}

// ── Image modal ────────────────────────────────────────────────────────────────

function openImageModal(clip) {
  getBlob(clip.blobId).then(blob => {
    if (!blob) return;
    imgModal.classList.remove('modal-visible');   // reset to scale(0.92) opacity:0
    imgModalSrc.src = URL.createObjectURL(blob);
    imgModal.classList.remove('opacity-0', 'pointer-events-none');
    // Double rAF lets the browser paint the initial state before transitioning
    requestAnimationFrame(() => requestAnimationFrame(() => imgModal.classList.add('modal-visible')));
  });
}

function closeImageModal() {
  imgModal.classList.add('opacity-0', 'pointer-events-none');
  imgModal.classList.remove('modal-visible');
  setTimeout(() => {
    if (imgModalSrc.src.startsWith('blob:')) URL.revokeObjectURL(imgModalSrc.src);
    imgModalSrc.src = '';
  }, 220);
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────
// Single-key shortcuts (no Cmd) to avoid browser conflicts:
//   n  → new clip
//   p  → pin/unpin focused clip
//   x  → delete focused clip
//   c  → copy focused clip
//   s  → share URL focused clip
//   j/k → navigate sidebar
//   ?  → shortcuts overlay
//   /  → focus search  (also Cmd+K)

function onKeyDown(e) {
  const active   = document.activeElement;
  const inSearch = active === searchInput;
  const inInput  = (active?.tagName === 'TEXTAREA' || active?.tagName === 'INPUT') && !inSearch;
  if (inInput) return;

  const meta = e.metaKey || e.ctrlKey;

  // Always-active shortcuts
  if (e.key === 'Escape') { setOverlay(false); closeImageModal(); if (inSearch) searchInput.blur(); return; }
  if ((meta && e.key === 'k') || (e.key === '/' && !meta && !inSearch)) {
    e.preventDefault(); searchInput.focus(); return;
  }

  // Blocked while search is focused
  if (inSearch) return;

  if (e.key === '?' && !meta) { e.preventDefault(); setOverlay(true); return; }

  // ── Single-key clip shortcuts (no modifiers) ──
  const isBare = !meta && !e.altKey && !e.shiftKey;

  if (isBare && e.key === 'n') { e.preventDefault(); openManualEntry(); return; }

  // j/k sidebar navigation
  const sideItems = Array.from(document.querySelectorAll('.sidebar-item'));
  const curIdx    = sideItems.findIndex(el => el.dataset.clipId === selectedId);

  if (isBare && e.key === 'j') {
    e.preventDefault();
    const next = sideItems[Math.min(curIdx + 1, sideItems.length - 1)];
    if (next) selectAndReveal(next.dataset.clipId);
    return;
  }
  if (isBare && e.key === 'k') {
    e.preventDefault();
    const prev = sideItems[Math.max(curIdx - 1, 0)];
    if (prev) selectAndReveal(prev.dataset.clipId);
    return;
  }

  // Clip-level actions require a selected clip
  if (!selectedId) {
    // Capture printable chars for scratchpad
    if (isBare && e.key.length === 1) { e.preventDefault(); activateScratchpad(e.key); }
    return;
  }

  const clip    = clips.find(c => c.id === selectedId);
  if (!clip) return;
  const rawText = clip.type === 'text' ? decompressText(clip) : null;
  const card    = $(`clip-detail-${selectedId}`);

  if (isBare) {
    switch (e.key) {
      case 'p': e.preventDefault(); handlePin(clip); return;
      case 'x': e.preventDefault(); handleDelete(clip); return;
      case 'c': e.preventDefault(); handleCopy(clip, rawText, card); return;
      case 's': e.preventDefault(); handleShare(clip, rawText); return;
      // Printable non-shortcut chars → scratchpad
      default:
        if (e.key.length === 1) { e.preventDefault(); activateScratchpad(e.key); }
    }
    return;
  }

  // Cmd+Shift+C → copy (secondary shortcut alongside bare 'c')
  if (meta && e.shiftKey && e.key === 'C') { e.preventDefault(); handleCopy(clip, rawText, card); return; }
}

// ── Storage ────────────────────────────────────────────────────────────────────

async function updateStorage() {
  const used = await estimateStorageUsed();
  const pct  = Math.min(100, (used / SOFT_LIMIT_BYTES) * 100);
  storageBar.style.width = `${pct}%`;
  storageBar.style.backgroundColor = pct > 80 ? '#f59e0b' : '#c5b358';
  storagePct.textContent  = `${Math.round(pct)}%`;
  storageText.textContent = `${fmtBytes(used)} / ${fmtBytes(SOFT_LIMIT_BYTES)}`;
}

// ── Toast ──────────────────────────────────────────────────────────────────────

let toastTimer;
function showToast(msg, type = 'info', ms = 3000) {
  toast.textContent = msg;
  toast.style.borderColor = {
    error: 'rgba(239,68,68,0.4)',
    warn:  'rgba(197,179,88,0.4)',
    info:  'rgba(255,255,255,0.1)',
  }[type] ?? 'rgba(255,255,255,0.1)';
  toast.classList.remove('opacity-0');
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('opacity-0');
    toast.classList.remove('show');
  }, ms);
}

function flashCopyBtn(card) {
  const btn = card?.querySelector('.btn-copy');
  if (btn) {
    btn.classList.add('copied-anim');
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">check</span>Copied!';
    btn.classList.add('!text-nb-accent', '!border-nb-accent/30');
    setTimeout(() => {
      btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">content_copy</span>Copy';
      btn.classList.remove('!text-nb-accent', '!border-nb-accent/30', 'copied-anim');
    }, 1800);
  }
  showToast('Copied to clipboard!');
}

// ── Overlay ────────────────────────────────────────────────────────────────────

function setOverlay(show) {
  shortcutOverlay.classList.toggle('opacity-0', !show);
  shortcutOverlay.classList.toggle('pointer-events-none', !show);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function dlBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fmtBytes(b) {
  if (!b) return '0 B';
  if (b < 1024)         return `${b} B`;
  if (b < 1024 * 1024)  return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
