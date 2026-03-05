<script>
  import { uiState } from '../state/ui.svelte.js';

  function close() {
    uiState.imageModal.open = false;
    if (uiState.imageModal.objectUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(uiState.imageModal.objectUrl);
    }
    uiState.imageModal.objectUrl = null;
    uiState.imageModal.clip = null;
  }
</script>

<div
  id="img-modal"
  class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 transition-opacity duration-150 cursor-zoom-out"
  class:opacity-0={!uiState.imageModal.open}
  class:pointer-events-none={!uiState.imageModal.open}
  class:modal-visible={uiState.imageModal.open}
  onclick={(e) => { if (e.target === e.currentTarget) close(); }}
>
  <button
    class="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
    onclick={close}
  >
    <span class="material-symbols-outlined" style="font-size:24px">close</span>
  </button>
  {#if uiState.imageModal.objectUrl}
    <img
      src={uiState.imageModal.objectUrl}
      alt="Full size clip image"
      class="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
    />
  {/if}
</div>
