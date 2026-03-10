/**
 * clips.svelte.js — shared reactive clip state (Svelte 5 runes, module level)
 */
import { decompressText } from '../lib/clips.js';

export const clipsState = $state({
  all:          [],      // all clips, sorted newest-first
  selectedId:   null,
  activeFilter: 'all',   // 'all' | 'code' | 'image' | 'text'
  searchQuery:  '',
  editingClipId: null,   // set externally to trigger edit mode on a specific clip
});

// FlexSearch Document instance — not reactive, mutated in place
export let searchIndex = null;
export function setSearchIndex(idx) { searchIndex = idx; }

/**
 * Returns the filtered/searched subset of clips.
 * Call this inside $derived(...) in each component that needs it.
 */
export function computeVisibleClips() {
  let pool = clipsState.all;

  if (clipsState.searchQuery.trim()) {
    if (searchIndex) {
      const results = searchIndex.search(clipsState.searchQuery, { limit: 200, enrich: false });
      const ids = new Set(results.flatMap(r => r.result));
      pool = pool.filter(c => ids.has(c.id));
    } else {
      pool = pool.filter(c => {
        const hay = [c.label, c.language, decompressText(c)].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(clipsState.searchQuery.toLowerCase());
      });
    }
  }

  // 'plaintext' is not a programming language — keep it in the text bucket
  if (clipsState.activeFilter === 'code')  pool = pool.filter(c => c.language && c.language !== 'plaintext');
  if (clipsState.activeFilter === 'image') pool = pool.filter(c => c.type === 'image');
  if (clipsState.activeFilter === 'text')  pool = pool.filter(c => (!c.language || c.language === 'plaintext') && c.type !== 'image');

  return pool;
}
