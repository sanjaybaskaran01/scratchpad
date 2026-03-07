<script>
  import { computeVisibleClips } from '../state/clips.svelte.js';
  const visibleClips = $derived(computeVisibleClips());
  import { uiState }      from '../state/ui.svelte.js';
  import ClipCard      from './ClipCard.svelte';
  import PasteZone     from './PasteZone.svelte';
  import Scratchpad    from './Scratchpad.svelte';

  let { onCopy, onShare, onDownload, onPin, onDelete, onScratchpadCommit, onEdit, onChangeLanguage, onImagePaste, onP2PSend } = $props();

  const showFeed = $derived(
    visibleClips.length > 0 || uiState.scratchpadActive
  );
</script>

<main id="main-content" class="flex-1 overflow-y-auto bg-nb-bg">
  {#if !showFeed}
    <PasteZone />
  {:else}
    <div id="clip-feed" class="max-w-3xl w-full mx-auto px-8 py-8 space-y-8">
      {#if uiState.scratchpadActive}
        <Scratchpad onCommit={onScratchpadCommit} {onImagePaste} />
      {/if}
      {#each visibleClips as clip, i (clip.id)}
        <ClipCard
          {clip}
          {onCopy}
          {onShare}
          {onDownload}
          {onPin}
          {onDelete}
          {onEdit}
          {onChangeLanguage}
          {onP2PSend}
        />
      {/each}
    </div>
  {/if}

  <!-- Always render clip-feed div (hidden) so it exists for E2E selectors -->
  {#if !showFeed}
    <div id="clip-feed" class="hidden"></div>
  {/if}
</main>
