<script>
  import { getBlob } from '../lib/storage.js';
  import { uiState } from '../state/ui.svelte.js';

  let { clip } = $props();

  let objectUrl = $state(null);

  $effect(() => {
    let url = null;
    if (clip.blobId) {
      getBlob(clip.blobId).then(blob => {
        if (blob) {
          url = URL.createObjectURL(blob);
          objectUrl = url;
        }
      });
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  });

  function fmtBytes(b) {
    if (!b) return '0 B';
    if (b < 1024)        return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  }

  const savings = $derived(
    clip.originalSizeBytes && clip.originalSizeBytes > clip.sizeBytes
      ? `Optimized ${fmtBytes(clip.originalSizeBytes)} → ${fmtBytes(clip.sizeBytes)}`
      : null
  );

  function openModal() {
    if (!objectUrl) return;
    // Create a fresh object URL for the modal (separate lifecycle)
    getBlob(clip.blobId).then(blob => {
      if (!blob) return;
      uiState.imageModal.clip      = clip;
      uiState.imageModal.objectUrl = URL.createObjectURL(blob);
      uiState.imageModal.open      = true;
    });
  }
</script>

<div class="bg-nb-card border border-white/5 rounded-xl overflow-hidden">
  <div class="px-4 py-3 border-b border-white/5 flex items-center justify-between">
    <span class="text-xs font-medium text-nb-muted">{clip.label || 'pasted-image'}</span>
    {#if savings}
      <span class="text-[10px] text-nb-muted/60">{savings}</span>
    {/if}
  </div>
  <div class="p-4 bg-black/20 flex justify-center">
    {#if objectUrl}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <img
        src={objectUrl}
        alt="pasted image"
        class="clip-img-thumb max-h-80 object-contain rounded-lg shadow-lg cursor-zoom-in img-fade-in"
        onclick={openModal}
      />
    {:else}
      <div class="h-40 w-full flex items-center justify-center text-nb-muted/40 text-xs">Loading…</div>
    {/if}
  </div>
</div>
