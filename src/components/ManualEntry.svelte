<script>
  import { uiState } from '../state/ui.svelte.js';

  let { onSave } = $props();

  let value = $state('');

  function save() {
    const text = value.trim();
    if (!text) return;
    uiState.manualEntryActive = false;
    value = '';
    onSave(text);
  }

  function cancel() {
    uiState.manualEntryActive = false;
    value = '';
  }

  function onKeyDown(e) {
    if (e.key === 'Escape')                         { e.stopPropagation(); cancel(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
  }
</script>

<div id="manual-entry-card" class="bg-nb-card border border-white/10 rounded-xl overflow-hidden clip-enter">
  <!-- svelte-ignore a11y_autofocus -->
  <textarea
    id="manual-ta"
    bind:value
    onkeydown={onKeyDown}
    autofocus
    class="w-full bg-transparent text-nb-text text-sm font-mono p-4 outline-none resize-none leading-relaxed min-h-[140px] placeholder:text-white/20"
    placeholder="Type or paste content here… (⌘↵ to save, Esc to cancel)"
    rows="6"
    autocomplete="off"
    spellcheck="false"
  ></textarea>
  <div class="px-4 py-2.5 border-t border-white/5 flex items-center gap-2">
    <button
      class="px-3 py-1.5 bg-nb-accent text-nb-side text-xs font-semibold rounded hover:bg-nb-accent/90 transition-colors"
      onclick={save}
    >Save clip</button>
    <button
      class="px-3 py-1.5 text-nb-muted text-xs hover:text-nb-text transition-colors"
      onclick={cancel}
    >Cancel</button>
  </div>
</div>
