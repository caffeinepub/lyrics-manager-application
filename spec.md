# Lyrics Manager Application

## Current State

The Song Editor uses a `<textarea>` (plain text input) combined with a transparent `<div>` overlay to fake colored text display. Color is stored as character index ranges (`start`/`end` bigints) mapped to color hex strings in the backend. This architecture causes persistent bugs:
- Offset misalignment: any difference in how newlines are counted between textarea and overlay shifts colors onto wrong words.
- Double-vision: overlay and textarea render the same text in slightly different ways.
- Black-on-black: when overlay has no background, the transparent textarea text (set to `transparent`) and overlay can conflict.

The Tempo field is a slider (range 40–240 BPM).

PlayTab reads `song.colorRanges` (character index ranges) and uses `splitTextIntoSegments` to render colored spans inline.

## Requested Changes (Diff)

### Add
- `ContentEditableEditor` component: a `contenteditable` div used as the lyrics editor. Color is stored directly in the DOM as `<span style="color:...">` HTML. No overlay needed.
- Toolbar color apply button: selects text in the contenteditable and wraps it in a `<span style="color:VALUE">` using `document.execCommand('foreColor')` or manual DOM range manipulation.
- HTML serialization: when saving, extract innerHTML from the editor and store as the `lyrics` field (HTML string). Color ranges are derived from the HTML rather than character indices.
- HTML deserialization: when loading, set the contenteditable innerHTML directly. Legacy plain text lyrics (no `<span>` tags) load as-is.
- Automatic legacy migration: on load, if `colorRanges` exists for a song, convert them to HTML spans wrapping the plain text and load that as the initial HTML. This handles old songs without requiring manual reformatting.
- Tempo field: replace the Slider with a plain `<Input type="number">` for manual BPM entry (min 40, max 240). No slider bar.

### Modify
- `SongEditorTab.tsx`: Replace the `<textarea>` + overlay combo with a `contenteditable` div editor. The `lyrics` state now holds HTML (innerHTML). The `colorHighlights` state and `colorRanges` backend field are still used for backward compatibility — on save, serialize the contenteditable HTML back into colorRanges by parsing the spans, OR save the HTML directly into the `lyrics` field and clear colorRanges.
- Color application: instead of using textarea selection indices, apply color by calling `document.execCommand('styleWithCSS', false, true)` then `document.execCommand('foreColor', false, color)` on the current selection inside the contenteditable. This is the ColorTextEditor approach.
- `PlayTab.tsx`: Update `renderedLyrics` to detect whether `song.lyrics` is HTML (contains `<`) and if so, use `dangerouslySetInnerHTML` to render it. If plain text, use the existing `splitTextIntoSegments` path.
- Save flow: serialize contenteditable innerHTML before save. Strip any browser-injected font/style tags to keep output clean. Convert to plain text + colorRanges OR keep as HTML and pass empty colorRanges.
- `performSave` and `handlePreviewClick`: extract lyrics HTML from the contenteditable ref, pass through existing save pipeline. Since lyrics is already stored as a string in backend, HTML can be stored there directly.

### Remove
- The `<textarea>` element from the editor area.
- The overlay `<div>` and all overlay rendering logic (`overlayRef`, `overlayContent()`, `handleTextareaScroll`).
- The `selectionRef` (no longer needed — contenteditable tracks its own selection).
- The `rebuildColorRanges` function (no longer needed — colors live in the DOM).
- The Tempo `<Slider>` import and usage; replaced with number input.

## Implementation Plan

1. In `SongEditorTab.tsx`:
   - Remove textarea, overlay, overlayRef, selectionRef, overlayContent, handleTextareaScroll, rebuildColorRanges.
   - Add `editorRef = useRef<HTMLDivElement>(null)` for the contenteditable div.
   - Replace lyrics state (plain text) with HTML content; on load, either use existing HTML or convert plain text + colorRanges to HTML spans.
   - Render a `contenteditable` div styled similarly to the old textarea (same background color, text color, font size, bold, text align, monospace font, min-height 500px).
   - Color apply: on color swatch/picker click, call `document.execCommand('foreColor', false, color)` — the browser applies the color to the current selection in the contenteditable. No need to track indices manually.
   - Clear colors: set the contenteditable innerHTML to its plain text equivalent (strip all spans).
   - Before save: read `editorRef.current.innerHTML`, strip `<font>` tags (browser compat), normalize to `<span style="color:...">` only. Pass as `lyrics` string. Pass empty `colorRanges: []` since color is embedded in HTML.
   - Replace the Slider for tempo with `<Input type="number" min={40} max={240} />`.

2. In `PlayTab.tsx`:
   - Detect if `song.lyrics` contains HTML tags (`/<[^>]+>/` regex).
   - If HTML: render via a `<div dangerouslySetInnerHTML={{ __html: processedLyrics }}` inside the existing `<pre>`-equivalent element. Apply same font size, bold, text align styles.
   - If plain text: keep existing `splitTextIntoSegments` + `renderSegments` path for backward compatibility with legacy songs.
   - Placeholder `[N]` expansion: for HTML lyrics, do a string replace on the HTML before setting innerHTML (replacing `[N]` with `\n`.repeat(N) or `<br>` tags as appropriate).

3. Ensure the save pipeline passes `colorRanges: []` (empty array) when lyrics contains embedded HTML color, so the old range-based renderer in PlayTab won't try to double-apply colors.
