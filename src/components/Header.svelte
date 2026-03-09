<script>
  import { clipsState } from '../state/clips.svelte.js';

  let { onNewClip, onReceive, onToggleSidebar, searchInputEl = $bindable() } = $props();

  const isSearching = $derived(clipsState.searchQuery.trim().length > 0);
</script>

<header class="min-h-14 border-b border-white/8 bg-[rgba(20,20,20,0.85)] backdrop-blur-[12px] flex items-center justify-between px-2 sm:px-4 md:px-6 py-2 md:py-0 gap-2 shrink-0">
  <div class="flex items-center gap-2 sm:gap-3 md:gap-6 min-w-0 overflow-x-auto">
    <button
      class="md:hidden flex items-center justify-center w-8 h-8 shrink-0 text-nb-muted hover:text-nb-text transition-colors"
      onclick={onToggleSidebar}
      title="Toggle sidebar"
    >
      <span class="material-symbols-outlined" style="font-size:20px">menu</span>
    </button>
    <div class="flex items-center gap-2 shrink-0">
      <div class="w-7 h-7 bg-nb-accent rounded-md flex items-center justify-center">
        <span class="material-symbols-outlined text-[#111]" style="font-size:14px">edit_note</span>
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
      <nav class="flex items-center gap-1 text-[11px] md:text-xs font-medium text-nb-muted shrink-0" role="tablist">
        {#each ['all', 'code', 'image', 'text'] as filter}
          <button
            role="tab"
            aria-selected={clipsState.activeFilter === filter}
            data-filter={filter}
            class="filter-tab px-1.5 sm:px-2 md:px-3 py-1 transition-colors hover:text-nb-text"
            class:active-tab={clipsState.activeFilter === filter}
            onclick={() => clipsState.activeFilter = filter}
          >
            {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1) + (filter === 'image' ? 's' : '')}
          </button>
        {/each}
      </nav>
    {/if}
  </div>
  <div class="flex items-center gap-2 sm:gap-3 shrink-0">
    <div class="relative">
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
      class="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-nb-card border border-white/10 rounded text-xs text-nb-muted hover:text-nb-text hover:border-white/20 transition-colors"
      title="Receive a clip via P2P"
      onclick={onReceive}
    >
      <span class="material-symbols-outlined" style="font-size:14px">download_for_offline</span>
      <span class="hidden md:inline">Receive</span>
    </button>
    <button
      class="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-nb-accent/10 border border-nb-accent/20 rounded text-xs text-nb-accent hover:bg-nb-accent/20 transition-colors"
      title="New empty clip (n)"
      onclick={onNewClip}
    >
      <span class="material-symbols-outlined" style="font-size:14px">add</span>
      <span class="hidden md:inline">New</span>
    </button>
  </div>
</header>
