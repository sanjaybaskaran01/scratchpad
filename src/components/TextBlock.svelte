<script>
  let { rawText } = $props();

  const lines  = $derived((rawText || '').split('\n'));
  const isLong = $derived(lines.length > 30);
  const shown  = $derived(isLong ? lines.slice(0, 30).join('\n') : (rawText || ''));

  let expanded = $state(false);
</script>

<div class="bg-nb-card border border-white/5 rounded-xl overflow-hidden">
  <div class="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="material-symbols-outlined text-nb-muted" style="font-size:14px">notes</span>
      <span class="text-[10px] font-bold uppercase tracking-widest text-nb-muted">Plain Text</span>
    </div>
    <span class="text-[10px] text-nb-muted">{lines.length} lines</span>
  </div>
  <div class="p-6">
    <p class="clip-text-body text-base font-light leading-relaxed text-nb-text whitespace-pre-wrap break-words">
      {expanded ? (rawText || '') : shown}
    </p>
    {#if isLong}
      <button
        class="mt-4 text-xs text-nb-accent hover:underline"
        onclick={() => expanded = !expanded}
      >
        {expanded ? 'Show less' : `+ ${lines.length - 30} more lines`}
      </button>
    {/if}
  </div>
</div>
