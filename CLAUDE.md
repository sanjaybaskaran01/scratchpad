# Scratchpad — Project Guide

## What is this?

Scratchpad is a local-first developer clipboard app. Everything lives in the browser (IndexedDB + sessionStorage). No backend, no account.

## Key Terminology

| Term | Meaning |
|------|---------|
| **Clip** | Any saved note entity in the application — code, plain text, or image. The fundamental unit of content. |
| **Scratchpad** | The ephemeral text-entry window that opens automatically when the user starts typing (or presses any character key). Used for quickly jotting down content before saving it as a clip. Closes on `⌘↵` (save) or `Esc` (discard). |
| **Feed** | The main scrollable column in the center that shows all clips, the scratchpad (when active), and the manual entry panel. |
| **Sidebar** | The left panel listing clip titles for quick navigation. |
| **Ephemeral clip** | A clip stored in `sessionStorage` that expires after 24 hours unless pinned. |
| **Pinned clip** | A clip persisted in IndexedDB that never expires. |
| **Manual entry** | The `n` key opens a plain textarea for typing content directly (distinct from the scratchpad). |
| **Language detection** | When text is pasted, `highlight.js` auto-detects the programming language. Users can override the detected language via the `translate` icon on a clip. |

## Tech Stack

- **Svelte 5** (runes mode) — UI framework
- **Vite 6** — build tool
- **Tailwind CSS 4** — styling
- **highlight.js** — syntax highlighting + language detection
- **FlexSearch** — full-text search index (in-memory)
- **idb** — IndexedDB wrapper
- **lz-string** — text compression for large clips

## Project Structure

```
src/
  App.svelte              # Root component — all handlers, keyboard shortcuts, paste
  main.js                 # Entry point, CSS imports
  components/
    Header.svelte         # App title, filter tabs, search bar
    Sidebar.svelte        # Clip list navigation
    SidebarItem.svelte    # Individual sidebar entry
    ClipFeed.svelte       # Main content column
    ClipCard.svelte       # Detail view for a single clip (edit, copy, share, etc.)
    CodeBlock.svelte      # Syntax-highlighted code block
    TextBlock.svelte      # Plain text block with line count
    ImageBlock.svelte     # Image viewer with lightbox
    Scratchpad.svelte     # Ephemeral typing area
    ManualEntry.svelte    # Explicit new-clip textarea (n key)
    PasteZone.svelte      # Empty state — shown when no clips exist
    Toast.svelte          # Notification toasts
    ShortcutOverlay.svelte  # ? key help panel
    ImageModal.svelte     # Full-screen image lightbox
  lib/
    clips.js              # Content detection, compression, hashing, image optimization
    storage.js            # IndexedDB + sessionStorage abstraction
    sharing.js            # URL share encoding/decoding, clipboard copy
    highlight.js          # highlight.js setup (language registration + auto-detect)
  state/
    clips.svelte.js       # Reactive clip list, filter, search, editingClipId
    ui.svelte.js          # Reactive UI state (toasts, modals, scratchpad active, etc.)
css/
  app.css                 # Global styles, animations, Tailwind theme
public/
  img/                    # Favicon, OG image
  manifest.json           # PWA manifest
  robots.txt / sitemap.xml
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Any char | Open scratchpad (pre-filled with the character) |
| `⌘↵` | Save scratchpad as clip |
| `Esc` | Close scratchpad / discard; clear search if active |
| `i` | Edit selected clip inline |
| `x` | Delete selected clip |
| `z` | Undo last deletion (5-second window) |
| `p` | Pin / unpin selected clip |
| `c` | Copy selected clip to clipboard |
| `s` | Copy share URL |
| `j / k` | Navigate clips |
| `⌘K` or `/` | Focus search |
| `n` | Open manual entry |
| `?` | Show shortcut help overlay |

## Storage Model

- **Ephemeral text clips** → `sessionStorage` (key: `scratchpad_session_clips`), expire 24 h
- **Pinned clips + all image clips** → IndexedDB (`scratchpad_db`, store: `clips`)
- **Image blobs** → IndexedDB (`scratchpad_db`, store: `blobs`)
- **Settings** → `localStorage` (key: `scratchpad_settings`)

## Clip Object Shape

```js
{
  id:                string,   // "clip_{timestamp}_{random}"
  type:              'text' | 'image',
  content:           string | null,   // text: possibly lz-string compressed
  language:          string | null,   // hljs language name, or null for plain text
  compressed:        boolean,
  sizeBytes:         number,          // compressed size (or blob size for images)
  originalSizeBytes: number,          // uncompressed size
  label:             string,          // user-visible name (may be empty)
  ephemeral:         boolean,
  pinned:            boolean,
  createdAt:         number,          // Unix ms
  expiresAt:         number | Infinity,
  contentHash:       string | null,   // SHA-256 prefix for duplicate detection
  lineCount:         number | null,
  dimensions:        { w, h } | null, // images only
  blobId:            string | null,   // images only
}
```
