<script>
  import { untrack } from 'svelte';
  import { uiState } from '../state/ui.svelte.js';
  import { handleListContinuation } from '../lib/list-continuation.js';

  let { onCommit, onImagePaste } = $props();

  let value   = $state('');
  let status  = $state('');
  let statusVisible = $state(false);
  let timer   = null;
  let taEl    = $state(null);

  const SP_SAVE_DELAY = 600;

  // When the scratchpad activates, pre-populate with the trigger char and focus.
  // Cursor positioning wrapped in untrack so typing doesn't re-trigger this effect.
  $effect(() => {
    if (uiState.scratchpadActive && taEl) {
      const ch = uiState.scratchpadInitChar;
      untrack(() => { uiState.scratchpadInitChar = ''; });
      if (ch) value = ch;
      taEl.focus();
      untrack(() => {
        taEl.selectionStart = taEl.selectionEnd = value.length;
      });
    }
  });

  function onInput() {
    clearTimeout(timer);
    status        = 'Saving…';
    statusVisible = true;
    timer = setTimeout(async () => {
      await onCommit(value, 'save-draft');
      status        = 'Saved';
      setTimeout(() => { statusVisible = false; }, 1200);
    }, SP_SAVE_DELAY);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      discard();
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.stopPropagation();
      commit();
      return;
    }
    handleListContinuation(e, taEl, () => value, v => { value = v; }, onInput);
  }

  function onPaste(e) {
    const cd = e.clipboardData;
    if (!cd) return;
    for (const item of Array.from(cd.items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob && onImagePaste) onImagePaste(blob);
        return;
      }
    }
  }

  function commit() {
    clearTimeout(timer);
    onCommit(value, 'commit');
    value = '';
    uiState.scratchpadActive = false;
  }

  function discard() {
    clearTimeout(timer);
    onCommit(value, 'discard');
    value = '';
    uiState.scratchpadActive = false;
  }
</script>

<div id="scratchpad-card" class="bg-nb-card rounded-xl overflow-hidden scratchpad-enter relative" style="border-left: 2px solid #c5b358;">
  <div class="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
    <div class="flex items-center gap-2.5">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg" class="shrink-0">
        <rect x="2" y="2" width="12" height="12" rx="2" stroke="#c5b358" stroke-width="1.3"/>
        <line x1="5" y1="5.5" x2="11" y2="5.5" stroke="#c5b358" stroke-width="0.9" stroke-linecap="round"/>
        <line x1="5" y1="8" x2="9" y2="8" stroke="#c5b358" stroke-width="0.9" stroke-linecap="round"/>
        <line x1="5" y1="10.5" x2="7" y2="10.5" stroke="#c5b358" stroke-width="0.9" stroke-linecap="round"/>
      </svg>
      <span class="text-[10px] font-bold uppercase tracking-widest text-nb-accent">Scratchpad</span>
      {#if statusVisible}
        <span class="text-[10px] text-nb-muted transition-opacity duration-300">
          {#if status === 'Saving…'}
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg" class="inline-block mr-0.5 spin-arc" style="vertical-align: -1px;">
              <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5" stroke-dasharray="12 28" stroke-linecap="round"/>
            </svg>
          {:else}
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg" class="inline-block mr-0.5" style="vertical-align: -1px; color: #c5b358">
              <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="check-draw"/>
            </svg>
          {/if}
          {status}
        </span>
      {/if}
    </div>
    <div class="flex items-center gap-2 md:gap-3">
      <button
        class="px-3 py-1 rounded text-[10px] md:text-[11px] bg-nb-accent/15 text-nb-accent hover:bg-nb-accent/25 transition-colors"
        onclick={commit}
      >Save as clip  ↵</button>
      <button
        class="text-[10px] md:text-[11px] text-nb-muted hover:text-red-400 transition-colors"
        onclick={discard}
      >Discard  Esc</button>
    </div>
  </div>
  <textarea
    id="scratchpad-ta"
    bind:this={taEl}
    bind:value
    oninput={onInput}
    onkeydown={onKeyDown}
    onpaste={onPaste}
    class="w-full bg-transparent text-nb-text font-mono text-sm p-4 outline-none resize-none min-h-[100px] md:min-h-[130px] leading-relaxed placeholder:text-white/20"
    placeholder="Start typing… auto-saves every keystroke  ·  Paste images to save them directly"
    autocomplete="off"
    spellcheck="false"
  ></textarea>
</div>