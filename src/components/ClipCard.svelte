<script>
  import { untrack } from 'svelte';
  import { langLabel, decompressText, isURL, LANG_LABELS } from '../lib/clips.js';
  import { handleListContinuation } from '../lib/list-continuation.js';
  import { clipsState } from '../state/clips.svelte.js';
  import CodeBlock  from './CodeBlock.svelte';
  import TextBlock  from './TextBlock.svelte';
  import ImageBlock from './ImageBlock.svelte';

  let { clip, onCopy, onShare, onDownload, onPin, onDelete, onEdit, onChangeLanguage, onP2PSend } = $props();

  const rawText = $derived(clip.type === 'text' ? decompressText(clip) : null);
  const isLink  = $derived(clip.type === 'text' && isURL(rawText));

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60)    return 'just now';
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function fmtBytes(b) {
    if (!b) return '0 B';
    if (b < 1024)        return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  }

  const typeLabel = $derived(
    clip.type === 'image' ? 'Image'
    : isLink ? 'Link'
    : (clip.language ? langLabel(clip.language) : 'Plain Text')
  );

  const metaLine = $derived(
    clip.type === 'image'
      ? `${timeAgo(clip.createdAt)} · ${fmtBytes(clip.sizeBytes)}${clip.dimensions ? ` · ${clip.dimensions.w}×${clip.dimensions.h}` : ''}`
      : `${timeAgo(clip.createdAt)} · ${fmtBytes(clip.originalSizeBytes || clip.sizeBytes)}`
  );

  let copied = $state(false);

  async function handleCopy() {
    await onCopy(clip, rawText);
    copied = true;
    setTimeout(() => { copied = false; }, 1800);
  }

  // ── Edit mode ────────────────────────────────────────────────────────────────
  let editing    = $state(false);
  let editValue  = $state('');
  let editTaEl   = $state(null);

  const AUTOSAVE_DELAY = 2000;
  let autosaveTimer    = null;
  let autosaveStatus   = $state('');
  let autosaveVisible  = $state(false);
  let lastAutosavedText = '';
  let autosaveCount     = 0;
  let statusHideTimer  = null;

  function startEdit() {
    editValue = rawText || '';
    editing   = true;
    lastAutosavedText = editValue;
    autosaveCount = 0;
  }

  function handleContentClick(e) {
    if (window.getSelection()?.toString()) return;
    if (e.target.closest('a')) return;
    if (e.target.closest('button, select, input')) return;
    startEdit();
  }

  // Triggered externally (e.g. 'i' key shortcut from App)
  $effect(() => {
    if (clipsState.editingClipId === clip.id && !editing) {
      editValue = untrack(() => rawText || '');
      editing   = true;
      lastAutosavedText = editValue;
      autosaveCount = 0;
      clipsState.editingClipId = null;
    }
  });

  // Auto-focus edit textarea when edit mode opens
  $effect(() => {
    if (editing && editTaEl) {
      editTaEl.focus();
      untrack(() => {
        editTaEl.selectionStart = editTaEl.selectionEnd = editTaEl.value.length;
      });
    }
  });

  // Auto-resize textarea to fit content
  function resizeTextarea() {
    if (!editTaEl) return;
    editTaEl.style.height = 'auto';
    editTaEl.style.height = editTaEl.scrollHeight + 'px';
  }

  $effect(resizeTextarea);

  // Debounced auto-save
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    clearTimeout(statusHideTimer);
    autosaveStatus  = 'Saving…';
    autosaveVisible = true;
    autosaveTimer = setTimeout(async () => {
      if (onEdit) await onEdit(clip, editValue);
      lastAutosavedText = editValue;
      autosaveCount++;
      autosaveStatus = 'Saved';
      statusHideTimer = setTimeout(() => { autosaveVisible = false; }, 1200);
    }, AUTOSAVE_DELAY);
  }

  function cancelEdit() {
    clearTimeout(autosaveTimer);
    clearTimeout(statusHideTimer);
    const isDirty = editValue !== lastAutosavedText;
    if (isDirty && autosaveCount > 0) {
      editValue = lastAutosavedText;
      onEdit(clip, lastAutosavedText);
    }
    editing = false;
  }

  async function saveEdit() {
    clearTimeout(autosaveTimer);
    clearTimeout(statusHideTimer);
    if (onEdit) await onEdit(clip, editValue);
    editing = false;
  }

  function onEditKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(); return; }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); return; }
    handleListContinuation(e, editTaEl, () => editValue, v => { editValue = v; }, onEditInput);
  }

  function onEditInput() {
    resizeTextarea();
    scheduleAutosave();
  }

  // ── Language picker ───────────────────────────────────────────────────────────
  let pickingLang = $state(false);

  const LANG_OPTIONS = [
    ['', 'Plain Text'],
    ...Object.entries(LANG_LABELS).filter(([k]) => k !== 'plaintext'),
  ];

  function handleLangChange(e) {
    const newLang = e.target.value || null;
    pickingLang = false;
    if (onChangeLanguage) onChangeLanguage(clip, newLang);
  }

  // ── Copy feedback SVG state ────────────────────────────────────────────────
  const showCheck = $derived(copied);
</script>

<div id="clip-detail-{clip.id}" class="detail-card space-y-4" tabindex="0">
  <div class="flex flex-col md:flex-row md:items-start justify-between gap-2 md:gap-4">
    <div>
      <div class="flex items-center gap-2">
        <h2 class="text-xl font-light text-nb-text">{typeLabel} Clip</h2>
        {#if clip.type !== 'image'}
          <button
            class="icon-action"
            style="width:22px;height:22px"
            title="Change language"
            onclick={() => pickingLang = !pickingLang}
          >
            <span class="material-symbols-outlined" style="font-size:12px">translate</span>
          </button>
        {/if}
      </div>
      {#if pickingLang}
        <div class="mt-1.5 flex items-center gap-2">
          <select
            class="text-xs bg-nb-card border border-white/15 rounded px-2 py-1 text-nb-text outline-none focus:border-nb-accent/50"
            value={clip.language || ''}
            onchange={handleLangChange}
            onblur={() => setTimeout(() => { pickingLang = false; }, 150)}
          >
            {#each LANG_OPTIONS as [key, label]}
              <option value={key}>{label}</option>
            {/each}
          </select>
          <button class="text-[10px] text-nb-muted hover:text-nb-text" onclick={() => pickingLang = false}>cancel</button>
        </div>
      {/if}
      <p class="text-sm text-nb-muted mt-0.5">{metaLine}</p>
    </div>
    <div class="clip-actions flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0 pt-0 md:pt-1 overflow-x-auto">
      <button
        class="btn-copy flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-nb-card border rounded text-xs hover:bg-nb-accent/10 hover:border-nb-accent/30 transition-colors {copied ? 'copied-anim' : ''}"
        style={copied ? 'color: #c5b358; border-color: rgba(197,179,88,0.3)' : 'border-color: rgba(255,255,255,0.1)'}
        onclick={handleCopy}
      >
        {#if showCheck}
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 8.5L6.5 12L13 4" stroke="#c5b358" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="check-draw"/>
          </svg>
        {:else}
          <span class="material-symbols-outlined" style="font-size:14px">content_copy</span>
        {/if}
        <span class="hidden md:inline">{copied ? 'Copied!' : 'Copy'}</span>
      </button>
      {#if clip.type !== 'image'}
        <button
          class="icon-action"
          title="Edit  (e)"
          onclick={startEdit}
        >
          <span class="material-symbols-outlined" style="font-size:16px">edit</span>
        </button>
      {/if}
      <button
        class="icon-action"
        title="Send via P2P"
        onclick={() => onP2PSend(clip)}
      >
        <span class="material-symbols-outlined" style="font-size:16px">send</span>
      </button>
      <button
        class="icon-action"
        title="Share URL  (s)"
        onclick={() => onShare(clip, rawText)}
      >
        <span class="material-symbols-outlined" style="font-size:16px">link</span>
      </button>
      <button
        class="icon-action"
        title="Download  (d)"
        onclick={() => onDownload(clip, rawText)}
      >
        <span class="material-symbols-outlined" style="font-size:16px">download</span>
      </button>
      <button
        class="icon-action"
        class:text-nb-accent={clip.pinned}
        style={clip.pinned ? 'border-color: rgba(197,179,88,0.3)' : ''}
        title="Pin / unpin  (p)"
        onclick={() => onPin(clip)}
      >
        <span
          class="material-symbols-outlined {clip.pinned ? 'pin-shimmer' : ''}"
          style="font-size:16px;font-variation-settings:'FILL' {clip.pinned ? 1 : 0}"
        >{clip.pinned ? 'push_pin' : 'keep'}</span>
      </button>
      <button
        class="icon-action hover:!text-red-400 hover:!border-red-400/30"
        title="Delete  (x)"
        onclick={() => onDelete(clip)}
      >
        <span class="material-symbols-outlined" style="font-size:16px">delete</span>
      </button>
    </div>
  </div>

  {#if editing}
    <div class="scratchpad-edit-border rounded-xl overflow-hidden">
      <div class="px-4 py-2.5 border-b border-white/5 flex items-center justify-between bg-nb-card editing-glow rounded-t-xl">
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-bold uppercase tracking-widest text-nb-accent">Editing</span>
          <span
            class="text-[10px] text-nb-muted transition-opacity duration-300"
            class:opacity-0={!autosaveVisible}
          >{autosaveStatus}</span>
        </div>
        <div class="flex items-center gap-3">
          <button
            class="px-3 py-1 rounded text-[11px] bg-nb-accent/15 text-nb-accent hover:bg-nb-accent/25 transition-colors"
            onclick={saveEdit}
          >Save  ⌘↵</button>
          <button
            class="px-3 py-1 rounded text-[11px] text-nb-muted hover:text-red-400 transition-colors"
            onclick={cancelEdit}
          >Cancel  Esc</button>
        </div>
      </div>
      <div class="bg-nb-card">
        <textarea
          bind:this={editTaEl}
          bind:value={editValue}
          onkeydown={onEditKeyDown}
          oninput={onEditInput}
          class="w-full bg-transparent text-nb-text font-mono text-sm p-4 outline-none resize-none min-h-[80px] leading-relaxed"
          autocomplete="off"
          spellcheck="false"
        ></textarea>
      </div>
    </div>
  {:else if clip.type === 'image'}
    <ImageBlock {clip} />
  {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="clip-content-editable cursor-text" role="button" tabindex="-1" onclick={handleContentClick}>
      {#if isLink}
        <div class="bg-nb-card border border-white/5 rounded-xl overflow-hidden">
          <div class="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
            <span class="material-symbols-outlined text-nb-muted" style="font-size:14px">link</span>
            <span class="text-[10px] font-bold uppercase tracking-widest text-nb-muted">Link</span>
          </div>
          <div class="p-6">
            <a href={rawText.trim()} target="_blank" rel="noopener noreferrer"
               class="text-blue-400 hover:underline break-all text-sm">{rawText.trim()}</a>
          </div>
        </div>
      {:else if clip.language && clip.language !== 'markdown'}
        <CodeBlock {clip} {rawText} />
      {:else}
        <TextBlock {rawText} language={clip.language || ''} />
      {/if}
    </div>
  {/if}
</div>