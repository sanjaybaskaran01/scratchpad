<script>
  import { untrack } from 'svelte';
  import { langLabel, decompressText, LANG_LABELS } from '../lib/clips.js';
  import { clipsState } from '../state/clips.svelte.js';
  import CodeBlock  from './CodeBlock.svelte';
  import TextBlock  from './TextBlock.svelte';
  import ImageBlock from './ImageBlock.svelte';

  let { clip, onCopy, onShare, onDownload, onPin, onDelete, onEdit, onChangeLanguage, onP2PSend } = $props();

  const rawText = $derived(clip.type === 'text' ? decompressText(clip) : null);

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
    clip.type === 'image' ? 'Image' : (clip.language ? langLabel(clip.language) : 'Plain Text')
  );

  const metaLine = $derived(
    clip.type === 'image'
      ? `${timeAgo(clip.createdAt)} · ${fmtBytes(clip.sizeBytes)}${clip.dimensions ? ` · ${clip.dimensions.w}×${clip.dimensions.h}` : ''}`
      : `${timeAgo(clip.createdAt)} · ${fmtBytes(clip.originalSizeBytes || clip.sizeBytes)}`
  );

  let copyBtnEl = $state(null);

  function flashCopyBtn() {
    if (!copyBtnEl) return;
    copyBtnEl.classList.add('copied-anim');
    copyBtnEl.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">check</span>Copied!';
    copyBtnEl.style.color = '#c5b358';
    copyBtnEl.style.borderColor = 'rgba(197,179,88,0.3)';
    setTimeout(() => {
      if (!copyBtnEl) return;
      copyBtnEl.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">content_copy</span>Copy';
      copyBtnEl.style.color = '';
      copyBtnEl.style.borderColor = '';
      copyBtnEl.classList.remove('copied-anim');
    }, 1800);
  }

  async function handleCopy() {
    await onCopy(clip, rawText);
    flashCopyBtn();
  }

  // ── Edit mode ────────────────────────────────────────────────────────────────
  let editing    = $state(false);
  let editValue  = $state('');
  let editTaEl   = $state(null);

  function startEdit() {
    editValue = rawText || '';
    editing   = true;
  }

  // Triggered externally (e.g. 'i' key shortcut from App)
  $effect(() => {
    if (clipsState.editingClipId === clip.id && !editing) {
      editValue = untrack(() => rawText || '');
      editing   = true;
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

  function cancelEdit() {
    editing = false;
  }

  async function saveEdit() {
    if (onEdit) await onEdit(clip, editValue);
    editing = false;
  }

  function onEditKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
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
</script>

<div id="clip-detail-{clip.id}" class="detail-card space-y-4" tabindex="0">
  <div class="flex items-start justify-between gap-4">
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
    <div class="flex items-center gap-2 shrink-0 pt-1">
      <button
        bind:this={copyBtnEl}
        class="btn-copy flex items-center gap-1.5 px-3 py-1.5 bg-nb-card border border-white/10 rounded text-xs hover:bg-nb-accent/10 hover:border-nb-accent/30 transition-colors"
        onclick={handleCopy}
      >
        <span class="material-symbols-outlined" style="font-size:14px">content_copy</span>Copy
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
      {#if clip.type !== 'image'}
        <button
          class="icon-action"
          title="Send via P2P"
          onclick={() => onP2PSend(clip)}
        >
          <span class="material-symbols-outlined" style="font-size:16px">send</span>
        </button>
      {/if}
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
          class="material-symbols-outlined"
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
    <div class="bg-nb-card border border-nb-accent/20 rounded-xl overflow-hidden">
      <div class="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-widest text-nb-accent">Editing</span>
        <div class="flex items-center gap-3">
          <button
            class="text-[11px] text-nb-muted hover:text-nb-accent transition-colors"
            onclick={saveEdit}
          >Save  ⌘↵</button>
          <button
            class="text-[11px] text-nb-muted hover:text-red-400 transition-colors"
            onclick={cancelEdit}
          >Cancel  Esc</button>
        </div>
      </div>
      <textarea
        bind:this={editTaEl}
        bind:value={editValue}
        onkeydown={onEditKeyDown}
        class="w-full bg-transparent text-nb-text font-mono text-sm p-4 outline-none resize-none min-h-[200px] leading-relaxed"
        autocomplete="off"
        spellcheck="false"
      ></textarea>
    </div>
  {:else if clip.type === 'image'}
    <ImageBlock {clip} />
  {:else if clip.language}
    <CodeBlock {clip} {rawText} />
  {:else}
    <TextBlock {rawText} />
  {/if}
</div>
