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

<div id="scratchpad-card" class="bg-nb-card border border-nb-accent/20 rounded-xl overflow-hidden scratchpad-enter">
  <div class="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
    <div class="flex items-center gap-2.5">
      <span class="material-symbols-outlined text-nb-accent" style="font-size:14px">edit_note</span>
      <span class="text-[10px] font-bold uppercase tracking-widest text-nb-accent">Scratchpad</span>
      <span
        class="text-[10px] text-nb-muted transition-opacity duration-300"
        class:opacity-0={!statusVisible}
      >{status}</span>
    </div>
    <div class="flex items-center gap-2 md:gap-3">
      <button
        class="text-[10px] md:text-[11px] text-nb-muted hover:text-nb-accent transition-colors"
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
