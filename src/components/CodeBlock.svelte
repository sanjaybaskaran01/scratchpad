<script>
  import { highlightSnippet } from '../lib/highlight.js';
  import { langLabel } from '../lib/clips.js';

  let { clip, rawText } = $props();

  const lines     = $derived((rawText || '').split('\n'));
  const isLong    = $derived(lines.length > 30);
  const shownText = $derived(isLong ? lines.slice(0, 30).join('\n') : (rawText || ''));

  const highlighted = $derived(highlightSnippet(shownText, clip.language));
  const label       = $derived(langLabel(clip.language));

  let expanded = $state(false);
  const fullHighlighted = $derived(expanded ? highlightSnippet(rawText || '', clip.language) : null);
</script>

<div class="bg-nb-card border border-white/5 rounded-xl overflow-hidden">
  <div class="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
    <span class="text-[10px] font-bold uppercase tracking-widest text-nb-accent">{label}</span>
    {#if clip.lineCount}
      <span class="text-[10px] text-nb-muted">{clip.lineCount} lines</span>
    {/if}
  </div>
  <pre class="hljs-pre p-5 text-sm font-mono leading-relaxed overflow-x-auto m-0 bg-transparent"
       class:max-h-96={isLong && !expanded}
       class:overflow-y-hidden={isLong && !expanded}
  ><code class="hljs">{@html expanded && fullHighlighted ? fullHighlighted.html : highlighted.html}</code></pre>
  {#if isLong}
    <button
      class="w-full py-2.5 text-[11px] text-nb-accent border-t border-white/5 hover:bg-white/5 transition-colors"
      onclick={() => expanded = !expanded}
    >
      {expanded ? 'Show less' : `+ ${lines.length - 30} more lines`}
    </button>
  {/if}
</div>
