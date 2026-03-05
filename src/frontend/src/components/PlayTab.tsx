import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ColorRange, Song } from "../backend";
import {
  useGetSetList,
  useGetSong,
  useGetSongsInSetList,
} from "../hooks/useQueries";

interface PlayTabProps {
  songId?: string;
  setListId?: string;
  previewSong?: Song;
}

function applyTextColorChanges(
  text: string,
  colorRanges: ColorRange[],
): React.ReactElement[] {
  if (colorRanges.length === 0) {
    return [<span key="0">{text}</span>];
  }

  const sortedColorRanges = [...colorRanges].sort(
    (a, b) => Number(a.start) - Number(b.start),
  );

  const elements: React.ReactElement[] = [];
  let lastIndex = 0;

  for (const colorRange of sortedColorRanges) {
    const start = Number(colorRange.start);
    const end = Number(colorRange.end);

    if (start > lastIndex) {
      elements.push(
        <span key={`text-${lastIndex}-${start}`}>
          {text.substring(lastIndex, start)}
        </span>,
      );
    }

    elements.push(
      <span key={`color-${start}-${end}`} style={{ color: colorRange.color }}>
        {text.substring(start, end)}
      </span>,
    );

    lastIndex = end;
  }

  if (lastIndex < text.length) {
    elements.push(<span key="text-end">{text.substring(lastIndex)}</span>);
  }

  return elements;
}

function parsePlaceholders(text: string): string {
  // Replace [N] placeholders with N blank lines
  // Matches patterns like [2], [5], [10], etc.
  return text.replace(/\[(\d+)\]/g, (match, num) => {
    const count = Number.parseInt(num, 10);
    if (Number.isNaN(count) || count < 1) return match;
    // Create N newlines
    return "\n".repeat(count);
  });
}

export default function PlayTab({
  songId,
  setListId,
  previewSong,
}: PlayTabProps) {
  // Always refresh from backend - no caching
  const { data: backendSong, refetch: refetchSong } = useGetSong(songId);
  const { data: setList } = useGetSetList(setListId);
  const { data: setListSongs = [], refetch: refetchSetListSongs } =
    useGetSongsInSetList(setListId);

  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [linesPerScroll, setLinesPerScroll] = useState(1);
  const [timeSignature, setTimeSignature] = useState("4/4");
  const [customTimeSig, setCustomTimeSig] = useState("");
  const [currentBeat, setCurrentBeat] = useState(1);
  const [beatFlash, setBeatFlash] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<number | null>(null);
  const tempoIntervalRef = useRef<number | null>(null);
  const currentBeatRef = useRef(1);

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
    : setListId && setList && setListSongs.length > 0
      ? setListSongs[currentSongIndex]
      : (backendSong ?? undefined);

  // Initialize linesPerScroll from song data
  useEffect(() => {
    if (song) {
      setLinesPerScroll(Number(song.linesPerScroll) || 1);
    }
  }, [song]);

  // Reset scroll position when song changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on song identity change
  useEffect(() => {
    setScrollPosition(0);
    setIsPlaying(false);
  }, [song?.id]);

  const renderedLyrics = useMemo(() => {
    if (!song) return null;

    // Parse placeholders to convert [N] to blank lines
    const parsedLyrics = parsePlaceholders(
      song.lyrics || "No lyrics available",
    );

    // Apply color formatting from colorRanges - always fresh from current song
    return applyTextColorChanges(parsedLyrics, song.colorRanges || []);
  }, [song]);

  // Parse numerator from time signature string e.g. "4/4" → 4, "6/8" → 6
  const timeSigNumerator = useMemo(() => {
    const parts = timeSignature.split("/");
    const n = Number.parseInt(parts[0], 10);
    return Number.isNaN(n) || n < 1 ? 4 : Math.min(n, 12);
  }, [timeSignature]);

  useEffect(() => {
    if (!song) return;

    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
    }
    if (tempoIntervalRef.current) {
      clearInterval(tempoIntervalRef.current);
    }

    if (isPlaying) {
      const tempo = Number(song.tempo);
      const lineHeight = Number(song.textSize) * 1.5;
      const tempoInterval = (60 / tempo) * 1000;

      // Reset beat counter when starting
      currentBeatRef.current = 1;
      setCurrentBeat(1);

      tempoIntervalRef.current = window.setInterval(() => {
        const beat = currentBeatRef.current;

        // Scroll on beat 1 FIRST — fires at the very start of beat 1
        if (beat === 1) {
          const scrollAmount = lineHeight * linesPerScroll;
          setScrollPosition((prev) => prev + scrollAmount);
        }

        // Flash the beat circle
        setBeatFlash(true);
        setTimeout(() => setBeatFlash(false), 120);

        // Advance beat
        const nextBeat = beat >= timeSigNumerator ? 1 : beat + 1;
        currentBeatRef.current = nextBeat;
        setCurrentBeat(nextBeat);
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
  }, [isPlaying, song, linesPerScroll, timeSigNumerator]);

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

  const handleApplyCustomTimeSig = () => {
    const trimmed = customTimeSig.trim();
    if (trimmed && /^\d+\/\d+$/.test(trimmed)) {
      setTimeSignature(trimmed);
    }
  };

  const handlePreviousSong = () => {
    if (setListId && setListSongs.length > 0 && currentSongIndex > 0) {
      setCurrentSongIndex((prev) => prev - 1);
    }
  };

  const handleNextSong = () => {
    if (
      setListId &&
      setListSongs.length > 0 &&
      currentSongIndex < setListSongs.length - 1
    ) {
      setCurrentSongIndex((prev) => prev + 1);
    }
  };

  const isSetListMode = setListId && setListSongs.length > 0;

  return (
    <div className="relative h-[calc(100vh-200px)] flex flex-col">
      {/* Song Information Line at Top - Single Horizontal Line */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-card/95 backdrop-blur-sm border-b-2 border-primary">
        <div className="flex items-center justify-center px-8 py-3">
          <p className="text-lg font-semibold text-primary text-center">
            {song ? (
              <>
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
              </>
            ) : (
              <span className="text-muted-foreground font-normal text-base">
                No song loaded — select a song from the Songs page
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Lyrics Display - Center-aligned by default, scrollable area ends above transport bar */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-hidden rounded-lg mt-14 mb-32"
        style={{
          backgroundColor: song?.backgroundColor,
          color: song?.textColor,
        }}
        onWheel={handleWheel}
      >
        <div className="min-h-full flex items-center justify-center p-8">
          {song ? (
            <pre
              className="whitespace-pre-wrap text-center font-sans leading-relaxed max-w-4xl"
              style={{
                fontSize: `${song.textSize}px`,
                fontWeight: song.isBold ? "bold" : "normal",
                textAlign: "center",
              }}
            >
              {renderedLyrics}
            </pre>
          ) : (
            <p className="text-muted-foreground text-center">
              Select a song to begin
            </p>
          )}
        </div>
      </div>

      {/* Transport Controls Fixed at Bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-card border-t-2 border-primary py-3 px-4">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {/* Set List Navigation */}
          {isSetListMode && (
            <>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handlePreviousSong}
                  disabled={currentSongIndex === 0}
                  className="h-10 w-10"
                >
                  <SkipBack className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleNextSong}
                  disabled={currentSongIndex === setListSongs.length - 1}
                  className="h-10 w-10"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>
              <div className="w-px h-10 bg-border" />
            </>
          )}

          {/* Play / Pause */}
          <Button
            data-ocid="play.play_button"
            size="lg"
            onClick={togglePlay}
            disabled={!song}
            className="bg-primary hover:bg-primary/90 text-primary-foreground h-11 px-5"
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

          {/* Reset */}
          <Button
            data-ocid="play.reset_button"
            size="lg"
            variant="outline"
            onClick={resetScroll}
            disabled={!song}
            className="h-11"
          >
            <X className="h-5 w-5 mr-2" />
            Reset
          </Button>

          {/* Divider */}
          <div className="w-px h-10 bg-border" />

          {/* Time Signature */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide leading-none">
              Time Signature
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  data-ocid="play.time_signature_button"
                  type="button"
                  className="text-2xl font-bold text-primary leading-none hover:text-primary/80 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                >
                  {timeSignature}
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="center" className="w-72 p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  Choose Time Signature
                </p>
                {/* Preset grid */}
                <div className="grid grid-cols-4 gap-1.5 mb-3">
                  {[
                    "2/4",
                    "3/4",
                    "4/4",
                    "5/4",
                    "6/4",
                    "7/4",
                    "8/4",
                    "9/4",
                    "10/4",
                    "11/4",
                    "12/4",
                    "6/8",
                    "7/8",
                    "9/8",
                    "10/8",
                    "11/8",
                    "12/8",
                  ].map((sig) => (
                    <button
                      key={sig}
                      type="button"
                      onClick={() => setTimeSignature(sig)}
                      className={`rounded px-2 py-1.5 text-sm font-medium transition-colors border ${
                        timeSignature === sig
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-transparent text-foreground border-border hover:bg-muted"
                      }`}
                    >
                      {sig}
                    </button>
                  ))}
                </div>
                {/* Manual input */}
                <div className="flex gap-2">
                  <Input
                    data-ocid="play.time_signature_input"
                    placeholder="e.g. 7/4"
                    value={customTimeSig}
                    onChange={(e) => setCustomTimeSig(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplyCustomTimeSig();
                    }}
                    className="h-8 text-sm flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={handleApplyCustomTimeSig}
                    className="h-8 px-3 text-xs"
                  >
                    Set
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Large Beat-1 Circle */}
          <div
            className={`flex items-center justify-center rounded-full font-bold text-xl transition-all duration-100 select-none ${
              beatFlash && currentBeat === 1
                ? "bg-primary text-primary-foreground scale-110 shadow-lg"
                : "bg-muted/30 text-muted-foreground border-2 border-primary/40"
            }`}
            style={{ width: 56, height: 56 }}
          >
            1
          </div>

          {/* Beat Indicator Grid */}
          <div className="flex flex-col gap-1">
            {/* Top row: beats 1-6 */}
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6].map((beat) => {
                const visible = beat <= timeSigNumerator;
                const isActive = beatFlash && currentBeat === beat;
                if (!visible) return null;
                return (
                  <div
                    key={beat}
                    className={`flex items-center justify-center rounded-full text-[10px] font-bold transition-all duration-100 select-none ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent text-muted-foreground border border-border"
                    }`}
                    style={{ width: 24, height: 24 }}
                  >
                    {beat}
                  </div>
                );
              })}
            </div>
            {/* Bottom row: beats 7-12 (only shown if time sig > 6) */}
            {timeSigNumerator > 6 && (
              <div className="flex gap-1">
                {[7, 8, 9, 10, 11, 12].map((beat) => {
                  const visible = beat <= timeSigNumerator;
                  const isActive = beatFlash && currentBeat === beat;
                  if (!visible) return null;
                  return (
                    <div
                      key={beat}
                      className={`flex items-center justify-center rounded-full text-[10px] font-bold transition-all duration-100 select-none ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-transparent text-muted-foreground border border-border"
                      }`}
                      style={{ width: 24, height: 24 }}
                    >
                      {beat}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-10 bg-border" />

          {/* BPM Display */}
          <div
            data-ocid="play.bpm_display"
            className="flex flex-col items-center leading-none"
          >
            <span className="text-2xl font-bold tabular-nums">
              {song ? song.tempo.toString() : "--"}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
              BPM
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
