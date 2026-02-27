import { useState } from 'react';
import { Search, Plus, Download, Upload, Music, FolderDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  useGetAllSongs, 
  useExportData, 
  useImportData, 
  useDeleteSong, 
  useExportSong,
  useImportSongs,
  type ExportData,
  type SongFileData 
} from '../hooks/useQueries';
import { toast } from 'sonner';

interface SongsTabProps {
  onEditSong: (songId: string) => void;
  onPlaySong: (songId: string) => void;
  onAddSong: () => void;
}

export default function SongsTab({ onEditSong, onPlaySong, onAddSong }: SongsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exportConfirmDialogOpen, setExportConfirmDialogOpen] = useState(false);
  const [songToDelete, setSongToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isExportingAll, setIsExportingAll] = useState(false);
  
  const { data: allSongs = [], isLoading } = useGetAllSongs();
  const exportMutation = useExportData();
  const importMutation = useImportData();
  const deleteMutation = useDeleteSong();
  const exportSongMutation = useExportSong();
  const importSongsMutation = useImportSongs();

  // Filter songs based on search term
  const songs = searchTerm.trim()
    ? allSongs.filter(song => 
        song.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        song.artist.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : allSongs;

  const handleImportAll = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Validate the data structure
        if (!data.songs || !Array.isArray(data.songs)) {
          toast.error('Invalid file format: missing songs array');
          return;
        }
        
        if (!data.setLists || !Array.isArray(data.setLists)) {
          toast.error('Invalid file format: missing setLists array');
          return;
        }
        
        // Convert string numbers back to bigints
        const processedData: ExportData = {
          songs: data.songs.map((song: any) => ({
            id: song.id,
            title: song.title,
            artist: song.artist,
            lyrics: song.lyrics,
            scrollSpeed: BigInt(song.scrollSpeed || '5'),
            tempo: BigInt(song.tempo),
            backgroundColor: song.backgroundColor,
            textColor: song.textColor,
            textSize: BigInt(song.textSize),
            isBold: song.isBold || false,
            linesPerScroll: BigInt(song.linesPerScroll || '1'),
            colorRanges: (song.colorRanges || []).map((r: any) => ({
              start: BigInt(r.start),
              end: BigInt(r.end),
              color: r.color,
            })),
            createdAt: BigInt(song.createdAt),
            updatedAt: BigInt(song.updatedAt),
          })),
          setLists: data.setLists.map((setList: any) => ({
            id: setList.id,
            name: setList.name,
            songIds: Array.isArray(setList.songIds) ? setList.songIds : [],
            createdAt: BigInt(setList.createdAt),
            updatedAt: BigInt(setList.updatedAt),
          })),
          settings: data.settings,
          exportDate: data.exportDate || new Date().toISOString(),
          version: data.version || '1.0',
        };

        importMutation.mutate(processedData);
      } catch (error) {
        console.error('Import error:', error);
        toast.error('Failed to import data. Please check the file format.');
      }
    };
    input.click();
  };

  const handleImportSongOnly = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.lms,application/json';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      const validSongs: SongFileData[] = [];
      const errors: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          
          if (!data.title || !data.artist || !data.lyrics) {
            errors.push(`${file.name}: Missing required fields`);
            continue;
          }
          
          const songData: SongFileData = {
            id: data.id || '',
            title: data.title,
            artist: data.artist,
            lyrics: data.lyrics,
            scrollSpeed: data.scrollSpeed || '5',
            linesPerScroll: data.linesPerScroll || '1',
            tempo: data.tempo || '120',
            backgroundColor: data.backgroundColor || '#000000',
            textColor: data.textColor || '#ffffff',
            textSize: data.textSize || '24',
            isBold: data.isBold || false,
            colorRanges: (data.colorRanges || data.colorHighlights || []).map((r: any) => ({
              start: r.start?.toString() || '0',
              end: r.end?.toString() || '0',
              color: r.color || '#ffffff',
            })),
            createdAt: data.createdAt || Date.now().toString(),
            updatedAt: data.updatedAt || Date.now().toString(),
            exportDate: data.exportDate || new Date().toISOString(),
            version: data.version || '1.0',
          };

          validSongs.push(songData);
        } catch (error) {
          console.error(`Error processing ${file.name}:`, error);
          errors.push(`${file.name}: Invalid file format`);
        }
      }

      if (errors.length > 0) {
        toast.error(`Failed to import ${errors.length} file(s): ${errors.join(', ')}`);
      }

      if (validSongs.length > 0) {
        importSongsMutation.mutate(validSongs);
      } else if (errors.length === 0) {
        toast.error('No valid song files selected');
      }
    };
    input.click();
  };

  const handleExportClick = () => {
    setExportConfirmDialogOpen(true);
  };

  const handleExportConfirm = () => {
    setExportConfirmDialogOpen(false);
    exportMutation.mutate({ silent: false });
  };

  const handleExportCancel = () => {
    setExportConfirmDialogOpen(false);
  };

  const handleExportAllSongs = async () => {
    if (allSongs.length === 0) {
      toast.error('No songs to export');
      return;
    }

    setIsExportingAll(true);
    
    try {
      // Check if File System Access API is supported
      const supportsFileSystemAccess = 'showDirectoryPicker' in window;
      
      if (supportsFileSystemAccess) {
        try {
          // Let user select a directory
          const dirHandle = await (window as any).showDirectoryPicker();
          
          for (const song of allSongs) {
            const sanitizedTitle = song.title.replace(/[^a-z0-9_\-]/gi, '_').substring(0, 50);
            const fileName = `${sanitizedTitle}_song.json`;
            
            // Create or get file handle
            const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
            
            // Write the file
            const songData = {
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
              colorRanges: song.colorRanges.map(r => ({
                start: r.start.toString(),
                end: r.end.toString(),
                color: r.color,
              })),
              createdAt: song.createdAt.toString(),
              updatedAt: song.updatedAt.toString(),
              exportDate: new Date().toISOString(),
              version: '1.0',
            };
            
            const json = JSON.stringify(songData, null, 2);
            const writable = await fileHandle.createWritable();
            await writable.write(json);
            await writable.close();
          }
          
          toast.success(`Successfully exported ${allSongs.length} song${allSongs.length !== 1 ? 's' : ''}!`);
        } catch (err: any) {
          if (err.name === 'AbortError') {
            // User cancelled
            return;
          }
          throw err;
        }
      } else {
        // Fallback: export as multiple downloads
        toast.info('Exporting songs individually...');
        
        for (const song of allSongs) {
          await exportSongMutation.mutateAsync(song);
          // Small delay to prevent browser blocking multiple downloads
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        toast.success(`Exported ${allSongs.length} song${allSongs.length !== 1 ? 's' : ''}!`);
      }
    } catch (error) {
      console.error('Export all songs error:', error);
      toast.error('Failed to export all songs');
    } finally {
      setIsExportingAll(false);
    }
  };

  const handleDeleteClick = (songId: string, songTitle: string) => {
    setSongToDelete({ id: songId, title: songTitle });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (songToDelete) {
      await deleteMutation.mutateAsync(songToDelete.id);
      setDeleteDialogOpen(false);
      setSongToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSongToDelete(null);
  };

  const handleExportSong = (song: any) => {
    exportSongMutation.mutate(song);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title or artist..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                disabled={importMutation.isPending || importSongsMutation.isPending}
              >
                <Upload className="h-4 w-4 mr-2" />
                {importMutation.isPending || importSongsMutation.isPending ? 'Importing...' : 'Import'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleImportAll}>
                Import All Data
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleImportSongOnly}>
                Import Song Only
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                disabled={exportMutation.isPending || isExportingAll}
              >
                <Download className="h-4 w-4 mr-2" />
                {exportMutation.isPending || isExportingAll ? 'Exporting...' : 'Export'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportClick}>
                Export All Data
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportAllSongs} disabled={allSongs.length === 0}>
                <FolderDown className="h-4 w-4 mr-2" />
                Export All Songs
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button onClick={onAddSong} className="bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" />
            Add Song
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-280px)]">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading songs...</div>
        ) : songs.length === 0 ? (
          <div className="text-center py-12">
            <Music className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              {searchTerm ? 'No songs found matching your search' : 'No songs yet. Add your first song!'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {songs.map((song, index) => (
              <div
                key={song.id}
                className="flex items-center gap-4 p-4 bg-card border border-border rounded-lg hover:bg-accent/10 transition-colors"
              >
                <div className="flex items-center justify-center w-10 h-10 bg-primary/20 rounded-lg flex-shrink-0">
                  <Music className="h-5 w-5 text-primary" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-mono text-sm">{index + 1}.</span>
                    <h3 className="font-semibold truncate">{song.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{song.artist || 'Unknown Artist'}</p>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    onClick={() => handleExportSong(song)}
                    disabled={exportSongMutation.isPending}
                    className="bg-[oklch(0.65_0.25_280)] hover:bg-[oklch(0.60_0.25_280)] text-white"
                    title="Export this song as .json file"
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteClick(song.id, song.title)}
                    className="h-9 w-9 p-0 text-xl"
                    title="Delete song"
                  >
                    🗑️
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onEditSong(song.id)}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    EDIT
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onPlaySong(song.id)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    PLAY
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <AlertDialog open={exportConfirmDialogOpen} onOpenChange={setExportConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Export Data</AlertDialogTitle>
            <AlertDialogDescription>
              Save changes before exporting?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleExportCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleExportConfirm} className="bg-primary hover:bg-primary/90">
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Song</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{songToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
