import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActor } from './useActor';
import type { Song, SetList, ColorRange } from '../backend';
import { toast } from 'sonner';

// Local type for color highlights (matches backend ColorRange)
export interface ColorHighlight {
  start: bigint;
  end: bigint;
  color: string;
}

// File handle cache for persistent overwrites
const fileHandleCache = new Map<string, FileSystemFileHandle>();

// Songs Queries
export function useGetAllSongs() {
  const { actor, isFetching } = useActor();

  return useQuery<Song[]>({
    queryKey: ['songs'],
    queryFn: async () => {
      if (!actor) return [];
      const songs = await actor.getAllSongs();
      
      // Deduplicate songs by ID, keeping only the most recent version (highest updatedAt)
      const songMap = new Map<string, Song>();
      for (const song of songs) {
        const existing = songMap.get(song.id);
        if (!existing || song.updatedAt > existing.updatedAt) {
          songMap.set(song.id, song);
        }
      }
      
      // Return deduplicated and sorted songs
      return Array.from(songMap.values()).sort((a, b) => 
        a.title.localeCompare(b.title)
      );
    },
    enabled: !!actor && !isFetching,
  });
}

export function useGetSong(id: string | undefined) {
  const { actor, isFetching } = useActor();

  return useQuery<Song | null>({
    queryKey: ['song', id],
    queryFn: async () => {
      if (!actor || !id) return null;
      try {
        return await actor.getSong(id);
      } catch {
        return null;
      }
    },
    enabled: !!actor && !isFetching && !!id,
  });
}

// Check if a title already exists (for a different song)
export function useCheckTitleConflict() {
  const { data: allSongs = [] } = useGetAllSongs();

  return (title: string, currentSongId?: string): Song | null => {
    const normalizedTitle = title.trim().toLowerCase();
    const conflictingSong = allSongs.find(
      song => song.title.toLowerCase() === normalizedTitle && song.id !== currentSongId
    );
    return conflictingSong || null;
  };
}

export function useSaveSong() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      id?: string;
      title: string;
      artist: string;
      lyrics: string;
      scrollSpeed: number;
      linesPerScroll: number;
      tempo: number;
      backgroundColor: string;
      textColor: string;
      textSize: number;
      isBold: boolean;
      colorHighlights: ColorHighlight[];
      replaceExisting: boolean;
    }) => {
      if (!actor) throw new Error('Actor not initialized');
      
      // Pass the ID if we're editing, null if creating new
      const songId = data.id || null;
      
      // Convert colorHighlights to ColorRange format for backend
      const colorRanges: ColorRange[] = data.colorHighlights.map(h => ({
        start: h.start,
        end: h.end,
        color: h.color,
      }));
      
      const response = await actor.saveSong(
        songId,
        data.title,
        data.artist,
        data.lyrics,
        BigInt(data.scrollSpeed),
        BigInt(data.tempo),
        data.backgroundColor,
        data.textColor,
        BigInt(data.textSize),
        data.isBold,
        BigInt(data.linesPerScroll),
        colorRanges,
        data.replaceExisting,
        null // image parameter - not used in this application
      );
      
      if (!response.success) {
        throw new Error(response.errorMessage || 'Failed to save song');
      }
      
      return response.songId || '';
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['songs'] });
      queryClient.invalidateQueries({ queryKey: ['song'] });
      toast.success('Song saved successfully');
    },
    onError: () => {
      toast.error('Failed to save song');
    },
  });
}

export function useDeleteSong() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!actor) throw new Error('Actor not initialized');
      return actor.deleteSong(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['songs'] });
      queryClient.invalidateQueries({ queryKey: ['setlists'] });
      queryClient.invalidateQueries({ queryKey: ['setlist'] });
      toast.success('Song deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete song');
    },
  });
}

// Set Lists Queries - using exportData to get set lists
export function useGetAllSetLists() {
  const { actor, isFetching } = useActor();

  return useQuery<SetList[]>({
    queryKey: ['setlists'],
    queryFn: async () => {
      if (!actor) return [];
      const data = await actor.exportData();
      return data.setLists;
    },
    enabled: !!actor && !isFetching,
  });
}

export function useGetSetList(id: string | undefined) {
  const { data: allSetLists = [] } = useGetAllSetLists();

  return useQuery<SetList | null>({
    queryKey: ['setlist', id],
    queryFn: async () => {
      if (!id) return null;
      return allSetLists.find(sl => sl.id === id) || null;
    },
    enabled: !!id,
  });
}

export function useGetSongsInSetList(setListId: string | undefined) {
  const { actor, isFetching } = useActor();

  return useQuery<Song[]>({
    queryKey: ['setlist', setListId, 'songs'],
    queryFn: async () => {
      if (!actor || !setListId) return [];
      try {
        const songs = await actor.getSongsInSetList(setListId);
        
        // Deduplicate songs by ID, keeping only the most recent version
        const songMap = new Map<string, Song>();
        for (const song of songs) {
          const existing = songMap.get(song.id);
          if (!existing || song.updatedAt > existing.updatedAt) {
            songMap.set(song.id, song);
          }
        }
        
        return Array.from(songMap.values());
      } catch {
        return [];
      }
    },
    enabled: !!actor && !isFetching && !!setListId,
  });
}

export function useCreateSetList() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; songIds: string[] }) => {
      if (!actor) throw new Error('Actor not initialized');
      return actor.createSetList(data.name, data.songIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setlists'] });
      toast.success('Set list created successfully');
    },
    onError: () => {
      toast.error('Failed to create set list');
    },
  });
}

export function useUpdateSetList() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string; name: string; songIds: string[] }) => {
      if (!actor) throw new Error('Actor not initialized');
      return actor.updateSetList(data.id, data.name, data.songIds);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['setlists'] });
      queryClient.invalidateQueries({ queryKey: ['setlist', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['setlist', variables.id, 'songs'] });
    },
    onError: () => {
      toast.error('Failed to update set list');
    },
  });
}

export function useDeleteSetList() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!actor) throw new Error('Actor not initialized');
      return actor.deleteSetList(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setlists'] });
      toast.success('Set list deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete set list');
    },
  });
}

export function useAddSongToSetList() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { setListId: string; songId: string }) => {
      if (!actor) throw new Error('Actor not initialized');
      
      // Get current set list
      const exportData = await actor.exportData();
      const setList = exportData.setLists.find(sl => sl.id === data.setListId);
      if (!setList) throw new Error('Set list not found');
      
      // Add song if not already in list
      if (!setList.songIds.includes(data.songId)) {
        const newSongIds = [...setList.songIds, data.songId];
        await actor.updateSetList(data.setListId, setList.name, newSongIds);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['setlists'] });
      queryClient.invalidateQueries({ queryKey: ['setlist', variables.setListId] });
      queryClient.invalidateQueries({ queryKey: ['setlist', variables.setListId, 'songs'] });
      toast.success('Song added to set list');
    },
    onError: () => {
      toast.error('Failed to add song to set list');
    },
  });
}

export function useRemoveSongFromSetList() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { setListId: string; songId: string }) => {
      if (!actor) throw new Error('Actor not initialized');
      
      // Get current set list
      const exportData = await actor.exportData();
      const setList = exportData.setLists.find(sl => sl.id === data.setListId);
      if (!setList) throw new Error('Set list not found');
      
      // Remove song
      const newSongIds = setList.songIds.filter(id => id !== data.songId);
      await actor.updateSetList(data.setListId, setList.name, newSongIds);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['setlists'] });
      queryClient.invalidateQueries({ queryKey: ['setlist', variables.setListId] });
      queryClient.invalidateQueries({ queryKey: ['setlist', variables.setListId, 'songs'] });
      toast.success('Song removed from set list');
    },
    onError: () => {
      toast.error('Failed to remove song from set list');
    },
  });
}

export function useMoveSongInSetList() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { setListId: string; songId: string; direction: 'up' | 'down' }) => {
      if (!actor) throw new Error('Actor not initialized');
      
      // Get current set list
      const exportData = await actor.exportData();
      const setList = exportData.setLists.find(sl => sl.id === data.setListId);
      if (!setList) throw new Error('Set list not found');
      
      const currentIndex = setList.songIds.indexOf(data.songId);
      
      if (currentIndex === -1) {
        throw new Error('Song not found in set list');
      }
      
      // Calculate new position
      let newPosition = currentIndex;
      if (data.direction === 'up' && currentIndex > 0) {
        newPosition = currentIndex - 1;
      } else if (data.direction === 'down' && currentIndex < setList.songIds.length - 1) {
        newPosition = currentIndex + 1;
      } else {
        // No movement needed
        return;
      }
      
      // Create new array with swapped positions
      const newSongIds = [...setList.songIds];
      [newSongIds[currentIndex], newSongIds[newPosition]] = [newSongIds[newPosition], newSongIds[currentIndex]];
      
      // Update the set list with new order
      return actor.updateSetList(data.setListId, setList.name, newSongIds);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['setlists'] });
      queryClient.invalidateQueries({ queryKey: ['setlist', variables.setListId] });
      queryClient.invalidateQueries({ queryKey: ['setlist', variables.setListId, 'songs'] });
    },
    onError: () => {
      toast.error('Failed to reorder songs');
    },
  });
}

export function useReorderSetListSongs() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { setListId: string; songIds: string[] }) => {
      if (!actor) throw new Error('Actor not initialized');
      
      // Get current set list
      const exportData = await actor.exportData();
      const setList = exportData.setLists.find(sl => sl.id === data.setListId);
      if (!setList) throw new Error('Set list not found');
      
      return actor.updateSetList(data.setListId, setList.name, data.songIds);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['setlists'] });
      queryClient.invalidateQueries({ queryKey: ['setlist', variables.setListId] });
      queryClient.invalidateQueries({ queryKey: ['setlist', variables.setListId, 'songs'] });
    },
    onError: () => {
      toast.error('Failed to reorder songs');
    },
  });
}

export function useRenameSetList() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { setListId: string; newName: string }) => {
      if (!actor) throw new Error('Actor not initialized');
      
      // Get current set list
      const exportData = await actor.exportData();
      const setList = exportData.setLists.find(sl => sl.id === data.setListId);
      if (!setList) throw new Error('Set list not found');
      
      return actor.updateSetList(data.setListId, data.newName, setList.songIds);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['setlists'] });
      queryClient.invalidateQueries({ queryKey: ['setlist', variables.setListId] });
      toast.success('Set list renamed successfully');
    },
    onError: () => {
      toast.error('Failed to rename set list');
    },
  });
}

// Settings type
export interface AppSettings {
  defaultScrollSpeed: number;
  defaultLinesPerScroll: number;
  defaultTempo: number;
  defaultBackgroundColor: string;
  defaultTextColor: string;
  defaultTextSize: number;
  defaultIsBold: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultScrollSpeed: 5,
  defaultLinesPerScroll: 1,
  defaultTempo: 120,
  defaultBackgroundColor: '#000000',
  defaultTextColor: '#ffffff',
  defaultTextSize: 24,
  defaultIsBold: false,
};

// Settings management (stored in localStorage)
export function useGetSettings() {
  return useQuery<AppSettings>({
    queryKey: ['settings'],
    queryFn: () => {
      const stored = localStorage.getItem('lyricsManagerSettings');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return DEFAULT_SETTINGS;
        }
      }
      return DEFAULT_SETTINGS;
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: AppSettings) => {
      localStorage.setItem('lyricsManagerSettings', JSON.stringify(settings));
      return settings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings updated successfully');
    },
    onError: () => {
      toast.error('Failed to update settings');
    },
  });
}

// Export data type
export interface ExportData {
  songs: Song[];
  setLists: SetList[];
  settings: AppSettings;
  exportDate: string;
  version: string;
}

// Individual song export type (.json file)
export interface SongFileData {
  id: string;
  title: string;
  artist: string;
  lyrics: string;
  scrollSpeed: string;
  linesPerScroll: string;
  tempo: string;
  backgroundColor: string;
  textColor: string;
  textSize: string;
  isBold: boolean;
  colorRanges: Array<{ start: string; end: string; color: string }>;
  createdAt: string;
  updatedAt: string;
  exportDate: string;
  version: string;
}

// Individual set list export type (.json file)
export interface SetListFileData {
  id: string;
  name: string;
  songIds: string[];
  createdAt: string;
  updatedAt: string;
  exportDate: string;
  version: string;
}

// Helper function to sanitize filename
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-z0-9_\-]/gi, '_').substring(0, 50);
}

// Helper function to write file using cached handle or File System Access API with fallback
async function saveFileWithHandle(
  blob: Blob,
  suggestedName: string,
  description: string,
  cacheKey?: string
): Promise<{ success: boolean; path?: string }> {
  const supportsFileSystemAccess = 'showSaveFilePicker' in window;
  
  if (supportsFileSystemAccess) {
    try {
      let handle: FileSystemFileHandle;
      
      // Check if we have a cached handle for this export
      if (cacheKey && fileHandleCache.has(cacheKey)) {
        handle = fileHandleCache.get(cacheKey)!;
        
        // Try to use the cached handle, if it fails we'll prompt for a new one
        try {
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return { success: true, path: handle.name };
        } catch (err) {
          // Handle is invalid or permission denied, remove from cache and prompt user
          console.log('Cached handle invalid, prompting for new location');
          fileHandleCache.delete(cacheKey);
        }
      }
      
      // No cached handle or cached handle failed, prompt user
      handle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: [{
          description,
          accept: { 'application/json': ['.json'] },
        }],
      });
      
      // Cache the handle if a cache key is provided
      if (cacheKey) {
        fileHandleCache.set(cacheKey, handle);
      }
      
      // Write the file
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      
      return { success: true, path: handle.name };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false }; // User cancelled
      }
      console.error('File System Access API error:', err);
      // Fall through to fallback
    }
  }
  
  // Fallback: traditional download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { success: true, path: suggestedName };
}

// Import/Export with settings
export function useExportData() {
  const { actor } = useActor();
  const { data: settings } = useGetSettings();

  return useMutation({
    mutationFn: async (options?: { silent?: boolean }) => {
      if (!actor) throw new Error('Actor not initialized');
      const backendData = await actor.exportData();
      
      // Deduplicate songs before export
      const songMap = new Map<string, Song>();
      for (const song of backendData.songs) {
        const existing = songMap.get(song.id);
        if (!existing || song.updatedAt > existing.updatedAt) {
          songMap.set(song.id, song);
        }
      }
      
      const exportData: ExportData = {
        songs: Array.from(songMap.values()).sort((a, b) => 
          a.title.localeCompare(b.title)
        ),
        setLists: backendData.setLists,
        settings: settings || DEFAULT_SETTINGS,
        exportDate: new Date().toISOString(),
        version: '1.0',
      };
      
      return { exportData, silent: options?.silent || false };
    },
    onSuccess: async ({ exportData, silent }) => {
      const json = JSON.stringify(exportData, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value
      , 2);
      const blob = new Blob([json], { type: 'application/json' });
      
      const result = await saveFileWithHandle(
        blob,
        'Lyrics Manager.json',
        'Lyrics Manager Data',
        'full-export'
      );
      
      if (result.success && !silent) {
        toast.success(`Exported to ${result.path || 'Lyrics Manager.json'}`);
      }
    },
    onError: () => {
      toast.error('Failed to export data');
    },
  });
}

export function useImportData() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ExportData | { 
      songs: Song[]; 
      setLists: SetList[];
      settings?: AppSettings;
    }) => {
      if (!actor) throw new Error('Actor not initialized');
      
      // Deduplicate songs before import
      const songMap = new Map<string, Song>();
      for (const song of data.songs) {
        const existing = songMap.get(song.id);
        if (!existing || song.updatedAt > existing.updatedAt) {
          songMap.set(song.id, song);
        }
      }
      
      // Import backend data with deduplicated songs
      await actor.importData({
        songs: Array.from(songMap.values()),
        setLists: data.setLists,
      });
      
      // Import settings if present
      if (data.settings) {
        localStorage.setItem('lyricsManagerSettings', JSON.stringify(data.settings));
      }
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['songs'] });
      queryClient.invalidateQueries({ queryKey: ['setlists'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      
      const songCount = data.songs.length;
      const setListCount = data.setLists.length;
      toast.success(`Data imported successfully! Restored ${songCount} song${songCount !== 1 ? 's' : ''} and ${setListCount} set list${setListCount !== 1 ? 's' : ''}.`);
    },
    onError: (error) => {
      console.error('Import error:', error);
      toast.error('Failed to import data. Please check the file format.');
    },
  });
}

// Download Backup hook
export function useDownloadBackup() {
  const { actor } = useActor();
  const { data: settings } = useGetSettings();

  return useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error('Actor not initialized');
      const backendData = await actor.exportData();
      
      // Deduplicate songs before export
      const songMap = new Map<string, Song>();
      for (const song of backendData.songs) {
        const existing = songMap.get(song.id);
        if (!existing || song.updatedAt > existing.updatedAt) {
          songMap.set(song.id, song);
        }
      }
      
      const exportData: ExportData = {
        songs: Array.from(songMap.values()).sort((a, b) => 
          a.title.localeCompare(b.title)
        ),
        setLists: backendData.setLists,
        settings: settings || DEFAULT_SETTINGS,
        exportDate: new Date().toISOString(),
        version: '1.0',
      };
      
      return exportData;
    },
    onSuccess: async (exportData) => {
      const json = JSON.stringify(exportData, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value
      , 2);
      const blob = new Blob([json], { type: 'application/json' });
      
      const result = await saveFileWithHandle(
        blob,
        'Lyrics Manager.json',
        'Lyrics Manager Backup',
        'full-export'
      );
      
      if (result.success) {
        toast.success(`Backup saved to ${result.path || 'Lyrics Manager.json'}`);
      }
    },
    onError: () => {
      toast.error('Failed to download backup');
    },
  });
}

// Export individual song as .json file
export function useExportSong() {
  return useMutation({
    mutationFn: async (song: Song & { colorRanges?: ColorRange[] }) => {
      const songData: SongFileData = {
        id: song.id,
        title: song.title,
        artist: song.artist,
        lyrics: song.lyrics,
        scrollSpeed: song.scrollSpeed.toString(),
        linesPerScroll: song.linesPerScroll.toString(),
        tempo: song.tempo.toString(),
        backgroundColor: song.backgroundColor,
        textColor: song.textColor,
        textSize: song.textSize.toString(),
        isBold: song.isBold,
        colorRanges: (song.colorRanges || []).map(r => ({
          start: r.start.toString(),
          end: r.end.toString(),
          color: r.color,
        })),
        createdAt: song.createdAt.toString(),
        updatedAt: song.updatedAt.toString(),
        exportDate: new Date().toISOString(),
        version: '1.0',
      };
      
      return { song, songData };
    },
    onSuccess: async ({ song, songData }) => {
      const json = JSON.stringify(songData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      
      // Generate filename: SONGTITLE_song.json
      const sanitizedTitle = sanitizeFileName(song.title);
      const defaultFileName = `${sanitizedTitle}_song.json`;
      
      const result = await saveFileWithHandle(
        blob,
        defaultFileName,
        'Lyrics Manager Song'
      );
      
      if (result.success) {
        toast.success(`Exported to Songs/${result.path || defaultFileName}`);
      }
    },
    onError: () => {
      toast.error('Failed to export song');
    },
  });
}

// Import individual songs from .json or .lms files (supports multiple files)
export function useImportSongs() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (songFiles: SongFileData[]) => {
      if (!actor) throw new Error('Actor not initialized');
      
      const importedSongs: string[] = [];
      
      for (const songData of songFiles) {
        // Convert colorRanges from string format to bigint
        const colorRanges: ColorRange[] = (songData.colorRanges || []).map(r => ({
          start: BigInt(r.start),
          end: BigInt(r.end),
          color: r.color,
        }));
        
        // Import each song individually using saveSong
        const response = await actor.saveSong(
          null, // New song
          songData.title,
          songData.artist,
          songData.lyrics,
          BigInt(songData.scrollSpeed || '5'),
          BigInt(songData.tempo),
          songData.backgroundColor,
          songData.textColor,
          BigInt(songData.textSize),
          songData.isBold,
          BigInt(songData.linesPerScroll || '1'),
          colorRanges,
          false, // Don't replace existing
          null // image parameter - not used in this application
        );
        
        if (response.success && response.songId) {
          importedSongs.push(response.songId);
        }
      }
      
      return importedSongs;
    },
    onSuccess: (importedSongs) => {
      queryClient.invalidateQueries({ queryKey: ['songs'] });
      const count = importedSongs.length;
      toast.success(`${count} song${count !== 1 ? 's' : ''} imported successfully!`);
    },
    onError: (error) => {
      console.error('Import songs error:', error);
      toast.error('Failed to import songs. Please check the file format.');
    },
  });
}

// Export individual set list as .json file with persistent handle caching
export function useExportSetList() {
  return useMutation({
    mutationFn: async (setList: SetList) => {
      const setListData: SetListFileData = {
        id: setList.id,
        name: setList.name,
        songIds: setList.songIds,
        createdAt: setList.createdAt.toString(),
        updatedAt: setList.updatedAt.toString(),
        exportDate: new Date().toISOString(),
        version: '1.0',
      };
      
      return { setList, setListData };
    },
    onSuccess: async ({ setList, setListData }) => {
      const json = JSON.stringify(setListData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      
      // Generate filename: <SetListName>_setlist.json
      const sanitizedName = sanitizeFileName(setList.name);
      const defaultFileName = `${sanitizedName}_setlist.json`;
      
      // Use persistent handle caching with setList ID as cache key
      const result = await saveFileWithHandle(
        blob,
        defaultFileName,
        'Lyrics Manager Set List',
        `setlist-${setList.id}`
      );
      
      if (result.success) {
        toast.success(`Exported to SetLists/${result.path || defaultFileName}`, {
          duration: 3000,
        });
      }
    },
    onError: () => {
      toast.error('Failed to export set list');
    },
  });
}

// Import individual set lists from .json files (supports multiple files)
export function useImportSetLists() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (setListFiles: SetListFileData[]) => {
      if (!actor) throw new Error('Actor not initialized');
      
      const setListsToImport: Array<{ id: string; name: string }> = [];
      
      for (const setListData of setListFiles) {
        // Create the set list
        const createdId = await actor.createSetList(setListData.name, setListData.songIds);
        setListsToImport.push({ id: createdId, name: setListData.name });
      }
      
      return setListsToImport;
    },
    onSuccess: (setListsToImport) => {
      queryClient.invalidateQueries({ queryKey: ['setlists'] });
      const count = setListsToImport.length;
      toast.success(`${count} set list${count !== 1 ? 's' : ''} imported successfully!`);
    },
    onError: (error) => {
      console.error('Import set lists error:', error);
      toast.error('Failed to import set lists. Please check the file format.');
    },
  });
}
