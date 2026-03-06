# Lyrics Manager Application

## Current State
- PlayTab renders lyrics by first running `parsePlaceholders()` on the full raw lyrics string (expanding `[N]` to N newlines), then passing the expanded string to `applyTextColorChanges()` with colorRange offsets stored against the original raw text. This causes a character-position drift: every `[N]` placeholder expands to N characters instead of the original 3+ chars, shifting all subsequent color ranges by a varying offset — producing colors landing on wrong words.
- SongEditorTab has a plain `<textarea>` for editing. Color highlights are stored in state as `colorHighlights[]` but are not rendered visually in the editor — the user cannot see colors live while editing, only after Preview/Save.
- JSON structure (songs, colorRanges, setLists) is stable in Version 43. No field renames or schema changes are needed.

## Requested Changes (Diff)

### Add
- Live color overlay in SongEditorTab: a read-only `<div>` positioned behind the textarea that renders the current lyrics text with colored `<span>` segments based on `colorHighlights` state. The textarea uses `color: transparent` + `caretColor` so the user types normally while seeing live colors from the overlay beneath.

### Modify
- **PlayTab `renderedLyrics` logic**: Change the order of operations so `applyTextColorChanges()` is called on the **raw lyrics string** first, producing an array of React elements (each element being a plain text segment or a colored segment). Then `parsePlaceholders()` is applied **within each segment's text content** independently. This guarantees colorRange offsets match the raw text exactly, and placeholder expansion happens per-segment without shifting any ranges.
- **SongEditorTab**: Wrap the textarea in a `relative` container; add the color overlay `<div>` as a sibling absolutely positioned behind it. Sync scroll position between overlay and textarea via `onScroll`.

### Remove
- Nothing removed from data structures, JSON format, or backend calls.

## Implementation Plan
1. In `PlayTab.tsx`: Refactor `renderedLyrics` useMemo — call `applyTextColorChanges(song.lyrics, song.colorRanges)` on raw lyrics to get segments, then map each segment through `parsePlaceholders()` on its text content before rendering. This two-step approach eliminates offset drift entirely.
2. In `SongEditorTab.tsx`: Add a `overlayRef` div sibling to the textarea. The overlay div mirrors the textarea's exact styles (font, size, padding, background) but uses `pointer-events: none` and `position: absolute`. Render colored spans from `colorHighlights` into the overlay. Add `onScroll` handler on the textarea to keep overlay scroll in sync. Set textarea `color: transparent` and `caretColor: textColor`.
3. Preserve all existing `colorHighlights` state logic and `handleApplyTextColorInstantly` unchanged — no changes to save/load/import/export code.
