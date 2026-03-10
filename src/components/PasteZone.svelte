<script>
  import { uiState } from '../state/ui.svelte.js';

  function openScratchpad() {
    uiState.scratchpadActive = true;
  }

  function openReceive() {
    uiState.p2pShare = { open: true, mode: 'receiver', clip: null, code: null, peer: null };
  }
</script>

<div id="paste-zone" class="max-w-3xl w-full mx-auto px-4 md:px-8 py-4">
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="bg-nb-card/50 border-2 border-dashed border-white/10 rounded-2xl py-12 md:py-20 flex flex-col items-center justify-center group hover:border-nb-accent/30 transition-colors cursor-pointer"
    onclick={openScratchpad}
  >
    <div class="paste-zone-pulse bg-nb-bg p-5 rounded-full mb-6">
      <span class="material-symbols-outlined text-nb-muted group-hover:text-nb-accent transition-colors" style="font-size:40px">edit_note</span>
    </div>
    <h3 class="text-lg font-light text-nb-text">Start typing, or paste anything</h3>
    <p class="text-xs text-nb-muted mt-2">Code, images, text — stored locally, never sent anywhere</p>
    <div class="hidden md:flex items-center gap-4 mt-5 text-nb-muted font-mono text-xs">
      <div class="flex items-center gap-2">
        <kbd class="px-2.5 py-1 bg-nb-bg border border-white/10 rounded text-[11px]">any key</kbd>
        <span class="text-white/30 font-sans not-italic">type</span>
      </div>
      <span class="text-white/20">·</span>
      <div class="flex items-center gap-2">
        <kbd class="px-2.5 py-1 bg-nb-bg border border-white/10 rounded">⌘</kbd>
        <span class="text-white/30">+</span>
        <kbd class="px-2.5 py-1 bg-nb-bg border border-white/10 rounded">V</kbd>
        <span class="text-white/30 font-sans not-italic">paste</span>
      </div>
      <span class="text-white/20">·</span>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="flex items-center gap-2 cursor-pointer hover:text-nb-accent transition-colors" onclick={(e) => { e.stopPropagation(); openReceive(); }}>
        <kbd class="px-2.5 py-1 bg-nb-bg border border-white/10 rounded">r</kbd>
        <span class="text-white/30 font-sans not-italic">receive P2P</span>
      </div>
    </div>
  </div>
</div>
