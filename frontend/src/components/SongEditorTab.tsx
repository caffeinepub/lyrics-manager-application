import { useEffect, useState, useRef, useCallback } from 'react';
import { Save, X, RotateCcw, Palette, Bold, Type, AlignLeft, AlignCenter, AlignRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useGetSong, useSaveSong, useCheckTitleConflict, useExportSong, type ColorHighlight } from '../hooks/useQueries';
import type { EditorState } from '../App';
import type { Song } from '../backend';

interface SongEditorTabProps {
  editorState: EditorState;
  onSave: () => void;
  onCancel: () => void;
  onPreview: (song: Song) => void;
}

const PRESET_COLORS = [
  '#ffff00', '#ff0000', '#00ff00', '#0000ff', '#ff00ff',
  '#00ffff', '#ffa500', '#800080', '#ffc0cb', '#ffffff',
];

const DEFAULT_VALUES = {
  title: '',
  artist: '',
  lyrics: '',
  scrollSpeed: 5,
  linesPerScroll: 1,
  tempo: 120,
  backgroundColor: '#000000',
  textColor: '#ffff00', // Default yellow
  textSize: 24,
  isBold: true, // Default bold on
  textAlign: 'center' as 'left' | 'center' | 'right', // Default center-aligned
  colorHighlights: [] as ColorHighlight[],
};

export default function SongEditorTab({ editorState, onSave, onCancel, onPreview }: SongEditorTabProps) {
  const { data: existingSong } = useGetSong(editorState.songId);
  const saveMutation = useSaveSong();
  const exportSongMutation = useExportSong();
  const checkTitleConflict = useCheckTitleConflict();

  const [title, setTitle] = useState(DEFAULT_VALUES.title);
  const [artist, setArtist] = useState(DEFAULT_VALUES.artist);
  const [lyrics, setLyrics] = useState(DEFAULT_VALUES.lyrics);
  const [scrollSpeed, setScrollSpeed] = useState(DEFAULT_VALUES.scrollSpeed);
  const [linesPerScroll, setLinesPerScroll] = useState(DEFAULT_VALUES.linesPerScroll);
  const [tempo, setTempo] = useState(DEFAULT_VALUES.tempo);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_VALUES.backgroundColor);
  const [textColor, setTextColor] = useState(DEFAULT_VALUES.textColor);
  const [textSize, setTextSize] = useState(DEFAULT_VALUES.textSize);
  const [isBold, setIsBold] = useState(DEFAULT_VALUES.isBold);
  const [colorHighlights, setColorHighlights] = useState<ColorHighlight[]>(DEFAULT_VALUES.colorHighlights);
  const [selectedColor, setSelectedColor] = useState('#00ff00');
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>(DEFAULT_VALUES.textAlign);
  const [showTitleConflictDialog, setShowTitleConflictDialog] = useState(false);
  const [conflictingSong, setConflictingSong] = useState<{ id: string; title: string } | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    if (existingSong && editorState.mode === 'edit') {
      setTitle(existingSong.title);
      setArtist(existingSong.artist);
      setLyrics(existingSong.lyrics);
      setScrollSpeed(Number(existingSong.scrollSpeed));
      setLinesPerScroll(Number(existingSong.linesPerScroll) || 1);
      setTempo(Number(existingSong.tempo));
      setBackgroundColor(existingSong.backgroundColor);
      setTextColor(existingSong.textColor);
      setTextSize(Number(existingSong.textSize));
      setIsBold(existingSong.isBold);
      
      // Load color ranges from backend
      const loadedHighlights: ColorHighlight[] = existingSong.colorRanges.map(range => ({
        start: range.start,
        end: range.end,
        color: range.color,
      }));
      setColorHighlights(loadedHighlights);
    } else if (editorState.mode === 'create') {
      clearForm();
    }
  }, [existingSong, editorState]);

  const clearForm = () => {
    setTitle(DEFAULT_VALUES.title);
    setArtist(DEFAULT_VALUES.artist);
    setLyrics(DEFAULT_VALUES.lyrics);
    setScrollSpeed(DEFAULT_VALUES.scrollSpeed);
    setLinesPerScroll(DEFAULT_VALUES.linesPerScroll);
    setTempo(DEFAULT_VALUES.tempo);
    setBackgroundColor(DEFAULT_VALUES.backgroundColor);
    setTextColor(DEFAULT_VALUES.textColor);
    setTextSize(DEFAULT_VALUES.textSize);
    setIsBold(DEFAULT_VALUES.isBold);
    setColorHighlights(DEFAULT_VALUES.colorHighlights);
    setTextAlign(DEFAULT_VALUES.textAlign);
  };

  // Rebuild color ranges to maintain correct mappings
  const rebuildColorRanges = useCallback((text: string, highlights: ColorHighlight[]): ColorHighlight[] => {
    if (highlights.length === 0) return [];
    
    // Sort highlights by start position
    const sorted = [...highlights].sort((a, b) => Number(a.start) - Number(b.start));
    
    // Filter out invalid ranges (where start >= end or out of bounds)
    const valid = sorted.filter(h => {
      const start = Number(h.start);
      const end = Number(h.end);
      return start < end && start >= 0 && end <= text.length;
    });
    
    // Remove overlapping ranges, keeping the first one
    const noOverlaps: ColorHighlight[] = [];
    let lastEnd = 0;
    
    for (const highlight of valid) {
      const start = Number(highlight.start);
      const end = Number(highlight.end);
      
      if (start >= lastEnd) {
        noOverlaps.push(highlight);
        lastEnd = end;
      }
    }
    
    return noOverlaps;
  }, []);

  const handleSaveClick = async () => {
    if (!title.trim()) {
      return;
    }

    const conflict = checkTitleConflict(title.trim(), editorState.songId);
    
    if (conflict) {
      setConflictingSong({ id: conflict.id, title: conflict.title });
      setShowTitleConflictDialog(true);
    } else {
      await performSave(false);
    }
  };

  const performSave = async (replaceExisting: boolean) => {
    // Rebuild color ranges before saving to ensure correct mappings
    const rebuiltColorHighlights = rebuildColorRanges(lyrics, colorHighlights);
    
    const data = {
      id: editorState.songId,
      title: title.trim(),
      artist: artist.trim(),
      lyrics: lyrics.trim(),
      scrollSpeed,
      linesPerScroll,
      tempo,
      backgroundColor,
      textColor,
      textSize,
      isBold,
      colorHighlights: rebuiltColorHighlights,
      replaceExisting,
    };

    try {
      const savedId = await saveMutation.mutateAsync(data);
      
      const savedSong = {
        id: savedId,
        title: data.title,
        artist: data.artist,
        lyrics: data.lyrics,
        scrollSpeed: BigInt(data.scrollSpeed),
        tempo: BigInt(data.tempo),
        backgroundColor: data.backgroundColor,
        textColor: data.textColor,
        textSize: BigInt(data.textSize),
        isBold: data.isBold,
        linesPerScroll: BigInt(data.linesPerScroll),
        colorRanges: data.colorHighlights.map(h => ({
          start: h.start,
          end: h.end,
          color: h.color,
        })),
        createdAt: BigInt(Date.now() * 1000000),
        updatedAt: BigInt(Date.now() * 1000000),
      };
      
      await exportSongMutation.mutateAsync(savedSong);
      
      onSave();
    } catch (error) {
      console.error('Failed to save song:', error);
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

  const handleApplyTextColorInstantly = useCallback((color: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    if (start === end) return; // No selection

    // Save selection range
    selectionRef.current = { start, end };

    // Create new color highlight
    const newColorChange: ColorHighlight = {
      start: BigInt(start),
      end: BigInt(end),
      color: color,
    };

    // Add to highlights
    setColorHighlights(prev => [...prev, newColorChange]);

    // Restore selection after React updates
    requestAnimationFrame(() => {
      if (textarea && selectionRef.current) {
        textarea.focus();
        textarea.setSelectionRange(selectionRef.current.start, selectionRef.current.end);
      }
    });
  }, []);

  const handleClearTextColors = () => {
    setColorHighlights([]);
  };

  const handleLinesPerScrollChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 1 && value <= 20) {
      setLinesPerScroll(value);
    }
  };

  const handleLyricsChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    const newValue = textarea.value;
    const savedStart = textarea.selectionStart;
    const savedEnd = textarea.selectionEnd;
    
    setLyrics(newValue);
    
    // Restore cursor position after React updates
    requestAnimationFrame(() => {
      if (textarea) {
        textarea.setSelectionRange(savedStart, savedEnd);
      }
    });
  }, []);

  const handlePreviewClick = () => {
    // Rebuild color ranges before preview
    const rebuiltColorHighlights = rebuildColorRanges(lyrics, colorHighlights);
    
    // Create a preview song object with current editor state
    const previewSong: Song = {
      id: editorState.songId || 'preview',
      title: title.trim() || 'Untitled Song',
      artist: artist.trim(),
      lyrics: lyrics.trim(),
      scrollSpeed: BigInt(scrollSpeed),
      tempo: BigInt(tempo),
      backgroundColor,
      textColor,
      textSize: BigInt(textSize),
      isBold,
      linesPerScroll: BigInt(linesPerScroll),
      colorRanges: rebuiltColorHighlights.map(h => ({
        start: h.start,
        end: h.end,
        color: h.color,
      })),
      createdAt: BigInt(Date.now() * 1000000),
      updatedAt: BigInt(Date.now() * 1000000),
    };
    
    onPreview(previewSong);
  };

  const isSaving = saveMutation.isPending || exportSongMutation.isPending;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-primary mb-2">
          {editorState.mode === 'edit' ? 'Edit Song' : 'Create New Song'}
        </h2>
        <p className="text-muted-foreground">
          {editorState.mode === 'edit' 
            ? 'Make changes to the song details below. Placeholders like [2] or [5] will create blank lines in Play Mode.'
            : 'Fill in the details to create a new song. Use [N] placeholders (e.g., [2], [5]) to insert blank lines in Play Mode.'}
        </p>
      </div>

      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="space-y-6 pr-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Song Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter song title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="artist">Artist</Label>
              <Input
                id="artist"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Enter artist name"
              />
            </div>
          </div>

          {/* Lyrics Editor with Real-time Formatting */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
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
                          Select text in the editor, then click a color to apply it instantly. Selection will remain active.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Select Color</Label>
                        <div className="grid grid-cols-5 gap-2">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              onClick={() => {
                                setSelectedColor(color);
                                handleApplyTextColorInstantly(color);
                              }}
                              className={`w-10 h-10 rounded border-2 transition-all ${
                                selectedColor === color
                                  ? 'border-primary scale-110'
                                  : 'border-border hover:scale-105'
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
                          disabled={colorHighlights.length === 0}
                          className="flex-1"
                        >
                          Clear All
                        </Button>
                      </div>
                      {colorHighlights.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {colorHighlights.length} color change{colorHighlights.length !== 1 ? 's' : ''} applied
                        </p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                <div className="flex gap-1 border rounded-md">
                  <Button
                    variant={textAlign === 'left' ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setTextAlign('left')}
                    className="h-8 w-8 p-0"
                    title="Align Left"
                  >
                    <AlignLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={textAlign === 'center' ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setTextAlign('center')}
                    className="h-8 w-8 p-0"
                    title="Align Center"
                  >
                    <AlignCenter className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={textAlign === 'right' ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setTextAlign('right')}
                    className="h-8 w-8 p-0"
                    title="Align Right"
                  >
                    <AlignRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Stable textarea for editing - always visible and functional */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={lyrics}
                onChange={handleLyricsChange}
                className="w-full min-h-[500px] p-4 rounded-md border font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                style={{ 
                  backgroundColor: backgroundColor,
                  color: textColor,
                  fontSize: `${textSize}px`,
                  fontWeight: isBold ? 'bold' : 'normal',
                  textAlign: textAlign,
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                }}
                placeholder="Type or paste lyrics here..."
              />
            </div>
            
            <p className="text-xs text-muted-foreground">
              Type or paste lyrics here. Use [N] placeholders (e.g., [2], [5], [10]) to insert blank lines in Play Mode. These appear as editable text here but become invisible spacing in Play Mode. Color formatting will be visible in Play Mode.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Scroll Speed: {scrollSpeed}</Label>
              <Slider
                value={[scrollSpeed]}
                onValueChange={(v) => setScrollSpeed(v[0])}
                min={0}
                max={10}
                step={1}
              />
              <p className="text-xs text-muted-foreground">0 = Stopped, 10 = Fastest</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="linesPerScroll">Lines per Scroll</Label>
              <Input
                id="linesPerScroll"
                type="number"
                min={1}
                max={20}
                value={linesPerScroll}
                onChange={handleLinesPerScrollChange}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">Lines to scroll per increment (1-20)</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tempo (BPM): {tempo}</Label>
            <Slider
              value={[tempo]}
              onValueChange={(v) => setTempo(v[0])}
              min={40}
              max={240}
              step={1}
            />
            <p className="text-xs text-muted-foreground">Beats per minute</p>
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
              onClick={handleSaveClick}
              disabled={!title.trim() || isSaving}
              className="bg-primary hover:bg-primary/90"
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>

            <Button
              onClick={handlePreviewClick}
              disabled={!lyrics.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              <Play className="h-4 w-4 mr-2" />
              Preview
            </Button>

            <Button variant="outline" onClick={onCancel}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>

            <Button 
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

      <AlertDialog open={showTitleConflictDialog} onOpenChange={setShowTitleConflictDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Title Already Exists</AlertDialogTitle>
            <AlertDialogDescription>
              A song with the title "{conflictingSong?.title}" already exists. Would you like to replace the existing song or save this as a new song?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleTitleConflictCancel}>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={handleTitleConflictSaveAsNew}>
              Save as new
            </Button>
            <AlertDialogAction onClick={handleTitleConflictReplace} className="bg-primary hover:bg-primary/90">
              Replace existing song
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
