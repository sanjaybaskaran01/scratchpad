<script>
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  let { rawText, language = '' } = $props();

  const lines  = $derived((rawText || '').split('\n'));
  const isLong = $derived(lines.length > 30);
  const shown  = $derived(isLong ? lines.slice(0, 30).join('\n') : (rawText || ''));

  let expanded       = $state(false);
  // Capture initial prop value (user can toggle; we don't want full reactivity)
  const isInitiallyMarkdown = language === 'markdown';
  let renderMarkdown = $state(isInitiallyMarkdown);
  let renderFade     = $state(false);

  const renderedHtml = $derived(
    renderMarkdown
      ? DOMPurify.sanitize(marked.parse(rawText || ''))
      : ''
  );

  function toggleMarkdown() {
    renderFade = false;
    renderMarkdown = !renderMarkdown;
    expanded = false;
    requestAnimationFrame(() => { renderFade = true; });
  }
</script>

<div class="bg-nb-card border border-white/5 rounded-xl overflow-hidden">
  <div class="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="material-symbols-outlined text-nb-muted" style="font-size:14px">notes</span>
      <span class="text-[10px] font-bold uppercase tracking-widest text-nb-muted">Plain Text</span>
    </div>
    <div class="flex items-center gap-3">
      {#if language === 'markdown'}
        <div class="flex items-center gap-0.5 bg-white/5 rounded-full p-0.5">
          <button
            class="toggle-pill {renderMarkdown ? 'toggle-active' : ''}"
            onclick={toggleMarkdown}
          >Render</button>
          <button
            class="toggle-pill {!renderMarkdown ? 'toggle-active' : ''}"
            onclick={toggleMarkdown}
          >Raw</button>
        </div>
      {/if}
      <span class="text-[10px] text-nb-muted">{lines.length} lines</span>
    </div>
  </div>
  <div class="p-6">
    {#if renderMarkdown}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="markdown-body {renderFade ? 'opacity-100' : 'opacity-0'} transition-opacity duration-150" onclick={(e) => { if (e.target.tagName === 'A') e.target.setAttribute('target', '_blank'); }}>
        {@html renderedHtml}
      </div>
    {:else}
      <p class="clip-text-body text-base font-light leading-relaxed text-nb-text whitespace-pre-wrap break-words">
        {expanded ? (rawText || '') : shown}
      </p>
      {#if isLong}
        <button
          class="mt-4 text-xs text-nb-accent hover:underline flex items-center gap-1"
          onclick={() => expanded = !expanded}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg" class="transition-transform duration-200 {expanded ? 'rotate-180' : ''}">
            <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {expanded ? 'Show less' : `+ ${lines.length - 30} more lines`}
        </button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .markdown-body { color: var(--color-nb-text, #e0e0e0); line-height: 1.6; }
  .markdown-body :global(h1) { font-size: 1.4em; font-weight: 700; margin: 0.5em 0 0.25em; }
  .markdown-body :global(h2) { font-size: 1.2em; font-weight: 600; margin: 0.5em 0 0.25em; }
  .markdown-body :global(h3) { font-size: 1.1em; font-weight: 600; margin: 0.5em 0 0.2em; }
  .markdown-body :global(h4), .markdown-body :global(h5), .markdown-body :global(h6) { font-weight: 600; margin: 0.4em 0 0.2em; }
  .markdown-body :global(p) { margin: 0.4em 0; }
  .markdown-body :global(ul), .markdown-body :global(ol) { padding-left: 1.5em; margin: 0.4em 0; }
  .markdown-body :global(li) { margin: 0.15em 0; }
  .markdown-body :global(code) { background: rgba(255,255,255,0.08); border-radius: 3px; padding: 0.1em 0.3em; font-family: 'Fira Code', monospace; font-size: 0.875em; }
  .markdown-body :global(pre) { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.75em 1em; overflow-x: auto; margin: 0.5em 0; }
  .markdown-body :global(pre code) { background: none; padding: 0; font-size: 0.875em; }
  .markdown-body :global(blockquote) { border-left: 3px solid rgba(255,255,255,0.2); padding-left: 0.75em; margin: 0.5em 0; opacity: 0.75; }
  .markdown-body :global(a) { color: #60a5fa; decoration: underline; }
  .markdown-body :global(hr) { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 0.75em 0; }
  .markdown-body :global(table) { border-collapse: collapse; width: 100%; margin: 0.5em 0; font-size: 0.875em; }
  .markdown-body :global(th), .markdown-body :global(td) { border: 1px solid rgba(255,255,255,0.1); padding: 0.4em 0.75em; text-align: left; }
  .markdown-body :global(th) { background: rgba(255,255,255,0.05); font-weight: 600; }
  .markdown-body :global(img) { max-width: 100%; border-radius: 4px; }
  .markdown-body :global(strong) { font-weight: 600; }
  .markdown-body :global(em) { font-style: italic; }
</style>