import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, X, SkipForward, SkipBack } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useGetSong, useGetSetList, useGetSongsInSetList } from '../hooks/useQueries';
import type { Song, ColorRange } from '../backend';

interface PlayTabProps {
  songId?: string;
  setListId?: string;
  previewSong?: Song;
}

function applyTextColorChanges(text: string, colorRanges: ColorRange[]): React.ReactElement[] {
  if (colorRanges.length === 0) {
    return [<span key="0">{text}</span>];
  }

  const sortedColorRanges = [...colorRanges].sort((a, b) => 
    Number(a.start) - Number(b.start)
  );

  const elements: React.ReactElement[] = [];
  let lastIndex = 0;

  sortedColorRanges.forEach((colorRange, idx) => {
    const start = Number(colorRange.start);
    const end = Number(colorRange.end);

    if (start > lastIndex) {
      elements.push(
        <span key={`text-${idx}`}>
          {text.substring(lastIndex, start)}
        </span>
      );
    }

    elements.push(
      <span
        key={`color-${idx}`}
        style={{ color: colorRange.color }}
      >
        {text.substring(start, end)}
      </span>
    );

    lastIndex = end;
  });

  if (lastIndex < text.length) {
    elements.push(
      <span key="text-end">
        {text.substring(lastIndex)}
      </span>
    );
  }

  return elements;
}

function parsePlaceholders(text: string): string {
  // Replace [N] placeholders with N blank lines
  // Matches patterns like [2], [5], [10], etc.
  return text.replace(/\[(\d+)\]/g, (match, num) => {
    const count = parseInt(num, 10);
    if (isNaN(count) || count < 1) return match;
    // Create N newlines
    return '\n'.repeat(count);
  });
}

export default function PlayTab({ songId, setListId, previewSong }: PlayTabProps) {
  // Always refresh from backend - no caching
  const { data: backendSong, refetch: refetchSong } = useGetSong(songId);
  const { data: setList } = useGetSetList(setListId);
  const { data: setListSongs = [], refetch: refetchSetListSongs } = useGetSongsInSetList(setListId);
  
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [linesPerScroll, setLinesPerScroll] = useState(1);
  const [tempoFlash, setTempoFlash] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<number | null>(null);
  const tempoIntervalRef = useRef<number | null>(null);

  // Force refresh from backend on mount and when IDs change
  useEffect(() => {
    if (songId) {
      refetchSong();
    }
    if (setListId) {
      refetchSetListSongs();
    }
  }, [songId, setListId, refetchSong, refetchSetListSongs]);

  // Determine current song - prioritize preview, then backend data
  const song: Song | undefined = previewSong 
    ? previewSong
    : (setListId && setList && setListSongs.length > 0
      ? setListSongs[currentSongIndex]
      : (backendSong ?? undefined));

  // Initialize linesPerScroll from song data
  useEffect(() => {
    if (song) {
      setLinesPerScroll(Number(song.linesPerScroll) || 1);
    }
  }, [song]);

  // Reset scroll position when song changes
  useEffect(() => {
    setScrollPosition(0);
    setIsPlaying(false);
  }, [currentSongIndex, songId, setListId, previewSong]);

  const renderedLyrics = useMemo(() => {
    if (!song) return null;
    
    // Parse placeholders to convert [N] to blank lines
    const parsedLyrics = parsePlaceholders(song.lyrics || 'No lyrics available');
    
    // Apply color formatting from colorRanges - always fresh from current song
    return applyTextColorChanges(parsedLyrics, song.colorRanges || []);
  }, [song]);

  const getLineHeight = () => {
    if (!song) return 0;
    const fontSize = Number(song.textSize);
    return fontSize * 1.5;
  };

  useEffect(() => {
    if (!song) return;

    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
    }
    if (tempoIntervalRef.current) {
      clearInterval(tempoIntervalRef.current);
    }

    if (isPlaying) {
      const scrollSpeed = Number(song.scrollSpeed);
      const tempo = Number(song.tempo);
      
      if (scrollSpeed === 0) {
        return;
      }
      
      const beatsPerScroll = Math.max(0.1, 8 - (scrollSpeed / 10) * 7.9);
      const scrollInterval = (beatsPerScroll / tempo) * 60000;
      
      scrollIntervalRef.current = window.setInterval(() => {
        const lineHeight = getLineHeight();
        const scrollAmount = lineHeight * linesPerScroll;
        setScrollPosition(prev => prev + scrollAmount);
      }, scrollInterval);

      const tempoInterval = (60 / tempo) * 1000;
      
      tempoIntervalRef.current = window.setInterval(() => {
        setTempoFlash(true);
        setTimeout(() => setTempoFlash(false), 100);
      }, tempoInterval);
    }

    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
      if (tempoIntervalRef.current) {
        clearInterval(tempoIntervalRef.current);
      }
    };
  }, [isPlaying, song, linesPerScroll]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollPosition;
    }
  }, [scrollPosition]);

  // Handle mouse wheel scrolling only when paused
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!isPlaying && scrollContainerRef.current) {
      e.preventDefault();
      const newPosition = scrollPosition + e.deltaY;
      setScrollPosition(Math.max(0, newPosition));
    }
  };

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const resetScroll = () => {
    setScrollPosition(0);
    setIsPlaying(false);
  };

  const handleLinesPerScrollChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 1 && value <= 20) {
      setLinesPerScroll(value);
    }
  };

  const handlePreviousSong = () => {
    if (setListId && setListSongs.length > 0 && currentSongIndex > 0) {
      setCurrentSongIndex(prev => prev - 1);
    }
  };

  const handleNextSong = () => {
    if (setListId && setListSongs.length > 0 && currentSongIndex < setListSongs.length - 1) {
      setCurrentSongIndex(prev => prev + 1);
    }
  };

  if (!song) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <p className="text-muted-foreground">Loading song...</p>
      </div>
    );
  }

  const isSetListMode = setListId && setListSongs.length > 0;

  return (
    <div className="relative h-[calc(100vh-200px)] flex flex-col">
      {/* Song Information Line at Top - Single Horizontal Line */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-card/95 backdrop-blur-sm border-b-2 border-primary">
        <div className="flex items-center justify-center px-8 py-3">
          <p className="text-lg font-semibold text-primary text-center">
            {song.title}
            {song.artist && (
              <>
                <span className="mx-2">·</span>
                {song.artist}
              </>
            )}
            {isSetListMode && (
              <>
                <span className="mx-2">·</span>
                Song {currentSongIndex + 1} of {setListSongs.length}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Lyrics Display - Center-aligned by default, scrollable area ends above transport bar */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-hidden rounded-lg mt-14 mb-32"
        style={{
          backgroundColor: song.backgroundColor,
          color: song.textColor,
        }}
        onWheel={handleWheel}
      >
        <div className="min-h-full flex items-center justify-center p-8">
          <pre
            className="whitespace-pre-wrap text-center font-sans leading-relaxed max-w-4xl"
            style={{
              fontSize: `${song.textSize}px`,
              fontWeight: song.isBold ? 'bold' : 'normal',
              textAlign: 'center',
            }}
          >
            {renderedLyrics}
          </pre>
        </div>
      </div>

      {/* Transport Controls Fixed at Bottom - No Overlap */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-card border-t-2 border-primary py-4">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center gap-4">
            {/* Set List Navigation */}
            {isSetListMode && (
              <div className="flex items-center gap-2 pr-4 border-r border-border">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handlePreviousSong}
                  disabled={currentSongIndex === 0}
                  className="h-12 w-12"
                >
                  <SkipBack className="h-5 w-5" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleNextSong}
                  disabled={currentSongIndex === setListSongs.length - 1}
                  className="h-12 w-12"
                >
                  <SkipForward className="h-5 w-5" />
                </Button>
              </div>
            )}

            {/* Play/Pause Controls */}
            <div className="flex items-center gap-3">
              <Button
                size="lg"
                onClick={togglePlay}
                className="bg-primary hover:bg-primary/90 h-12 px-6"
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-5 w-5 mr-2" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 mr-2" />
                    Play
                  </>
                )}
              </Button>
              
              <Button
                size="lg"
                variant="outline"
                onClick={resetScroll}
                className="h-12"
              >
                <X className="h-5 w-5 mr-2" />
                Reset
              </Button>
            </div>

            {/* Lines per Scroll Control */}
            <div className="flex items-center gap-2 pl-4 border-l border-border">
              <div className="flex flex-col gap-1">
                <Label htmlFor="linesPerScrollPlay" className="text-xs">Lines per Scroll</Label>
                <Input
                  id="linesPerScrollPlay"
                  type="number"
                  min={1}
                  max={20}
                  value={linesPerScroll}
                  onChange={handleLinesPerScrollChange}
                  className="w-20 h-8 text-sm"
                />
              </div>
            </div>

            {/* Tempo Indicator */}
            <div className="flex items-center gap-3 pl-4 border-l border-border">
              <div
                className={`w-12 h-12 rounded-full border-4 transition-all duration-100 ${
                  tempoFlash
                    ? 'bg-primary border-primary scale-110'
                    : 'bg-transparent border-primary/30'
                }`}
              />
              <div className="text-sm">
                <div className="font-semibold text-lg">{song.tempo.toString()}</div>
                <div className="text-muted-foreground text-xs">BPM</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
