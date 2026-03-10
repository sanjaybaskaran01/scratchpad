<script>
  import { clipsState, computeVisibleClips, searchIndex, setSearchIndex } from './state/clips.svelte.js';
  const visibleClips = $derived(computeVisibleClips());
  import { uiState } from './state/ui.svelte.js';

  import {
    detectType, extractText, extractImage, extractTextFile,
    langLabel, langToExt,
    compressText, decompressText,
    optimizeImage, detectCredentials,
    hashText, hashBlob,
  } from './lib/clips.js';

  import {
    saveTextClip, saveImageClip, deleteClip, restoreClip,
    pinClip, unpinClip,
    getAllClips, getBlob, purgeExpired, estimateStorageUsed,
    getSettings, saveSetting, findByHash, SOFT_LIMIT_BYTES,
    onStorageChange,
  } from './lib/storage.js';

  import { copyToClipboard, getShareInfo, decodeFromURL } from './lib/sharing.js';
  import { highlightSnippet } from './lib/highlight.js';
  import { generateCode } from './lib/p2p.js';

  import Header          from './components/Header.svelte';
  import Sidebar         from './components/Sidebar.svelte';
  import ClipFeed        from './components/ClipFeed.svelte';
  import Toast           from './components/Toast.svelte';
  import ShortcutOverlay from './components/ShortcutOverlay.svelte';
  import ImageModal      from './components/ImageModal.svelte';
  import P2PModal        from './components/P2PModal.svelte';

  import FlexSearch from 'flexsearch';
  const FlexDocument = FlexSearch.Document;

  // ── Refs ─────────────────────────────────────────────────────────────────────
  let searchInputEl = $state(null);

  // ── Scratchpad state ─────────────────────────────────────────────────────────
  let scratchpadClipId = null;

  // ── Init ─────────────────────────────────────────────────────────────────────
  $effect(() => {
    initApp();
    document.addEventListener('paste',   onGlobalPaste);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const timer = setInterval(updateStorage, 30_000);
    const unsubSync = onStorageChange(() => loadClips());
    return () => {
      document.removeEventListener('paste',   onGlobalPaste);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(timer);
      unsubSync();
    };
  });

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') loadClips();
  }

  async function initApp() {
    await purgeExpired();
    await loadClips();
    checkURLShare();
    await updateStorage();
  }

  // ── URL share on load ────────────────────────────────────────────────────────
  async function checkURLShare() {
    const hash = location.hash.slice(1);
    if (!hash) return;

    // P2P shareable link: #p2p=XXXXXXXX
    const p2pMatch = hash.match(/^p2p=([A-Za-z0-9]{8})$/);
    if (p2pMatch) {
      history.replaceState(null, '', location.pathname);
      uiState.p2pShare = { open: true, mode: 'receiver', clip: null, code: null, peer: null, prefillCode: p2pMatch[1] };
      return;
    }

    const shared = decodeFromURL(hash);
    if (!shared) return;
    history.replaceState(null, '', location.pathname);
    await createTextClip(shared.content, { language: shared.language, label: shared.label, skipDupeCheck: true });
    showToast('Shared clip loaded!');
  }

  // ── Search index ─────────────────────────────────────────────────────────────
  function buildSearchIndex() {
    const idx = new FlexDocument({
      tokenize: 'forward',
      cache: 100,
      document: {
        id: 'id',
        index: [
          { field: 'text',     tokenize: 'forward' },
          { field: 'label',    tokenize: 'full'    },
          { field: 'language', tokenize: 'full'    },
        ],
      },
    });
    clipsState.all.forEach(clip => indexClip(clip, idx));
    setSearchIndex(idx);
  }

  function indexClip(clip, idx) {
    const si = idx || searchIndex;
    if (!si) return;
    const rawText = clip.type === 'text' ? (decompressText(clip) || '') : '';
    si.add({
      id:       clip.id,
      text:     rawText.slice(0, 12000),
      label:    clip.label    || '',
      language: clip.language || '',
    });
  }

  function removeFromIndex(clipId) {
    if (!searchIndex) return;
    try { searchIndex.remove(clipId); } catch (err) {
      console.warn('Search index removal failed:', err);
    }
  }

  // ── Load clips ───────────────────────────────────────────────────────────────
  async function loadClips() {
    const clips = await getAllClips();
    clipsState.all = clips;
    buildSearchIndex();
    // Preserve current selection if the clip still exists, otherwise select first
    if (!clipsState.selectedId || !clips.find(c => c.id === clipsState.selectedId)) {
      clipsState.selectedId = clips[0]?.id || null;
    }
  }

  // ── Storage ──────────────────────────────────────────────────────────────────
  async function updateStorage() {
    try {
      uiState.storageUsed = await estimateStorageUsed();
    } catch (err) {
      console.warn('Storage estimate failed:', err);
    }
  }

  // ── Toast ────────────────────────────────────────────────────────────────────
  let toastTimer = null;
  function showToast(msg, type = 'info', ms = 3000) {
    clearTimeout(toastTimer);
    uiState.toast = { msg, type, visible: true };
    toastTimer = setTimeout(() => { uiState.toast.visible = false; }, ms);
  }

  // ── Paste handler ────────────────────────────────────────────────────────────
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

  // ── Create clips ─────────────────────────────────────────────────────────────
  async function createTextClip(text, opts = {}) {
    const hash = await hashText(text);

    if (!opts.skipDupeCheck) {
      const dupe = await findByHash(hash);
      if (dupe) {
        selectAndReveal(dupe.id);
        showToast('Duplicate — scrolled to existing clip', 'warn');
        return null;
      }
    }

    const { language } = highlightSnippet(text);
    const lang  = opts.language || language;
    const creds = detectCredentials(text);
    const lines = text.split('\n').length;
    const { compressed, data, originalSize, size } = compressText(text);

    const clip = await saveTextClip({
      content: data, language: lang, compressed,
      sizeBytes: size, originalSizeBytes: originalSize,
      label: opts.label || '', ephemeral: false, pinned: false,
      contentHash: hash, lineCount: lines,
    });

    clipsState.all.unshift(clip);
    indexClip(clip);
    selectAndReveal(clip.id);
    updateStorage();

    if (creds.length) {
      showToast(`⚠ Possible ${creds[0]} detected — be careful sharing this`, 'warn', 5000);
    }
    return clip;
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

    clipsState.all.unshift(clip);
    indexClip(clip);
    selectAndReveal(clip.id);
    updateStorage();
    if (savedKB > 10) showToast(`Image saved · optimized ${savedKB} KB`);
    else showToast('Image saved as clip');
  }

  // ── Selection ────────────────────────────────────────────────────────────────
  function selectAndReveal(id) {
    clipsState.selectedId = id;
    uiState.mobileSidebarOpen = false;
    // Scroll to the card (DOM not yet updated; use nextTick)
    requestAnimationFrame(() => {
      const el = document.getElementById(`clip-detail-${id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('clip-highlight');
      setTimeout(() => el.classList.remove('clip-highlight'), 800);
    });
  }

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function convertToPng(blob) {
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    return await canvas.convertToBlob({ type: 'image/png' });
  }

  async function handleCopy(clip, rawText) {
    if (clip.type === 'image') {
      const blob = await getBlob(clip.blobId);
      if (blob && navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
          showToast('Copied to clipboard!');
          return;
        } catch {
          // Non-PNG blobs fail in most browsers — convert and retry
          try {
            const pngBlob = await convertToPng(blob);
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
            showToast('Copied to clipboard!');
            return;
          } catch (e) {
            console.error('Image copy failed:', e);
          }
        }
      }
      showToast('Could not copy image — try downloading.', 'error');
      return;
    }
    if (rawText) {
      const ok = await copyToClipboard(rawText);
      if (ok) showToast('Copied to clipboard!');
      else    showToast('Copy failed.', 'error');
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
      const i = clipsState.all.findIndex(c => c.id === clip.id);
      if (i >= 0) { clipsState.all[i].pinned = false; clipsState.all[i].ephemeral = true; }
      showToast('Unpinned — expires in 24 h');
    } else {
      const updated = await pinClip(clip.id);
      if (updated) {
        const i = clipsState.all.findIndex(c => c.id === clip.id);
        if (i >= 0) clipsState.all[i] = updated;
      }
      showToast('Pinned — saved indefinitely');
    }
    updateStorage();
  }

  // ── Undo delete — session-level stack (no expiry) ───────────────────────────
  // Each entry: { clip, blob, insertIdx }
  // Capped at 100 entries to keep memory reasonable.
  const undoStack = [];
  const UNDO_STACK_MAX = 100;

  async function handleDelete(clip) {
    const detail = document.getElementById(`clip-detail-${clip.id}`);
    if (detail) detail.classList.add('clip-exit');

    // Snapshot the clip and its blob BEFORE deleting from storage
    const clipSnapshot = { ...clip };
    const insertIdx    = clipsState.all.findIndex(c => c.id === clip.id);
    let blobSnapshot   = null;
    if (clip.type === 'image' && clip.blobId) {
      blobSnapshot = await getBlob(clip.blobId);
    }

    // Remove from UI after animation
    setTimeout(() => {
      clipsState.all = clipsState.all.filter(c => c.id !== clip.id);
      if (clipsState.selectedId === clip.id) {
        clipsState.selectedId = clipsState.all[0]?.id || null;
      }
    }, 180);

    await deleteClip(clip.id);
    removeFromIndex(clip.id);
    updateStorage();

    // Push to undo stack (trim if over cap)
    undoStack.push({ clip: clipSnapshot, blob: blobSnapshot, insertIdx });
    if (undoStack.length > UNDO_STACK_MAX) undoStack.shift();

    const depth = undoStack.length;
    showToast(`Deleted — Z to undo${depth > 1 ? ` (${depth} in stack)` : ''}`, 'info', 4000);
  }

  async function undoDelete() {
    if (!undoStack.length) return;
    const { clip, blob, insertIdx } = undoStack.pop();

    // Restore to storage exactly as it was
    await restoreClip(clip, blob);

    const idx = Math.min(insertIdx, clipsState.all.length);
    clipsState.all.splice(idx, 0, clip);
    indexClip(clip);
    selectAndReveal(clip.id);
    updateStorage();

    const remaining = undoStack.length;
    showToast(`Clip restored!${remaining > 0 ? ` (${remaining} more in stack)` : ''}`);
  }

  // ── Scratchpad ───────────────────────────────────────────────────────────────
  async function handleScratchpadCommit(text, action) {
    if (action === 'save-draft') {
      // Auto-save draft to session storage only — don't show in feed yet
      if (!text.trim()) return;
      const { language } = highlightSnippet(text);
      const hash  = await hashText(text);
      const lines = text.split('\n').length;
      const { compressed, data, originalSize, size } = compressText(text);

      if (scratchpadClipId) {
        await saveTextClip({
          id: scratchpadClipId,
          content: data, language, compressed,
          sizeBytes: size, originalSizeBytes: originalSize,
          label: 'Scratchpad', ephemeral: true, pinned: false,
          contentHash: hash, lineCount: lines,
        });
        return;
      }

      const clip = await saveTextClip({
        content: data, language, compressed,
        sizeBytes: size, originalSizeBytes: originalSize,
        label: 'Scratchpad', ephemeral: true, pinned: false,
        contentHash: hash, lineCount: lines,
      });
      scratchpadClipId = clip.id;
      return;
    }

    // commit or discard — clean up the draft, optionally save as real clip
    if (scratchpadClipId) {
      await deleteClip(scratchpadClipId);
      scratchpadClipId = null;
    }
    uiState.scratchpadActive = false;

    if (action === 'commit' && text.trim()) {
      await createTextClip(text, { label: 'Scratchpad note' });
    }
  }

  async function handleEdit(clip, newText) {
    const { language } = highlightSnippet(newText);
    const hash  = await hashText(newText);
    const lines = newText.split('\n').length;
    const { compressed, data, originalSize, size } = compressText(newText);
    const updated = {
      ...clip,
      content: data, language, compressed,
      sizeBytes: size, originalSizeBytes: originalSize,
      contentHash: hash, lineCount: lines,
    };
    await saveTextClip(updated);
    const idx = clipsState.all.findIndex(c => c.id === clip.id);
    if (idx >= 0) clipsState.all[idx] = updated;
    removeFromIndex(clip.id);
    indexClip(updated);
  }

  async function handleChangeLanguage(clip, newLang) {
    const updated = { ...clip, language: newLang };
    await saveTextClip(updated);
    const idx = clipsState.all.findIndex(c => c.id === clip.id);
    if (idx >= 0) clipsState.all[idx] = updated;
    removeFromIndex(clip.id);
    indexClip(updated);
  }

  // ── P2P sharing ──────────────────────────────────────────────────────────────
  function handleP2PSend(clip) {
    uiState.mobileSidebarOpen = false;
    const code = generateCode();
    uiState.p2pShare = { open: true, mode: 'sender', clip, code, peer: null };
  }

  function handleOpenReceive() {
    uiState.mobileSidebarOpen = false;
    uiState.p2pShare = { open: true, mode: 'receiver', clip: null, code: null, peer: null };
  }

  async function handleReceiveClip(meta, bodyBuffer) {
    let clip;
    if (meta.type === 'image') {
      const blob = new Blob([bodyBuffer], { type: meta.mimeType || 'image/png' });
      clip = await saveImageClip(blob, {
        label:      meta.label || 'Received image',
        dimensions: meta.dimensions || null,
        ephemeral:  true,
        pinned:     false,
      });
    } else {
      const content = new TextDecoder().decode(bodyBuffer);
      clip = await saveTextClip({
        content,
        language:          meta.language,
        compressed:        meta.compressed,
        label:             meta.label || 'Received clip',
        lineCount:         meta.lineCount,
        ephemeral:         false,
        pinned:            false,
        sizeBytes:         bodyBuffer.byteLength,
        originalSizeBytes: bodyBuffer.byteLength,
        contentHash:       null,
      });
    }
    clipsState.all.unshift(clip);
    indexClip(clip);
    selectAndReveal(clip.id);
    updateStorage();
    showToast('Clip received!');
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  function onKeyDown(e) {
    const active   = document.activeElement;
    const inSearch = active === searchInputEl;
    const inInput  = (active?.tagName === 'TEXTAREA' || active?.tagName === 'INPUT') && !inSearch;
    if (inInput) return;

    const meta = e.metaKey || e.ctrlKey;

    if (e.key === 'Escape') {
      if (uiState.mobileSidebarOpen) {
        uiState.mobileSidebarOpen = false;
        return;
      }
      if (clipsState.searchQuery) {
        clipsState.searchQuery = '';
        searchInputEl?.blur();
        return;
      }
      uiState.overlayOpen = false;
      uiState.imageModal.open = false;
      if (uiState.p2pShare.open) {
        uiState.p2pShare.peer?.destroy();
        uiState.p2pShare = { open: false, mode: null, clip: null, code: null, peer: null, prefillCode: null };
      }
      if (inSearch) searchInputEl?.blur();
      return;
    }
    if ((meta && e.key === 'k') || (e.key === '/' && !meta && !inSearch)) {
      e.preventDefault();
      searchInputEl?.focus();
      return;
    }
    if (inSearch) return;

    if (e.key === '?' && !meta) { e.preventDefault(); uiState.mobileSidebarOpen = false; uiState.overlayOpen = true; return; }

    const isBare = !meta && !e.altKey && !e.shiftKey;

    if (isBare && e.key === 'n') { e.preventDefault(); uiState.scratchpadActive = true; return; }
    if (isBare && e.key === 'r') { e.preventDefault(); if (!uiState.p2pShare.open) handleOpenReceive(); return; }

    // j/k sidebar navigation
    const visible = visibleClips;
    const curIdx  = visible.findIndex(c => c.id === clipsState.selectedId);

    if (isBare && e.key === 'j') {
      e.preventDefault();
      const next = visible[Math.min(curIdx + 1, visible.length - 1)];
      if (next) selectAndReveal(next.id);
      return;
    }
    if (isBare && e.key === 'k') {
      e.preventDefault();
      const prev = visible[Math.max(curIdx - 1, 0)];
      if (prev) selectAndReveal(prev.id);
      return;
    }

    if (!clipsState.selectedId) {
      if (isBare && e.key === 'z') { e.preventDefault(); undoDelete(); return; }
      if (isBare && e.key.length === 1) {
        e.preventDefault();
        uiState.scratchpadInitChar = e.key;
        uiState.scratchpadActive   = true;
      }
      return;
    }

    const clip    = clipsState.all.find(c => c.id === clipsState.selectedId);
    if (!clip) return;
    const rawText = clip.type === 'text' ? decompressText(clip) : null;

    if (isBare) {
      switch (e.key) {
        case 'p': e.preventDefault(); handlePin(clip); return;
        case 'x': e.preventDefault(); handleDelete(clip); return;
        case 'z': e.preventDefault(); undoDelete(); return;
        case 'c': e.preventDefault(); handleCopy(clip, rawText); return;
        case 's': e.preventDefault(); handleShare(clip, rawText); return;
        case 'i':
          e.preventDefault();
          if (clip.type !== 'image') clipsState.editingClipId = clip.id;
          return;
        default:
          if (e.key.length === 1) {
            e.preventDefault();
            uiState.scratchpadInitChar = e.key;
            uiState.scratchpadActive   = true;
          }
      }
      return;
    }

    if (meta && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      handleCopy(clip, rawText);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function dlBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── Touch swipe for mobile drawer ──────────────────────────────────────
  let touchStartX = 0;
  let touchStartY = 0;
  let touchTracking = false;

  function onTouchStart(e) {
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    // Track if starting from left edge (open gesture) or if drawer is open (close gesture)
    touchTracking = touchStartX < 30 || uiState.mobileSidebarOpen;
  }

  function onTouchEnd(e) {
    if (!touchTracking) return;
    touchTracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = Math.abs(t.clientY - touchStartY);
    // Require horizontal swipe (dx > 60px) and mostly horizontal (dx > dy)
    if (Math.abs(dx) < 60 || dy > Math.abs(dx)) return;
    if (dx > 0 && touchStartX < 30 && !uiState.mobileSidebarOpen) {
      uiState.mobileSidebarOpen = true;
    } else if (dx < 0 && uiState.mobileSidebarOpen) {
      uiState.mobileSidebarOpen = false;
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="h-screen flex flex-col overflow-hidden bg-nb-bg text-nb-text font-sans antialiased safe-left safe-right"
  ontouchstart={onTouchStart}
  ontouchend={onTouchEnd}
>
  <Header
    bind:searchInputEl
    onNewClip={() => uiState.scratchpadActive = true}
    onReceive={handleOpenReceive}
    onToggleSidebar={() => uiState.mobileSidebarOpen = !uiState.mobileSidebarOpen}
  />

  <div class="flex flex-1 overflow-hidden">
    <Sidebar
      onSelect={selectAndReveal}
      storageUsed={uiState.storageUsed}
    />

    <ClipFeed
      onCopy={handleCopy}
      onShare={handleShare}
      onDownload={handleDownload}
      onPin={handlePin}
      onDelete={handleDelete}
      onScratchpadCommit={handleScratchpadCommit}
      onEdit={handleEdit}
      onChangeLanguage={handleChangeLanguage}
      onImagePaste={handleImagePaste}
      onP2PSend={handleP2PSend}
    />
  </div>

  <!-- Footer -->
  <footer class="h-10 border-t border-white/5 bg-nb-side px-6 hidden md:flex items-center justify-between text-[10px] text-nb-muted shrink-0 safe-bottom">
    <div class="flex items-center gap-6">
      <div class="flex items-center gap-2">
        <kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded font-mono">⌘V</kbd>
        <span class="uppercase tracking-wider">Paste</span>
      </div>
      <div class="flex items-center gap-2">
        <kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded font-mono">j / k</kbd>
        <span class="uppercase tracking-wider">Navigate</span>
      </div>
      <div class="flex items-center gap-2">
        <kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded font-mono">p</kbd>
        <span class="uppercase tracking-wider">Pin</span>
      </div>
      <div class="flex items-center gap-2">
        <kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded font-mono">?</kbd>
        <span class="uppercase tracking-wider">Help</span>
      </div>
    </div>
    <div class="italic opacity-40">Local browser storage only</div>
  </footer>

  <Toast />
  <ShortcutOverlay />
  <ImageModal />
  <P2PModal onReceiveClip={handleReceiveClip} />
</div>
