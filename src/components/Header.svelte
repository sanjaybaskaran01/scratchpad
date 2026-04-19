<script>
  import { clipsState } from '../state/clips.svelte.js';

  let { onNewClip, onReceive, onToggleSidebar, searchInputEl = $bindable() } = $props();

  const isSearching = $derived(clipsState.searchQuery.trim().length > 0);
</script>

<!-- Skip link for accessibility -->
<a href="#main-content" class="skip-link">Skip to content</a>

<header class="min-h-14 border-b border-white/8 bg-[rgba(20,20,20,0.85)] backdrop-blur-[12px] flex items-center justify-between px-2 sm:px-4 md:px-6 py-2 md:py-0 gap-2 shrink-0">
  <div class="flex items-center gap-2 sm:gap-3 md:gap-6 min-w-0 overflow-x-auto">
    <button
      class="md:hidden flex items-center justify-center w-8 h-8 shrink-0 text-nb-muted hover:text-nb-text transition-colors"
      onclick={onToggleSidebar}
      title="Toggle sidebar"
    >
      <span class="material-symbols-outlined" style="font-size:20px">menu</span>
    </button>
    <div class="logo-mark flex items-center gap-2 shrink-0 cursor-default" title={`v${__APP_VERSION__} (${__GIT_HASH__})`}>
      <div class="w-7 h-7 bg-nb-accent rounded-md flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="2" width="12" height="12" rx="2" stroke="#111" stroke-width="1.2"/>
          <line x1="5" y1="5.5" x2="11" y2="5.5" stroke="#111" stroke-width="1" stroke-linecap="round"/>
          <line x1="5" y1="8" x2="9" y2="8" stroke="#111" stroke-width="1" stroke-linecap="round"/>
          <line x1="5" y1="10.5" x2="7" y2="10.5" stroke="#111" stroke-width="1" stroke-linecap="round"/>
          <rect x="10.5" y="8.5" width="1.8" height="5" rx="0.6" fill="#111" opacity="0.9">
          </rect>
        </svg>
      </div>
      <h1 class="text-sm font-semibold tracking-[0.08em] uppercase hidden sm:block">Scratchpad</h1>
    </div>
    {#if isSearching}
      <div class="flex items-center gap-1.5 text-xs text-nb-muted shrink-0">
        <span class="material-symbols-outlined" style="font-size:12px">filter_list</span>
        <span class="italic">Filtered by search</span>
        <button
          class="ml-1 text-nb-accent hover:underline text-[10px] uppercase tracking-wide"
          onclick={() => clipsState.searchQuery = ''}
        >Clear</button>
      </div>
    {:else}
      <nav class="flex items-center gap-0.5 text-[11px] md:text-xs font-medium shrink-0" role="tablist">
        {#each ['all', 'code', 'image', 'text', 'link'] as filter}
          <button
            role="tab"
            aria-selected={clipsState.activeFilter === filter}
            data-filter={filter}
            class="filter-tab px-1.5 sm:px-2.5 md:px-3 py-1 {clipsState.activeFilter === filter ? 'active-tab' : ''}"
            onclick={() => clipsState.activeFilter = filter}
          >
            {filter === 'all' ? 'All' : filter === 'link' ? 'Links' : filter.charAt(0).toUpperCase() + filter.slice(1) + (filter === 'image' ? 's' : '')}
          </button>
        {/each}
      </nav>
    {/if}
  </div>
  <div class="flex items-center gap-2 sm:gap-3 shrink-0">
    <div class="relative search-glow rounded-full">
      <span
        class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 select-none transition-colors"
        class:text-nb-accent={isSearching}
        class:text-nb-muted={!isSearching}
        style="font-size:16px"
      >search</span>
      <input
        id="search-input"
        bind:this={searchInputEl}
        type="search"
        class="bg-nb-bg border rounded-full pl-9 py-1.5 text-xs w-28 sm:w-36 md:w-56 outline-none focus:ring-1 focus:ring-nb-accent/40 focus:border-nb-accent/40 transition-all placeholder:text-white/20
          {isSearching ? 'border-nb-accent text-nb-accent pr-8' : 'border-white/5 pr-4'}"
        placeholder="Search  ⌘K"
        autocomplete="off"
        spellcheck="false"
        bind:value={clipsState.searchQuery}
      />
      {#if isSearching}
        <button
          class="absolute right-2.5 top-1/2 -translate-y-1/2 text-nb-muted hover:text-nb-text transition-colors"
          onclick={() => clipsState.searchQuery = ''}
          title="Clear search (Esc)"
        >
          <span class="material-symbols-outlined" style="font-size:14px">close</span>
        </button>
      {/if}
    </div>
    <button
      class="btn-shimmer flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-nb-accent/10 border border-nb-accent/20 rounded text-xs text-nb-accent hover:bg-nb-accent/20 transition-colors"
      title="Receive a clip via P2P (r)"
      onclick={onReceive}
    >
      <span class="material-symbols-outlined" style="font-size:14px">swap_horiz</span>
      <span class="hidden sm:inline">Receive</span>
    </button>
    <button
      class="btn-shimmer flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-nb-accent/10 border border-nb-accent/20 rounded text-xs text-nb-accent hover:bg-nb-accent/20 transition-colors"
      title="New empty clip (n)"
      onclick={onNewClip}
    >
      <span class="material-symbols-outlined" style="font-size:14px">add</span>
      <span class="hidden md:inline">New</span>
    </button>
  </div>
</header>