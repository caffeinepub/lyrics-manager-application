import { useState } from 'react';
import { Plus, Music, Trash2, Edit2, Download, Upload, Play, ChevronUp, ChevronDown, FolderDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useGetAllSetLists,
  useGetAllSongs,
  useCreateSetList,
  useDeleteSetList,
  useAddSongToSetList,
  useRemoveSongFromSetList,
  useUpdateSetList,
  useReorderSetListSongs,
  useMoveSongInSetList,
  useExportSetList,
  useImportSetLists,
  type SetListFileData,
} from '../hooks/useQueries';
import { toast } from 'sonner';

interface SetListsTabProps {
  onPlaySong: (songId: string) => void;
  onPlaySetList: (setListId: string) => void;
}

export default function SetListsTab({ onPlaySong, onPlaySetList }: SetListsTabProps) {
  const { data: setLists = [] } = useGetAllSetLists();
  const { data: allSongs = [] } = useGetAllSongs();
  const [selectedSetListId, setSelectedSetListId] = useState<string | null>(null);
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newSetListName, setNewSetListName] = useState('');
  const [editingSetListId, setEditingSetListId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isSongSelectionOpen, setIsSongSelectionOpen] = useState(false);
  const [editingPositions, setEditingPositions] = useState<Record<string, string>>({});
  const [isExportingAll, setIsExportingAll] = useState(false);

  const createMutation = useCreateSetList();
  const deleteMutation = useDeleteSetList();
  const addSongMutation = useAddSongToSetList();
  const removeSongMutation = useRemoveSongFromSetList();
  const updateMutation = useUpdateSetList();
  const reorderMutation = useReorderSetListSongs();
  const moveSongMutation = useMoveSongInSetList();
  const exportSetListMutation = useExportSetList();
  const importSetListsMutation = useImportSetLists();

  const selectedSetList = setLists.find(sl => sl.id === selectedSetListId);

  const handleCreateSetList = async () => {
    if (!newSetListName.trim()) return;
    const newId = await createMutation.mutateAsync({ name: newSetListName.trim(), songIds: [] });
    setNewSetListName('');
    setIsCreateDialogOpen(false);
    setSelectedSetListId(newId);
    setEditingSetListId(newId);
    setEditingName(newSetListName.trim());
  };

  const handleDeleteSetList = async (id: string) => {
    await deleteMutation.mutateAsync(id);
    if (selectedSetListId === id) {
      setSelectedSetListId(null);
      setEditingSetListId(null);
    }
  };

  const handleStartEdit = (setList: { id: string; name: string }) => {
    setSelectedSetListId(setList.id);
    setEditingSetListId(setList.id);
    setEditingName(setList.name);
    setIsSongSelectionOpen(true);
    setEditingPositions({});
  };

  const handleSaveSetList = async () => {
    if (!editingSetListId || !editingName.trim() || !selectedSetList) return;
    await updateMutation.mutateAsync({
      id: editingSetListId,
      name: editingName.trim(),
      songIds: selectedSetList.songIds,
    });
    setEditingSetListId(null);
    setEditingName('');
    setSelectedSetListId(null);
    setEditingPositions({});
  };

  const handleCancelEdit = () => {
    setEditingSetListId(null);
    setEditingName('');
    setSelectedSetListId(null);
    setEditingPositions({});
  };

  const handleToggleSong = async (songId: string) => {
    if (!selectedSetListId || !selectedSetList) return;
    
    const isInSetList = selectedSetList.songIds.includes(songId);
    
    if (isInSetList) {
      await removeSongMutation.mutateAsync({ setListId: selectedSetListId, songId });
    } else {
      await addSongMutation.mutateAsync({ setListId: selectedSetListId, songId });
    }
  };

  const handlePositionInputChange = (songId: string, value: string) => {
    // Allow typing multi-digit numbers
    setEditingPositions(prev => ({ ...prev, [songId]: value }));
  };

  const handlePositionCommit = async (songId: string) => {
    if (!selectedSetListId || !selectedSetList) return;
    
    const inputValue = editingPositions[songId];
    if (!inputValue || inputValue.trim() === '') {
      // Clear editing state if empty
      setEditingPositions(prev => {
        const newState = { ...prev };
        delete newState[songId];
        return newState;
      });
      return;
    }
    
    const newPosition = parseInt(inputValue, 10);
    
    if (isNaN(newPosition)) {
      toast.error('Please enter a valid number');
      setEditingPositions(prev => {
        const newState = { ...prev };
        delete newState[songId];
        return newState;
      });
      return;
    }
    
    const currentIndex = selectedSetList.songIds.indexOf(songId);
    if (currentIndex === -1) return;
    
    // Validate new position (1-based to 0-based)
    const targetIndex = newPosition - 1;
    if (targetIndex < 0 || targetIndex >= selectedSetList.songIds.length) {
      toast.error(`Position must be between 1 and ${selectedSetList.songIds.length}`);
      setEditingPositions(prev => {
        const newState = { ...prev };
        delete newState[songId];
        return newState;
      });
      return;
    }
    
    if (targetIndex === currentIndex) {
      // No change needed, just clear the editing state
      setEditingPositions(prev => {
        const newState = { ...prev };
        delete newState[songId];
        return newState;
      });
      return;
    }
    
    // Create new array with reordered songs
    const newSongIds = [...selectedSetList.songIds];
    // Remove from current position
    newSongIds.splice(currentIndex, 1);
    // Insert at new position
    newSongIds.splice(targetIndex, 0, songId);
    
    try {
      await reorderMutation.mutateAsync({ setListId: selectedSetListId, songIds: newSongIds });
      
      // Clear editing state after successful reorder
      setEditingPositions(prev => {
        const newState = { ...prev };
        delete newState[songId];
        return newState;
      });
    } catch (error) {
      toast.error('Failed to reorder song');
      setEditingPositions(prev => {
        const newState = { ...prev };
        delete newState[songId];
        return newState;
      });
    }
  };

  const handleMoveSong = async (songId: string, direction: 'up' | 'down') => {
    if (!selectedSetListId) return;
    
    // Clear any editing state for this song
    setEditingPositions(prev => {
      const newState = { ...prev };
      delete newState[songId];
      return newState;
    });
    
    await moveSongMutation.mutateAsync({ setListId: selectedSetListId, songId, direction });
  };

  const handleExportSetList = (setList: any) => {
    exportSetListMutation.mutate(setList);
  };

  const handleImportSetLists = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      const validSetLists: SetListFileData[] = [];
      const errors: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          
          if (!data.name || !data.songIds || !Array.isArray(data.songIds)) {
            errors.push(`${file.name}: Missing required fields or invalid format`);
            continue;
          }
          
          const setListData: SetListFileData = {
            id: data.id || '',
            name: data.name,
            songIds: data.songIds,
            createdAt: data.createdAt || Date.now().toString(),
            updatedAt: data.updatedAt || Date.now().toString(),
            exportDate: data.exportDate || new Date().toISOString(),
            version: data.version || '1.0',
          };

          validSetLists.push(setListData);
        } catch (error) {
          console.error(`Error processing ${file.name}:`, error);
          errors.push(`${file.name}: Invalid file format`);
        }
      }

      if (errors.length > 0) {
        toast.error(`Failed to import ${errors.length} file(s): ${errors.join(', ')}`);
      }

      if (validSetLists.length > 0) {
        importSetListsMutation.mutate(validSetLists);
      } else if (errors.length === 0) {
        toast.error('No valid set list files selected');
      }
    };
    input.click();
  };

  const handleExportAllSetLists = async () => {
    if (setLists.length === 0) {
      toast.error('No set lists to export');
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
          
          for (const setList of setLists) {
            const sanitizedName = setList.name.replace(/[^a-z0-9_\-]/gi, '_').substring(0, 50);
            const fileName = `${sanitizedName}_setlist.json`;
            
            // Create or get file handle
            const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
            
            // Write the file
            const setListData = {
              id: setList.id,
              name: setList.name,
              songIds: setList.songIds,
              createdAt: setList.createdAt.toString(),
              updatedAt: setList.updatedAt.toString(),
              exportDate: new Date().toISOString(),
              version: '1.0',
            };
            
            const json = JSON.stringify(setListData, null, 2);
            const writable = await fileHandle.createWritable();
            await writable.write(json);
            await writable.close();
          }
          
          toast.success(`Successfully exported ${setLists.length} set list${setLists.length !== 1 ? 's' : ''}!`);
        } catch (err: any) {
          if (err.name === 'AbortError') {
            // User cancelled
            return;
          }
          throw err;
        }
      } else {
        // Fallback: export as multiple downloads
        toast.info('Exporting set lists individually...');
        
        for (const setList of setLists) {
          await exportSetListMutation.mutateAsync(setList);
          // Small delay to prevent browser blocking multiple downloads
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        toast.success(`Exported ${setLists.length} set list${setLists.length !== 1 ? 's' : ''}!`);
      }
    } catch (error) {
      console.error('Export all set lists error:', error);
      toast.error('Failed to export all set lists');
    } finally {
      setIsExportingAll(false);
    }
  };

  const songsInSetList = selectedSetList
    ? selectedSetList.songIds
        .map(songId => allSongs.find(s => s.id === songId))
        .filter((song): song is NonNullable<typeof song> => song !== undefined)
    : [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-primary">Set Lists</h2>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={importSetListsMutation.isPending}
              >
                <Upload className="h-4 w-4 mr-2" />
                {importSetListsMutation.isPending ? 'Importing...' : 'Import'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleImportSetLists}>
                Import Set Lists
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={isExportingAll}
              >
                <Download className="h-4 w-4 mr-2" />
                {isExportingAll ? 'Exporting...' : 'Export'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportAllSetLists} disabled={setLists.length === 0}>
                <FolderDown className="h-4 w-4 mr-2" />
                Export All Set Lists
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-primary hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" />
                New
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Set List</DialogTitle>
                <DialogDescription>Give your new set list a name</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="setlist-name">Set List Name</Label>
                  <Input
                    id="setlist-name"
                    value={newSetListName}
                    onChange={(e) => setNewSetListName(e.target.value)}
                    placeholder="e.g., Sunday Service, Concert 2025"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newSetListName.trim()) {
                        handleCreateSetList();
                      }
                    }}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateSetList} disabled={!newSetListName.trim()}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-280px)]">
        {setLists.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Music className="h-12 w-12 mx-auto mb-4" />
            <p>No set lists yet. Create your first one!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {setLists.map((setList) => {
              const isEditing = editingSetListId === setList.id;
              
              if (isEditing) {
                return (
                  <div
                    key={setList.id}
                    className="p-6 bg-card border-2 border-primary rounded-lg space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor={`edit-name-${setList.id}`}>Set List Name</Label>
                      <Input
                        id={`edit-name-${setList.id}`}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && editingName.trim()) {
                            handleSaveSetList();
                          } else if (e.key === 'Escape') {
                            handleCancelEdit();
                          }
                        }}
                        className="text-lg font-semibold"
                      />
                    </div>

                    <Dialog open={isSongSelectionOpen} onOpenChange={setIsSongSelectionOpen}>
                      <DialogTrigger asChild>
                        <Button
                          className="w-full bg-primary hover:bg-primary/90 text-white"
                          size="lg"
                        >
                          <Plus className="h-5 w-5 mr-2" />
                          View & Edit Songs
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh]">
                        <DialogHeader>
                          <DialogTitle>Select Songs for {editingName}</DialogTitle>
                          <DialogDescription>
                            Check or uncheck songs to add or remove them. Type a position number and press Enter to reorder. Use arrow buttons to move songs up or down.
                          </DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="h-[500px] pr-4">
                          {allSongs.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                              <Music className="h-12 w-12 mx-auto mb-4" />
                              <p>No songs available. Create some songs first!</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {songsInSetList.length > 0 && (
                                <>
                                  <div className="text-sm font-semibold text-muted-foreground mb-2">
                                    Songs in Set List (Playback Order)
                                  </div>
                                  {songsInSetList.map((song, index) => (
                                    <div
                                      key={song.id}
                                      className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/30 rounded-lg"
                                    >
                                      <div className="flex items-center gap-2">
                                        <Input
                                          type="text"
                                          value={editingPositions[song.id] ?? (index + 1).toString()}
                                          onChange={(e) => handlePositionInputChange(song.id, e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              handlePositionCommit(song.id);
                                            } else if (e.key === 'Escape') {
                                              setEditingPositions(prev => {
                                                const newState = { ...prev };
                                                delete newState[song.id];
                                                return newState;
                                              });
                                            }
                                          }}
                                          onBlur={() => {
                                            if (editingPositions[song.id]) {
                                              handlePositionCommit(song.id);
                                            }
                                          }}
                                          className="w-16 h-9 text-center font-bold"
                                          disabled={reorderMutation.isPending}
                                        />
                                        <div className="flex flex-col gap-1">
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-5 w-5 p-0"
                                            onClick={() => handleMoveSong(song.id, 'up')}
                                            disabled={index === 0 || moveSongMutation.isPending || reorderMutation.isPending}
                                          >
                                            <ChevronUp className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-5 w-5 p-0"
                                            onClick={() => handleMoveSong(song.id, 'down')}
                                            disabled={index === songsInSetList.length - 1 || moveSongMutation.isPending || reorderMutation.isPending}
                                          >
                                            <ChevronDown className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </div>
                                      <Checkbox
                                        id={`song-${song.id}`}
                                        checked={true}
                                        onCheckedChange={() => handleToggleSong(song.id)}
                                        disabled={addSongMutation.isPending || removeSongMutation.isPending}
                                      />
                                      <label
                                        htmlFor={`song-${song.id}`}
                                        className="flex-1 cursor-pointer"
                                      >
                                        <div className="font-semibold">{song.title}</div>
                                        <div className="text-sm text-muted-foreground">
                                          {song.artist || 'Unknown Artist'}
                                        </div>
                                      </label>
                                    </div>
                                  ))}
                                  <div className="text-sm font-semibold text-muted-foreground mt-4 mb-2">
                                    Available Songs
                                  </div>
                                </>
                              )}
                              {allSongs
                                .filter(song => !selectedSetList?.songIds.includes(song.id))
                                .map((song) => (
                                  <div
                                    key={song.id}
                                    className="flex items-center gap-3 p-4 bg-card border border-border rounded-lg hover:bg-accent/10 transition-colors"
                                  >
                                    <Checkbox
                                      id={`song-${song.id}`}
                                      checked={false}
                                      onCheckedChange={() => handleToggleSong(song.id)}
                                      disabled={addSongMutation.isPending || removeSongMutation.isPending}
                                    />
                                    <label
                                      htmlFor={`song-${song.id}`}
                                      className="flex-1 cursor-pointer"
                                    >
                                      <div className="font-semibold">{song.title}</div>
                                      <div className="text-sm text-muted-foreground">
                                        {song.artist || 'Unknown Artist'}
                                      </div>
                                    </label>
                                  </div>
                                ))}
                            </div>
                          )}
                        </ScrollArea>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setIsSongSelectionOpen(false)}
                          >
                            Done
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleSaveSetList}
                        className="flex-1 bg-primary hover:bg-primary/90 text-white"
                      >
                        Save
                      </Button>
                      <Button
                        onClick={() => handleExportSetList(selectedSetList!)}
                        variant="outline"
                        className="flex-1"
                        disabled={exportSetListMutation.isPending}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {exportSetListMutation.isPending ? 'Exporting...' : 'Export'}
                      </Button>
                      <Button
                        onClick={handleCancelEdit}
                        variant="outline"
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={setList.id}
                  className="p-6 bg-card border border-border rounded-lg hover:bg-accent/10 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold truncate mb-1">{setList.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {setList.songIds.length} {setList.songIds.length === 1 ? 'Song' : 'Songs'}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleStartEdit(setList)}
                        className="h-9 w-9"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Set List</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{setList.name}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteSetList(setList.id)}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    {setList.songIds.length > 0 && (
                      <>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleStartEdit(setList)}
                        >
                          <Music className="h-4 w-4 mr-2" />
                          View & Edit Songs
                        </Button>
                        <Button
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => onPlaySetList(setList.id)}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Play
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

