import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
import { useState } from "react";
import type { Song } from "./backend";
import Footer from "./components/Footer";
import Header from "./components/Header";
import PlayTab from "./components/PlayTab";
import SetListsTab from "./components/SetListsTab";
import SongEditorTab from "./components/SongEditorTab";
import SongsTab from "./components/SongsTab";
import { useGetAllSetLists, useGetAllSongs } from "./hooks/useQueries";

type Tab = "songs" | "editor" | "setlists" | "play";

export interface EditorState {
  songId?: string;
  mode: "create" | "edit";
}

export interface PlayState {
  songId?: string;
  setListId?: string;
  previewSong?: Song;
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("songs");
  const [editorState, setEditorState] = useState<EditorState>({
    mode: "create",
  });
  const [playState, setPlayState] = useState<PlayState | null>(null);

  // Automatically load all songs and set lists on startup
  const { data: songs = [], isLoading: songsLoading } = useGetAllSongs();
  const { data: setLists = [], isLoading: setListsLoading } =
    useGetAllSetLists();

  // Log loaded data for verification
  useEffect(() => {
    if (!songsLoading && !setListsLoading) {
      console.log(
        `Loaded ${songs.length} songs and ${setLists.length} set lists from backend`,
      );
    }
  }, [songs.length, setLists.length, songsLoading, setListsLoading]);

  const handleEditSong = (songId: string) => {
    setEditorState({ songId, mode: "edit" });
    setActiveTab("editor");
  };

  const handlePlaySong = (songId: string) => {
    setPlayState({ songId });
    setActiveTab("play");
  };

  const handlePlaySetList = (setListId: string) => {
    setPlayState({ setListId });
    setActiveTab("play");
  };

  const handlePreviewSong = (song: Song) => {
    setPlayState({ previewSong: song });
    setActiveTab("play");
  };

  const handleAddSong = () => {
    setEditorState({ mode: "create" });
    setActiveTab("editor");
  };

  const handleEditorSave = () => {
    setActiveTab("songs");
  };

  const handleEditorCancel = () => {
    setActiveTab("songs");
  };

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <Header activeTab={activeTab} onTabChange={setActiveTab} />

        <main className="flex-1 container mx-auto px-4 py-6">
          {activeTab === "songs" && (
            <SongsTab
              onEditSong={handleEditSong}
              onPlaySong={handlePlaySong}
              onAddSong={handleAddSong}
            />
          )}

          {activeTab === "editor" && (
            <SongEditorTab
              editorState={editorState}
              onSave={handleEditorSave}
              onCancel={handleEditorCancel}
              onPreview={handlePreviewSong}
            />
          )}

          {activeTab === "setlists" && (
            <SetListsTab onPlaySetList={handlePlaySetList} />
          )}

          {activeTab === "play" && (
            <PlayTab
              songId={playState?.songId}
              setListId={playState?.setListId}
              previewSong={playState?.previewSong}
            />
          )}
        </main>

        <Footer />
        <Toaster />
      </div>
    </ThemeProvider>
  );
}

export default App;
