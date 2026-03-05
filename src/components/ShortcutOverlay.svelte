<script>
  import { uiState } from '../state/ui.svelte.js';
</script>

<div
  id="shortcut-overlay"
  class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 transition-opacity duration-150"
  class:opacity-0={!uiState.overlayOpen}
  class:pointer-events-none={!uiState.overlayOpen}
  role="dialog"
  aria-modal="true"
  aria-label="Keyboard shortcuts"
  onclick={(e) => { if (e.target === e.currentTarget) uiState.overlayOpen = false; }}
>
  <div class="shortcut-panel bg-nb-card border border-white/10 rounded-xl shadow-2xl w-full max-w-sm p-6">
    <div class="flex items-center justify-between mb-5">
      <h3 class="text-sm font-semibold">Keyboard shortcuts</h3>
      <button
        class="text-nb-muted hover:text-nb-text transition-colors"
        onclick={() => uiState.overlayOpen = false}
      >
        <span class="material-symbols-outlined" style="font-size:18px">close</span>
      </button>
    </div>
    <table class="w-full text-xs">
      <tbody class="divide-y divide-white/5">
        <tr><td class="py-2 font-mono text-nb-text pr-4 whitespace-nowrap"><kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded">⌘V</kbd></td><td class="py-2 text-nb-muted">Paste new clip (anywhere on page)</td></tr>
        <tr><td class="py-2 font-mono text-nb-text pr-4 whitespace-nowrap"><em class="not-italic text-white/40">any key</em></td><td class="py-2 text-nb-muted">Open scratchpad — start typing</td></tr>
        <tr><td class="py-2 font-mono text-nb-text pr-4 whitespace-nowrap"><kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded">n</kbd></td><td class="py-2 text-nb-muted">New empty clip</td></tr>
        <tr><td class="py-2 font-mono text-nb-text pr-4 whitespace-nowrap"><kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded">j</kbd> / <kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded">k</kbd></td><td class="py-2 text-nb-muted">Navigate sidebar up / down</td></tr>
        <tr><td class="py-2 font-mono text-nb-text pr-4 whitespace-nowrap"><kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded">c</kbd></td><td class="py-2 text-nb-muted">Copy focused clip</td></tr>
        <tr><td class="py-2 font-mono text-nb-text pr-4 whitespace-nowrap"><kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded">p</kbd></td><td class="py-2 text-nb-muted">Pin / unpin focused clip</td></tr>
        <tr><td class="py-2 font-mono text-nb-text pr-4 whitespace-nowrap"><kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded">s</kbd></td><td class="py-2 text-nb-muted">Copy share URL for focused clip</td></tr>
        <tr><td class="py-2 font-mono text-nb-text pr-4 whitespace-nowrap"><kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded">i</kbd></td><td class="py-2 text-nb-muted">Edit focused clip inline</td></tr>
        <tr><td class="py-2 font-mono text-nb-text pr-4 whitespace-nowrap"><kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded">x</kbd></td><td class="py-2 text-nb-muted">Delete focused clip</td></tr>
        <tr><td class="py-2 font-mono text-nb-text pr-4 whitespace-nowrap"><kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded">z</kbd></td><td class="py-2 text-nb-muted">Undo last deletion (5 s window)</td></tr>
        <tr><td class="py-2 font-mono text-nb-text pr-4 whitespace-nowrap"><kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded">/</kbd> or <kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded">⌘K</kbd></td><td class="py-2 text-nb-muted">Focus search</td></tr>
        <tr><td class="py-2 font-mono text-nb-text pr-4 whitespace-nowrap"><kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded">?</kbd></td><td class="py-2 text-nb-muted">Toggle this overlay</td></tr>
        <tr><td class="py-2 font-mono text-nb-text pr-4 whitespace-nowrap"><kbd class="px-1.5 py-0.5 bg-nb-bg border border-white/10 rounded">Esc</kbd></td><td class="py-2 text-nb-muted">Clear search / close overlay / dismiss scratchpad</td></tr>
      </tbody>
    </table>
  </div>
</div>
