<script>
  import { langLabel } from '../lib/clips.js';
  import { decompressText } from '../lib/clips.js';

  let { clip, selected, onSelect } = $props();

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60)    return 'just now';
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function previewTitle(c) {
    const raw = decompressText(c) || '';
    const first = raw.split('\n').find(l => l.trim().length > 3) || '';
    return first.trim().slice(0, 55) || '(empty)';
  }

  const typeLabel = $derived(
    clip.type === 'image' ? 'Image' : (clip.language ? langLabel(clip.language) : 'Plain Text')
  );
  const title = $derived(
    clip.type === 'image'
      ? (clip.label || 'Pasted image')
      : (clip.label || previewTitle(clip))
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="sidebar-item p-3 rounded-lg cursor-pointer transition-colors duration-150 border"
  class:bg-nb-card={selected}
  class:border-nb-accent={false}
  class:border-transparent={!selected}
  class:hover:bg-white={!selected}
  style={selected ? 'border-color: rgba(197,179,88,0.2)' : 'border-color: transparent'}
  onclick={() => onSelect(clip.id)}
>
  <div class="flex items-center justify-between mb-1">
    <span class="text-[10px] font-bold uppercase tracking-widest" style={selected ? 'color:#c5b358' : 'color:#a1a19f'}>
      {typeLabel}
    </span>
    {#if clip.pinned}
      <span class="material-symbols-outlined" style="font-size:12px;font-variation-settings:'FILL' 1;color:{selected ? '#c5b358' : '#a1a19f'}">push_pin</span>
    {/if}
  </div>
  <p class="text-xs font-medium truncate mb-1 text-nb-text">{title}</p>
  <p class="text-[10px] text-nb-muted">{timeAgo(clip.createdAt)}</p>
</div>
