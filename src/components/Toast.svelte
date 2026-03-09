<script>
  import { uiState } from '../state/ui.svelte.js';
</script>

<div
  id="toast"
  role="status"
  aria-live="polite"
  aria-atomic="true"
  class="toast fixed bottom-4 md:bottom-14 left-1/2 -translate-x-1/2 pointer-events-none
         bg-nb-card border text-nb-text text-xs rounded-lg px-4 py-2.5
         shadow-2xl whitespace-nowrap z-50"
  class:opacity-0={!uiState.toast.visible}
  class:show={uiState.toast.visible}
  style:border-color={
    uiState.toast.type === 'error' ? 'rgba(239,68,68,0.4)' :
    uiState.toast.type === 'warn'  ? 'rgba(197,179,88,0.4)' :
                                     'rgba(255,255,255,0.1)'
  }
>
  {uiState.toast.msg}
</div>
