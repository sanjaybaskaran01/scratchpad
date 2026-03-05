/**
 * ui.svelte.js — shared reactive UI state
 */
export const uiState = $state({
  toast:            { msg: '', type: 'info', visible: false },
  overlayOpen:      false,
  imageModal:       { open: false, clip: null, objectUrl: null },
  scratchpadActive: false,
  scratchpadInitChar: '',
  manualEntryActive: false,
  storageUsed:      0,
});
