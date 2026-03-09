import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Palette,
  Play,
  RotateCcw,
  Save,
  Type,
  X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorState } from "../App";
import type { Song } from "../backend";
import {
  type ColorHighlight,
  useCheckTitleConflict,
  useExportSong,
  useGetSong,
  useSaveSong,
} from "../hooks/useQueries";

interface SongEditorTabProps {
  editorState: EditorState;
  onSave: () => void;
  onCancel: () => void;
  onPreview: (song: Song) => void;
}

const PRESET_COLORS = [
  "#ffff00",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ff00ff",
  "#00ffff",
  "#ffa500",
  "#800080",
  "#ffc0cb",
  "#ffffff",
];

const DEFAULT_VALUES = {
  title: "",
  artist: "",
  lyrics: "",
  tempo: 120,
  backgroundColor: "#000000",
  textColor: "#ffff00", // Default yellow
  textSize: 24,
  isBold: true, // Default bold on
  textAlign: "center" as "left" | "center" | "right",
};

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Strip all HTML tags to get plain text.
 */
function htmlToPlainText(html: string): string {
  // Replace block-level closing tags with newlines before stripping
  const withNewlines = html
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  // Strip remaining tags
  return withNewlines.replace(/<[^>]*>/g, "");
}

/**
 * Convert legacy plain text + colorRanges into HTML with <span style="color:…"> wrapping.
 */
function convertLegacyToHtml(
  plainText: string,
  colorRanges: ColorHighlight[],
): string {
  if (colorRanges.length === 0) {
    // Escape and preserve newlines
    return plainText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
  }

  const sorted = [...colorRanges]
    .map((h) => ({
      start: Number(h.start),
      end: Number(h.end),
      color: h.color,
    }))
    .filter((h) => h.start < h.end && h.start >= 0 && h.end <= plainText.length)
    .sort((a, b) => a.start - b.start);

  let html = "";
  let lastIndex = 0;

  const encodeSegment = (text: string) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

  for (const h of sorted) {
    if (h.start > lastIndex) {
      html += encodeSegment(plainText.substring(lastIndex, h.start));
    }
    html += `<span style="color:${h.color}">${encodeSegment(plainText.substring(h.start, h.end))}</span>`;
    lastIndex = h.end;
  }

  if (lastIndex < plainText.length) {
    html += encodeSegment(plainText.substring(lastIndex));
  }

  return html;
}

/**
 * Normalise browser-generated markup:
 * - Convert <font color="…"> → <span style="color:VALUE">
 * - Strip <b>, <i>, <u>, <div>, <p> (but preserve their line-break semantics)
 * - Keep <span style="color:…"> and <br>
 *
 * IMPORTANT: Order of operations matters here to preserve line breaks.
 * Chrome wraps each new paragraph in <div>…</div>. We must convert closing
 * block tags to <br> BEFORE stripping the opening tags, so every line gets
 * a break. The whitelist pass at the end is case-insensitive to catch <BR>.
 */
function normalizeEditorHtml(html: string): string {
  let result = html;

  // Step 1: Convert <font color="…"> / <font color='…'> → <span style="color:VALUE">
  result = result.replace(
    /<font[^>]*\s+color=["']?([^"'\s>]+)["']?[^>]*>/gi,
    (_match, color) => `<span style="color:${color}">`,
  );
  result = result.replace(/<\/font>/gi, "</span>");

  // Step 2: Convert closing block tags to <br> FIRST (before stripping open tags)
  // This ensures every Chrome-generated <div> line gets a line break.
  result = result.replace(/<\/div>/gi, "<br>");
  result = result.replace(/<\/p>/gi, "<br>");

  // Step 3: Strip unwanted OPENING tags (their closing tags already converted above)
  const stripOpenTags = [
    "b",
    "i",
    "u",
    "strong",
    "em",
    "strike",
    "s",
    "div",
    "p",
  ];
  for (const tag of stripOpenTags) {
    result = result.replace(new RegExp(`<${tag}(?:\\s[^>]*)?>`, "gi"), "");
  }

  // Step 4: Remove any remaining tags that are NOT <span…>, </span>, or <br>
  // Use case-insensitive flag and allow self-closing <br/>
  result = result.replace(/<(?!\/?span(?:\s|>))(?!br(?:\s|\/?>))[^>]+>/gi, "");

  // Step 5: Normalise <br> variants to a consistent form
  result = result.replace(/<br\s*\/?>/gi, "<br>");

  // Step 6: Collapse 3+ consecutive <br> to at most 2 (trim accidental blanks from
  // the closing-tag conversion, but allow intentional double line-breaks)
  result = result.replace(/(<br>){3,}/g, "<br><br>");

  // Step 7: Remove leading/trailing <br>
  result = result.replace(/^(<br>)+/, "").replace(/(<br>)+$/, "");

  return result;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SongEditorTab({
  editorState,
  onSave,
  onCancel,
  onPreview,
}: SongEditorTabProps) {
  const { data: existingSong } = useGetSong(editorState.songId);
  const saveMutation = useSaveSong();
  const exportSongMutation = useExportSong();
  const checkTitleConflict = useCheckTitleConflict();

  const [title, setTitle] = useState(DEFAULT_VALUES.title);
  const [artist, setArtist] = useState(DEFAULT_VALUES.artist);
  // lyrics holds the current innerHTML of the contenteditable div
  const [lyrics, setLyrics] = useState(DEFAULT_VALUES.lyrics);
  const [tempo, setTempo] = useState(DEFAULT_VALUES.tempo);
  const [backgroundColor, setBackgroundColor] = useState(
    DEFAULT_VALUES.backgroundColor,
  );
  const [textColor, setTextColor] = useState(DEFAULT_VALUES.textColor);
  const [textSize, setTextSize] = useState(DEFAULT_VALUES.textSize);
  const [isBold, setIsBold] = useState(DEFAULT_VALUES.isBold);
  const [selectedColor, setSelectedColor] = useState("#00ff00");
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right">(
    DEFAULT_VALUES.textAlign,
  );
  const [showTitleConflictDialog, setShowTitleConflictDialog] = useState(false);
  const [conflictingSong, setConflictingSong] = useState<{
    id: string;
    title: string;
  } | null>(null);
  // Track which song was last loaded so we only sync innerHTML on actual song changes.
  // Using a ref avoids this value appearing in the effect dependency list.
  const lastLoadedSongIdRef = useRef<string | undefined>(undefined);

  const editorRef = useRef<HTMLDivElement>(null);

  // ── Load existing song ────────────────────────────────────────────────────
  useEffect(() => {
    if (existingSong && editorState.mode === "edit") {
      // Avoid re-loading the same song twice (e.g. re-render without song change)
      const songKey = existingSong.id + existingSong.updatedAt.toString();
      if (lastLoadedSongIdRef.current === songKey) return;
      lastLoadedSongIdRef.current = songKey;

      setTitle(existingSong.title);
      setArtist(existingSong.artist);
      setTempo(Number(existingSong.tempo));
      setBackgroundColor(existingSong.backgroundColor);
      setTextColor(existingSong.textColor);
      setTextSize(Number(existingSong.textSize));
      setIsBold(existingSong.isBold);

      const rawLyrics = existingSong.lyrics;
      const loadedColorRanges: ColorHighlight[] = existingSong.colorRanges.map(
        (range) => ({
          start: range.start,
          end: range.end,
          color: range.color,
        }),
      );

      let htmlToLoad: string;

      if (
        /<span[\s>]/i.test(rawLyrics) ||
        /<br[\s/>]/i.test(rawLyrics) ||
        /<div[\s>]/i.test(rawLyrics) ||
        /<p[\s>]/i.test(rawLyrics)
      ) {
        // Already HTML — normalize it to strip any browser-specific markup
        // while preserving all line breaks and color spans
        htmlToLoad = normalizeEditorHtml(rawLyrics);
      } else if (loadedColorRanges.length > 0) {
        // Legacy plain text + colorRanges — convert
        htmlToLoad = convertLegacyToHtml(rawLyrics, loadedColorRanges);
      } else {
        // Pure plain text — encode for HTML
        htmlToLoad = rawLyrics
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>");
      }

      setLyrics(htmlToLoad);
      // Set editor innerHTML after React has flushed
      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = htmlToLoad;
        }
      });
    } else if (editorState.mode === "create") {
      clearForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSong, editorState]);

  const clearForm = () => {
    setTitle(DEFAULT_VALUES.title);
    setArtist(DEFAULT_VALUES.artist);
    setLyrics(DEFAULT_VALUES.lyrics);
    setTempo(DEFAULT_VALUES.tempo);
    setBackgroundColor(DEFAULT_VALUES.backgroundColor);
    setTextColor(DEFAULT_VALUES.textColor);
    setTextSize(DEFAULT_VALUES.textSize);
    setIsBold(DEFAULT_VALUES.isBold);
    setTextAlign(DEFAULT_VALUES.textAlign);
    lastLoadedSongIdRef.current = undefined;
    if (editorRef.current) {
      editorRef.current.innerHTML = "";
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSaveClick = async () => {
    if (!title.trim()) return;

    const conflict = checkTitleConflict(title.trim(), editorState.songId);

    if (conflict) {
      setConflictingSong({ id: conflict.id, title: conflict.title });
      setShowTitleConflictDialog(true);
    } else {
      await performSave(false);
    }
  };

  const performSave = async (replaceExisting: boolean) => {
    const rawHtml = editorRef.current?.innerHTML ?? lyrics;
    const normalizedHtml = normalizeEditorHtml(rawHtml);
    const plainTextForCheck = htmlToPlainText(normalizedHtml);

    const data = {
      id: editorState.songId,
      title: title.trim(),
      artist: artist.trim(),
      // Store HTML directly — color is embedded in spans
      lyrics: normalizedHtml,
      scrollSpeed: 0,
      linesPerScroll: 1,
      tempo,
      backgroundColor,
      textColor,
      textSize,
      isBold,
      // Empty colorHighlights — color lives in the HTML now
      colorHighlights: [] as ColorHighlight[],
      replaceExisting,
    };

    // Guard against saving an empty editor
    if (!plainTextForCheck.trim() && !title.trim()) return;

    try {
      const savedId = await saveMutation.mutateAsync(data);

      const savedSong: Song = {
        id: savedId,
        title: data.title,
        artist: data.artist,
        lyrics: data.lyrics,
        scrollSpeed: BigInt(0),
        tempo: BigInt(data.tempo),
        backgroundColor: data.backgroundColor,
        textColor: data.textColor,
        textSize: BigInt(data.textSize),
        isBold: data.isBold,
        linesPerScroll: BigInt(1),
        colorRanges: [],
        createdAt: BigInt(Date.now() * 1000000),
        updatedAt: BigInt(Date.now() * 1000000),
      };

      await exportSongMutation.mutateAsync(savedSong);
      onSave();
    } catch (error) {
      console.error("Failed to save song:", error);
    }
  };

  const handleTitleConflictReplace = async () => {
    setShowTitleConflictDialog(false);
    await performSave(true);
  };

  const handleTitleConflictSaveAsNew = async () => {
    setShowTitleConflictDialog(false);
    await performSave(false);
  };

  const handleTitleConflictCancel = () => {
    setShowTitleConflictDialog(false);
    setConflictingSong(null);
  };

  // ── Color Application (ContentEditable approach) ──────────────────────────
  const handleApplyTextColorInstantly = useCallback((color: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    // Apply color using execCommand (works in all major browsers)
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("foreColor", false, color);
    // Sync state from DOM
    setLyrics(editor.innerHTML);
  }, []);

  const handleClearTextColors = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const plain = htmlToPlainText(editor.innerHTML);
    // Rebuild as plain text preserving line breaks
    const plainHtml = plain
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
    editor.innerHTML = plainHtml;
    setLyrics(plainHtml);
  };

  // ── Preview ───────────────────────────────────────────────────────────────
  const handlePreviewClick = () => {
    const rawHtml = editorRef.current?.innerHTML ?? lyrics;
    const normalizedHtml = normalizeEditorHtml(rawHtml);

    const previewSong: Song = {
      id: editorState.songId || "preview",
      title: title.trim() || "Untitled Song",
      artist: artist.trim(),
      lyrics: normalizedHtml,
      scrollSpeed: BigInt(0),
      tempo: BigInt(tempo),
      backgroundColor,
      textColor,
      textSize: BigInt(textSize),
      isBold,
      linesPerScroll: BigInt(1),
      colorRanges: [],
      createdAt: BigInt(Date.now() * 1000000),
      updatedAt: BigInt(Date.now() * 1000000),
    };

    onPreview(previewSong);
  };

  // Whether the editor has any content (used for disabled states)
  const hasContent = !!htmlToPlainText(lyrics).trim();

  const isSaving = saveMutation.isPending || exportSongMutation.isPending;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-primary mb-2">
          {editorState.mode === "edit" ? "Edit Song" : "Create New Song"}
        </h2>
      </div>

      {/* Sticky Lyrics Toolbar — outside ScrollArea so it never scrolls away */}
      <div className="flex items-center justify-between mb-2 py-2 border-b bg-background sticky top-0 z-10">
        <Label>Lyrics Editor (with Live Formatting)</Label>
        <div className="flex items-center gap-2">
          <Button
            variant={isBold ? "default" : "outline"}
            size="sm"
            onClick={() => setIsBold(!isBold)}
            title="Toggle Bold"
          >
            <Bold className="h-4 w-4" />
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Type className="h-4 w-4 mr-2" />
                {textSize}px
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="space-y-2">
                <Label>Text Size: {textSize}px</Label>
                <Slider
                  value={[textSize]}
                  onValueChange={(v) => setTextSize(v[0])}
                  min={12}
                  max={72}
                  step={1}
                />
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Palette className="h-4 w-4 mr-2" />
                Color
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Text Color Change</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Select text in the editor, then click a color to apply it
                    instantly. Selection will remain active.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Select Color</Label>
                  <div className="grid grid-cols-5 gap-2">
                    {PRESET_COLORS.map((color) => (
                      <button
                        type="button"
                        key={color}
                        onClick={() => {
                          setSelectedColor(color);
                          handleApplyTextColorInstantly(color);
                        }}
                        className={`w-10 h-10 rounded border-2 transition-all ${
                          selectedColor === color
                            ? "border-primary scale-110"
                            : "border-border hover:scale-105"
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2 items-center mt-2">
                    <Input
                      type="color"
                      value={selectedColor}
                      onChange={(e) => {
                        setSelectedColor(e.target.value);
                        handleApplyTextColorInstantly(e.target.value);
                      }}
                      className="w-20 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={selectedColor}
                      onChange={(e) => {
                        setSelectedColor(e.target.value);
                        handleApplyTextColorInstantly(e.target.value);
                      }}
                      placeholder="#000000"
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleClearTextColors}
                    className="flex-1"
                  >
                    Clear All Colors
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex gap-1 border rounded-md">
            <Button
              variant={textAlign === "left" ? "default" : "ghost"}
              size="sm"
              onClick={() => setTextAlign("left")}
              className="h-8 w-8 p-0"
              title="Align Left"
            >
              <AlignLeft className="h-4 w-4" />
            </Button>
            <Button
              variant={textAlign === "center" ? "default" : "ghost"}
              size="sm"
              onClick={() => setTextAlign("center")}
              className="h-8 w-8 p-0"
              title="Align Center"
            >
              <AlignCenter className="h-4 w-4" />
            </Button>
            <Button
              variant={textAlign === "right" ? "default" : "ghost"}
              size="sm"
              onClick={() => setTextAlign("right")}
              className="h-8 w-8 p-0"
              title="Align Right"
            >
              <AlignRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-320px)]">
        <div className="space-y-6 pr-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Song Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter song title"
                data-ocid="editor.input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="artist">Artist</Label>
              <Input
                id="artist"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Enter artist name"
                data-ocid="editor.input"
              />
            </div>
          </div>

          {/* ContentEditable lyrics editor */}
          <div className="space-y-2">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              data-ocid="editor.editor"
              onInput={() => setLyrics(editorRef.current?.innerHTML ?? "")}
              className="relative w-full min-h-[500px] p-4 rounded-md border font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              style={{
                backgroundColor: backgroundColor,
                color: textColor,
                caretColor: textColor,
                fontSize: `${textSize}px`,
                fontWeight: isBold ? "bold" : "normal",
                textAlign: textAlign,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                minHeight: 500,
                outline: "none",
                lineHeight: "1.5",
              }}
            />
            <p className="text-xs text-muted-foreground">
              Type or paste lyrics here. Select text then pick a color from the
              toolbar to apply. Use [N] placeholders (e.g., [2], [5]) to insert
              blank lines in Play Mode. Color formatting is stored directly in
              the text and will show in Play Mode.
            </p>
          </div>

          {/* Tempo — plain number input, no slider */}
          <div className="space-y-2">
            <Label htmlFor="tempo">Tempo (BPM)</Label>
            <Input
              id="tempo"
              type="number"
              min={40}
              max={240}
              value={tempo}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const v = Number(e.target.value);
                if (!Number.isNaN(v) && v >= 40 && v <= 240) setTempo(v);
              }}
              className="w-32"
              data-ocid="editor.input"
            />
            <p className="text-xs text-muted-foreground">
              Beats per minute (40–240)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bgColor">Background Color</Label>
              <div className="flex gap-2">
                <Input
                  id="bgColor"
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="w-20 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  placeholder="#000000"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="textColor">Default Text Color</Label>
              <div className="flex gap-2">
                <Input
                  id="textColor"
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="w-20 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  placeholder="#ffff00"
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              data-ocid="editor.save_button"
              onClick={handleSaveClick}
              disabled={!title.trim() || isSaving}
              className="bg-primary hover:bg-primary/90"
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? "Saving..." : "Save"}
            </Button>

            <Button
              data-ocid="editor.primary_button"
              onClick={handlePreviewClick}
              disabled={!hasContent}
              className="bg-green-600 hover:bg-green-700"
            >
              <Play className="h-4 w-4 mr-2" />
              Preview
            </Button>

            <Button
              data-ocid="editor.cancel_button"
              variant="outline"
              onClick={onCancel}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>

            <Button
              data-ocid="editor.delete_button"
              variant="destructive"
              className="ml-auto"
              onClick={clearForm}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Clear Form
            </Button>
          </div>
        </div>
      </ScrollArea>

      <AlertDialog
        open={showTitleConflictDialog}
        onOpenChange={setShowTitleConflictDialog}
      >
        <AlertDialogContent data-ocid="editor.dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Title Already Exists</AlertDialogTitle>
            <AlertDialogDescription>
              A song with the title "{conflictingSong?.title}" already exists.
              Would you like to replace the existing song or save this as a new
              song?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-ocid="editor.cancel_button"
              onClick={handleTitleConflictCancel}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              data-ocid="editor.secondary_button"
              variant="outline"
              onClick={handleTitleConflictSaveAsNew}
            >
              Save as new
            </Button>
            <AlertDialogAction
              data-ocid="editor.confirm_button"
              onClick={handleTitleConflictReplace}
              className="bg-primary hover:bg-primary/90"
            >
              Replace existing song
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
