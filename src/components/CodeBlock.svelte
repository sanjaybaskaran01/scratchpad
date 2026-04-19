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

  const showLineNums = $derived(lines.length > 5);

  async function copyCode() {
    await navigator.clipboard.writeText(rawText || '');
  }
</script>

<div class="bg-nb-card border border-white/5 rounded-xl overflow-hidden">
  <div class="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
    <span class="text-[10px] font-bold uppercase tracking-widest text-nb-accent bg-nb-accent/10 px-2 py-0.5 rounded-full">{label}</span>
    <div class="flex items-center gap-2">
      {#if clip.lineCount}
        <span class="text-[10px] text-nb-muted">{clip.lineCount} lines</span>
      {/if}
      <button
        class="icon-action"
        style="width:24px;height:24px"
        title="Copy code"
        onclick={copyCode}
      >
        <span class="material-symbols-outlined" style="font-size:13px">content_copy</span>
      </button>
    </div>
  </div>
  <div class="flex">
    {#if showLineNums}
      <div class="code-line-nums pt-5 pb-5 pl-4 pr-0 select-none shrink-0" aria-hidden="true">
        {#each (expanded ? lines : lines.slice(0, 30)) as _}
          <span class="block text-sm leading-relaxed font-mono">&nbsp;</span>
        {/each}
      </div>
    {/if}
    <pre class="hljs-pre p-5 text-sm font-mono leading-relaxed overflow-x-auto m-0 bg-transparent flex-1"
         class:max-h-96={isLong && !expanded}
         class:overflow-y-hidden={isLong && !expanded}
    ><code class="hljs">{@html expanded && fullHighlighted ? fullHighlighted.html : highlighted.html}</code></pre>
  </div>
  {#if isLong}
    <button
      class="w-full py-2.5 text-[11px] text-nb-accent border-t border-white/5 hover:bg-white/5 transition-colors flex items-center justify-center gap-1"
      onclick={() => expanded = !expanded}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg" class="transition-transform duration-200 {expanded ? 'rotate-180' : ''}">
        <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      {expanded ? 'Show less' : `+ ${lines.length - 30} more lines`}
    </button>
  {/if}
</div>