/**
 * ui.svelte.js — shared reactive UI state
 */
export const uiState = $state({
  toast:            { msg: '', type: 'info', visible: false },
  overlayOpen:      false,
  imageModal:       { open: false, clip: null, objectUrl: null },
  p2pShare:         { open: false, mode: null, clip: null, code: null, peer: null },
  scratchpadActive: false,
  scratchpadInitChar: '',
  storageUsed:      0,
});
