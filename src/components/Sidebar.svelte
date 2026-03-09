<script>
  import { clipsState, computeVisibleClips } from '../state/clips.svelte.js';
  const visibleClips = $derived(computeVisibleClips());
  import { uiState } from '../state/ui.svelte.js';
  import SidebarItem from './SidebarItem.svelte';

  let { onSelect, storageUsed } = $props();

  const SOFT_LIMIT = 50 * 1024 * 1024;

  const storagePct  = $derived(Math.min(100, (storageUsed / SOFT_LIMIT) * 100));
  const storageBar  = $derived(`${storagePct.toFixed(0)}%`);
  const storageText = $derived(fmtBytes(storageUsed) + ' / ' + fmtBytes(SOFT_LIMIT));

  function fmtBytes(b) {
    if (!b) return '0 B';
    if (b < 1024)         return `${b} B`;
    if (b < 1024 * 1024)  return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  }

  function mobileSelect(id) {
    onSelect(id);
    uiState.mobileSidebarOpen = false;
  }
</script>

{#snippet sidebarContent(selectHandler)}
  {#if visibleClips.length > 0}
    <div id="sidebar-list" class="flex-1 overflow-y-auto p-3 space-y-1 min-h-0">
      {#each visibleClips as clip (clip.id)}
        <SidebarItem
          {clip}
          selected={clip.id === clipsState.selectedId}
          onSelect={selectHandler}
        />
      {/each}
    </div>
  {:else}
    <div id="sidebar-list" class="hidden"></div>
    <div id="sidebar-empty" class="flex-1 flex items-center justify-center p-6 text-center">
      <p class="text-xs text-nb-muted leading-relaxed">
        No clips yet.<br/>
        Press <kbd class="px-1 py-0.5 bg-nb-bg border border-white/10 rounded font-mono text-[10px]">⌘V</kbd> to paste.
      </p>
    </div>
  {/if}

  <div class="shrink-0 p-4 border-t border-white/5">
    <div class="flex justify-between text-[9px] uppercase font-bold tracking-widest text-nb-muted mb-2">
      <span>Storage</span>
      <span id="storage-pct">{storagePct.toFixed(0)}%</span>
    </div>
    <div class="h-0.5 w-full bg-white/5 rounded-full overflow-hidden">
      <div
        id="storage-bar"
        class="h-full rounded-full"
        style:width={storageBar}
        style:background-color={storagePct > 80 ? '#f59e0b' : '#c5b358'}
      ></div>
    </div>
    <p id="storage-text" class="text-[9px] text-white/20 mt-1.5 tracking-wide">{storageText}</p>
  </div>
{/snippet}

<!-- Desktop sidebar -->
<aside class="w-72 border-r border-white/5 bg-nb-side hidden md:flex flex-col overflow-hidden shrink-0">
  {@render sidebarContent(onSelect)}
</aside>

<!-- Mobile drawer -->
{#if uiState.mobileSidebarOpen}
  <div class="md:hidden">
    <div
      class="drawer-backdrop"
      onclick={() => uiState.mobileSidebarOpen = false}
      role="presentation"
    ></div>
    <div class="drawer-panel safe-top safe-bottom">
      <div class="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
        <h2 class="text-sm font-semibold text-nb-text tracking-wide">Clips</h2>
        <button
          class="flex items-center justify-center w-8 h-8 text-nb-muted hover:text-nb-text transition-colors"
          onclick={() => uiState.mobileSidebarOpen = false}
          title="Close sidebar"
        >
          <span class="material-symbols-outlined" style="font-size:18px">close</span>
        </button>
      </div>
      {@render sidebarContent(mobileSelect)}
    </div>
  </div>
{/if}
