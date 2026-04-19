<script>
  import { uiState } from '../state/ui.svelte.js';

  let lastType = $state('info');
  let lastMsg  = $state('');
  let exiting  = $state(false);
  let exitTimer = null;

  $effect(() => {
    if (uiState.toast.visible && uiState.toast.msg !== lastMsg) {
      lastMsg = uiState.toast.msg;
      lastType = uiState.toast.type;
      exiting = false;
      clearTimeout(exitTimer);
    } else if (!uiState.toast.visible && lastMsg) {
      exiting = true;
      clearTimeout(exitTimer);
      exitTimer = setTimeout(() => { exiting = false; }, 200);
    }
  });

  const borderColor = $derived(
    lastType === 'error' ? 'rgba(239,68,68,0.4)' :
    lastType === 'warn'  ? 'rgba(197,179,88,0.4)' :
                           'rgba(255,255,255,0.1)'
  );

  const iconName = $derived(
    lastType === 'error' ? 'error' :
    lastType === 'warn'  ? 'warning' :
    lastType === 'info'  ? 'info' : 'check_circle'
  );
</script>

{#if uiState.toast.visible || exiting}
<div
  id="toast"
  role="status"
  aria-live="polite"
  aria-atomic="true"
  class="fixed bottom-4 md:bottom-14 left-1/2 -translate-x-1/2 pointer-events-none z-50
         border text-nb-text text-xs rounded-lg px-4 py-2.5 min-w-[180px] max-w-[90vw]
         shadow-2xl whitespace-nowrap flex items-center gap-2
         {exiting ? 'toast-exit' : ''}"
  style:border-color={borderColor}
>
  {#if lastType === 'error'}
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg" class="shrink-0" style="color: #ef4444">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/>
      <line x1="8" y1="4.5" x2="8" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="8" cy="11" r="0.8" fill="currentColor"/>
    </svg>
  {:else if lastType === 'warn'}
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg" class="shrink-0" style="color: #c5b358">
      <path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
      <line x1="8" y1="6.5" x2="8" y2="9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <circle cx="8" cy="11.5" r="0.7" fill="currentColor"/>
    </svg>
  {:else}
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg" class="shrink-0" style="color: #c5b358">
      <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="check-draw"/>
    </svg>
  {/if}
  <span>{uiState.toast.msg}</span>
</div>
{/if}