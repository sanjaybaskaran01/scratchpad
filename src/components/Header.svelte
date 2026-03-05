<script>
  import { clipsState } from '../state/clips.svelte.js';

  let { onNewClip, searchInputEl = $bindable() } = $props();

  const isSearching = $derived(clipsState.searchQuery.trim().length > 0);
</script>

<header class="h-14 border-b border-white/5 bg-nb-side flex items-center justify-between px-6 shrink-0">
  <div class="flex items-center gap-6">
    <div class="flex items-center gap-2">
      <span class="material-symbols-outlined text-nb-accent" style="font-size:20px">edit_note</span>
      <h1 class="text-sm font-medium tracking-wide uppercase">Scratchpad</h1>
    </div>
    {#if isSearching}
      <div class="flex items-center gap-1.5 text-xs text-nb-muted">
        <span class="material-symbols-outlined" style="font-size:12px">filter_list</span>
        <span class="italic">Filtered by search</span>
        <button
          class="ml-1 text-nb-accent hover:underline text-[10px] uppercase tracking-wide"
          onclick={() => clipsState.searchQuery = ''}
        >Clear</button>
      </div>
    {:else}
      <nav class="flex items-center gap-1 text-xs font-medium text-nb-muted" role="tablist">
        {#each ['all', 'code', 'image', 'text'] as filter}
          <button
            role="tab"
            aria-selected={clipsState.activeFilter === filter}
            data-filter={filter}
            class="filter-tab px-3 py-1 transition-colors hover:text-nb-text"
            class:active-tab={clipsState.activeFilter === filter}
            onclick={() => clipsState.activeFilter = filter}
          >
            {filter === 'all' ? 'All Clips' : filter.charAt(0).toUpperCase() + filter.slice(1) + (filter === 'image' ? 's' : '')}
          </button>
        {/each}
      </nav>
    {/if}
  </div>
  <div class="flex items-center gap-3">
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
        class="bg-nb-bg border rounded-full pl-9 py-1.5 text-xs w-56 outline-none focus:ring-1 focus:ring-nb-accent/40 focus:border-nb-accent/40 transition-all placeholder:text-white/20
          {isSearching ? 'border-nb-accent text-nb-accent pr-8' : 'border-white/5 pr-4'}"
        placeholder="Search clips  ⌘K"
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
      class="flex items-center gap-1.5 px-3 py-1.5 bg-nb-accent/10 border border-nb-accent/20 rounded text-xs text-nb-accent hover:bg-nb-accent/20 transition-colors"
      title="New empty clip (n)"
      onclick={onNewClip}
    >
      <span class="material-symbols-outlined" style="font-size:14px">add</span>
      New
    </button>
  </div>
</header>
