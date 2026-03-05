# Lyrics Manager Application

## Current State
- Play Mode has a beat-based transport with time signature selector, large beat-1 circle, beat grid, and BPM display.
- The scroll event fires inside the interval tick AFTER updating the beat counter, meaning it appears to scroll on beat 2 visually.
- SongEditorTab has a formatting toolbar (Bold, Size, Color, Align) rendered inside a ScrollArea, so it scrolls away with the lyrics textarea.
- Under "Edit Song" heading in edit mode, there is a description: "Make changes to the song details below. Placeholders like [2] or [5] will create blank lines in Play Mode." — needs removal for edit mode only.
- The editor still has a "Scroll Speed" slider and "Lines per Scroll" input field which are now redundant since scrolling is beat-1 driven.
- Color highlighting uses textarea selectionStart/selectionEnd indices stored as ColorHighlight[] and rendered in PlayTab via applyTextColorChanges(). The color application currently saves selections but the index offset can be wrong due to accumulation of overlapping highlights.

## Requested Changes (Diff)

### Add
- Nothing new to add.

### Modify
1. **Beat-1 scroll timing (PlayTab.tsx):** Move the scroll trigger to fire IMMEDIATELY at the START of beat 1's tick, before the beat counter advances. Currently `setScrollPosition` runs inside the interval after beat state is set. Reorder so scroll happens first when `beat === 1`, then advance the counter.
2. **Sticky toolbar (SongEditorTab.tsx):** Extract the formatting toolbar row (Bold, Size, Color, Align buttons) out of the ScrollArea. Place it as a sticky bar above the ScrollArea so it stays fixed while the lyrics textarea scrolls. Use `position: sticky` or restructure layout so toolbar is outside the scrollable region.
3. **Remove "Edit Song" subtitle description (SongEditorTab.tsx):** Remove the paragraph "Make changes to the song details below. Placeholders like [2] or [5] will create blank lines in Play Mode." from the edit mode branch. Keep the create mode description if present or remove both for cleanliness.
4. **Remove Scroll Speed slider and Lines per Scroll input (SongEditorTab.tsx):** Delete the entire "Scroll Speed" slider block and the "Lines per Scroll" input block from the editor form. Remove associated state variables (`scrollSpeed`, `linesPerScroll`) and handlers (`handleLinesPerScrollChange`). Remove them from `performSave` data payload and `handlePreviewClick` song object (set linesPerScroll to BigInt(1) as default).
5. **Color highlight index fix (SongEditorTab.tsx):** When applying a new color highlight via `handleApplyTextColorInstantly`, before adding the new highlight, remove any existing highlights that overlap with the new selection range [start, end]. This prevents index drift from stacked overlapping ranges causing offset rendering in PlayTab.

### Remove
- `scrollSpeed` state, setter, and Scroll Speed slider UI block from SongEditorTab.
- `linesPerScroll` state, setter, input UI block, and `handleLinesPerScrollChange` from SongEditorTab.
- The subtitle description paragraph under "Edit Song" heading.

## Implementation Plan
1. In `PlayTab.tsx`: Reorder the interval callback so scroll fires at the top when `beat === 1`, then flash, then advance beat counter.
2. In `SongEditorTab.tsx`: 
   - Move the toolbar div (Bold/Size/Color/Align row) outside the `<ScrollArea>` tag, placing it directly above it as a sticky/fixed element within the editor section.
   - Remove the edit-mode subtitle paragraph.
   - Remove the Scroll Speed slider block (Label + Slider + description paragraph).
   - Remove the Lines per Scroll input block (Label + Input + description paragraph).
   - Remove `scrollSpeed` and `linesPerScroll` state declarations and related handlers.
   - Update `performSave` to remove `scrollSpeed` from data, keep `linesPerScroll: 1` hardcoded.
   - Update `handlePreviewClick` to set `linesPerScroll: BigInt(1)`.
   - In `handleApplyTextColorInstantly`: filter out existing highlights that overlap [start, end] before appending the new one.
