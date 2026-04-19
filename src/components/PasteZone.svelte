<script>
  import { uiState } from '../state/ui.svelte.js';

  let { isDragging = false } = $props();

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
    class="paste-zone-hover border-2 border-dashed rounded-2xl py-12 md:py-20 flex flex-col items-center justify-center group cursor-pointer {isDragging ? 'bg-nb-accent/5 border-nb-accent/60 scale-[1.01]' : 'bg-nb-card/50 border-white/10 hover:border-nb-accent/30'}"
    onclick={openScratchpad}
  >
    <div class="mb-6">
      {#if isDragging}
        <svg viewBox="0 0 48 48" width="56" height="56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="10" width="36" height="30" rx="3" stroke="#c5b358" stroke-width="2"/>
          <path d="M24 20v10M19 25h10" stroke="#c5b358" stroke-width="2" stroke-linecap="round"/>
          <path d="M14 4l-4 6h8l-4-6z" fill="none" stroke="#c5b358" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
      {:else}
        <svg viewBox="0 0 48 48" width="56" height="56" fill="none" xmlns="http://www.w3.org/2000/svg" class="opacity-50 group-hover:opacity-80 transition-opacity duration-300">
          <rect x="6" y="8" width="36" height="32" rx="3" stroke="currentColor" stroke-width="1.5" class="text-nb-muted"/>
          <line x1="13" y1="16" x2="30" y2="16" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" class="text-nb-muted"/>
          <line x1="13" y1="21" x2="25" y2="21" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" class="text-nb-muted"/>
          <line x1="13" y1="26" x2="20" y2="26" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" class="text-nb-muted"/>
          <rect x="30" y="24" width="3" height="10" rx="1" fill="#c5b358" opacity="0.7"/>
        </svg>
      {/if}
    </div>
    {#if isDragging}
      <h3 class="text-lg font-light text-nb-accent">Drop to capture</h3>
      <p class="text-xs text-nb-muted mt-2">Images and text files supported</p>
    {:else}
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
    {/if}
  </div>
</div>