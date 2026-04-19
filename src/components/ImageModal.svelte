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

{#if uiState.imageModal.open}
<div
  id="img-modal"
  class="fixed inset-0 bg-black/80 backdrop-blur-[8px] flex items-center justify-center z-50 cursor-zoom-out"
  role="dialog"
  aria-modal="true"
  aria-label="Image preview"
  onclick={(e) => { if (e.target === e.currentTarget) close(); }}
>
  <button
    class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-all duration-150"
    onclick={close}
    aria-label="Close image preview"
  >
    <svg viewBox="0 0 16 16" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </button>
  {#if uiState.imageModal.objectUrl}
    <img
      src={uiState.imageModal.objectUrl}
      alt="Full size clip image"
      class="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl drop-shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
      style="transform: scale(1); opacity: 1; transition: transform 0.2s ease-out, opacity 0.2s ease-out;"
    />
  {/if}
</div>
{/if}