import { Music2, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDownloadBackup } from '@/hooks/useQueries';

type Tab = 'songs' | 'editor' | 'setlists' | 'play';

interface HeaderProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onAddSong: () => void;
}

export default function Header({ activeTab, onTabChange, onAddSong }: HeaderProps) {
  const downloadBackup = useDownloadBackup();

  const handleDownloadBackup = () => {
    downloadBackup.mutate();
  };

  return (
    <header className="border-b border-border bg-card">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center gap-4 mb-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="bg-accent/20 border-accent">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => onTabChange('editor')}>
                Song Editor Mode
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onTabChange('setlists')}>
                Set List Mode
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onTabChange('play')}>
                Play Mode
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onTabChange('songs')}>
                Song Mode
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadBackup}>
                Download Backup
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-lg">
              <Music2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-primary">Lyrics Manager</h1>
              <p className="text-sm text-muted-foreground">
                Organize and manage your favorite song lyrics in one place
              </p>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as Tab)}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="songs">Songs</TabsTrigger>
            <TabsTrigger value="editor">Song Editor</TabsTrigger>
            <TabsTrigger value="setlists">Set Lists</TabsTrigger>
            <TabsTrigger value="play">Play</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </header>
  );
}
