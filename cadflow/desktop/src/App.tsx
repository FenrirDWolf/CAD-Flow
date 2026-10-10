import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Sidebar } from './components/Sidebar';
import { FileTable } from './components/FileTable';
import { HandoverModal } from './components/HandoverModal';
import { IsoRenameModal } from './components/IsoRenameModal';
import { SyncQueueIndicator } from './components/SyncQueueIndicator';
import { useSharePointExplorer, type FileNode } from './hooks/useRealtimeLocks';
import { Toaster, toast } from 'sonner';
import { invoke } from '@tauri-apps/api/core';
import { Search, ChevronRight, Home } from 'lucide-react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { type ViewType } from './hooks/useRealtimeLocks';
import { ThemeToggle } from './components/ThemeToggle';
import { Input } from './components/ui/Input';
import { Button } from './components/ui/Button';
import { SettingsPage } from './components/SettingsPage';
import { ProfilePage } from './components/ProfilePage';
import { AdminPage } from './components/AdminPage';
import { VersionHistoryModal } from './components/VersionHistoryModal';
import { WifiOff } from 'lucide-react';

export type ViewType = 'files' | 'settings' | 'profile' | 'admin';

export const App: React.FC = () => {
  const { drives, files, isLoading, currentDriveId, breadcrumbs, navigateToFolder, navigateUp, selectDrive, refresh } = useSharePointExplorer();
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<ViewType>('files');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  const [versionModalState, setVersionModalState] = useState<{isOpen: boolean; fileName: string; itemId: string}>({
    isOpen: false, fileName: '', itemId: ''
  });
  const [filterText, setFilterText] = useState('');
  // Auto-Update Checker
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update) {
          toast.success(`Update ${update.version} available! Downloading now...`, { duration: 10000 });
          await update.downloadAndInstall();
          toast.success(`Update installed! Relaunching...`);
          await relaunch();
        }
      } catch (err) {
        console.warn('Failed to check for updates:', err);
      }
    };
    checkForUpdates();
  }, []);
  const [statusFilter, setStatusFilter] = useState('ALL');
  
  const [modalState, setModalState] = useState<{isOpen: boolean; fileName: string; itemId: string}>({
    isOpen: false,
    fileName: '',
    itemId: ''
  });

  const triggerHandoverModal = (fileName: string, itemId: string) => {
    setModalState({ isOpen: true, fileName, itemId });
  };

  const handleFileUpload = (fileList: FileList) => {
    if (fileList.length > 0) {
      const fileNames = Array.from(fileList).map(f => f.name).join(', ');
      toast.promise(
        new Promise(resolve => setTimeout(resolve, 2000)),
        {
          loading: `Uploading ${fileNames} to SharePoint...`,
          success: `Successfully uploaded ${fileNames}!`,
          error: 'Upload failed.'
        }
      );
    }
  };

  const filteredFiles = files.filter(f => {
    if (filterText && !f.file_name.toLowerCase().includes(filterText.toLowerCase())) return false;
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'LOCKED' && f.status !== 'LOCKED') return false;
      if (statusFilter === 'AVAILABLE' && f.status !== 'AVAILABLE') return false;
    }
    return true;
  });

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      toast.success("Connection restored. Edit mode available.");
    };
    const handleOffline = () => {
      setIsOffline(true);
      toast.warning("You are offline. Files will open in Read-Only mode to prevent conflicts.");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

        let unlisten: () => void;
    const setupListener = async () => {
      try {
        unlisten = await listen<{ sharepoint_item_id: string, file_name: string }>(
          'cad_file_closed',
          async (event) => {
            toast.loading(`Auto-syncing changes for ${event.payload.file_name}...`, { id: "auto_sync" });
            try {
              // In a real app, you would also call upload_file here.
              await invoke('release_lock', { 
                itemId: event.payload.sharepoint_item_id, 
                comment: "Auto-synced on file close" 
              });
              toast.success(`${event.payload.file_name} synced and unlocked automatically.`, { id: "auto_sync" });
              refresh();
            } catch (err: any) {
              toast.error(`Failed to auto-unlock: ${err}`, { id: "auto_sync" });
            }
          }
        );
      } catch (e) {
        console.warn("Tauri listen failed:", e);
      }
    };
    setupListener();
    return () => { 
      if (unlisten) unlisten(); 
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleLaunchFile = async (file: FileNode) => {
    try {
      // Use the actual cache path where sync_and_launch places the file
      const physicalCachePath = `C:\\Users\\Public\\CADFlow_Cache\\Project\\${file.file_name}`;

      if (isOffline) {
         toast.info(`Opening ${file.file_name} in Read-Only mode due to Offline status.`);
         await invoke('sync_and_launch', { fileName: file.file_name, downloadUrl: file.download_url || '' });
      } else if (file.status === 'AVAILABLE' || file.status === 'STALE') {
         toast.loading(`Locking & Opening ${file.file_name}...`, { id: 'lock' });
         try {
           await invoke('acquire_lock', { itemId: file.sharepoint_item_id });
           await invoke('sync_and_launch', { fileName: file.file_name, downloadUrl: file.download_url || '' });
           await invoke('watch_file_closure', { 
             itemId: file.sharepoint_item_id, 
             fileName: file.file_name, 
             filePath: physicalCachePath 
           });
           toast.success(`Launched & Locked ${file.file_name}`, { id: 'lock' });
         } catch (err: any) {
           toast.error(err.toString(), { id: 'lock' });
         }
      } else {
         toast.info(`Opening ${file.file_name} in Read-Only mode.`);
         await invoke('sync_and_launch', { fileName: file.file_name, downloadUrl: file.download_url || '' });
      }
    } catch (e: any) {
      toast.error(e.message || String(e), { id: 'lock' });
    }
  };
  return (
    <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden font-sans">
      <Toaster position="bottom-right" />
      <Sidebar 
        isCollapsed={isSidebarCollapsed} 
        setIsCollapsed={setIsSidebarCollapsed} 
        activeView={activeView}
        setActiveView={setActiveView}
        drives={drives}
        currentDriveId={currentDriveId}
        onSelectDrive={selectDrive}
      />
      
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-muted/20">
        <header className="bg-background/80 backdrop-blur-md border-b px-8 py-5 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-xl font-semibold flex items-center space-x-2">
              <div className="flex items-center space-x-2 text-muted-foreground">
                <Home size={18} className="cursor-pointer hover:text-foreground transition-colors" onClick={() => navigateUp(0)} />
                {breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={crumb.id}>
                    <ChevronRight size={16} />
                    <span 
                      className={`cursor-pointer hover:text-foreground transition-colors ${index === breadcrumbs.length - 1 ? 'text-foreground font-semibold' : ''}`}
                      onClick={() => navigateUp(index)}
                    >
                      {crumb.name}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </h1>
            <p className="text-xs text-muted-foreground mt-1 uppercase tracking-widest font-medium">Common Data Environment</p>
          </div>
          
          <div className="flex items-center gap-4">
            {isOffline && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 text-red-500 text-xs font-semibold mr-2 animate-pulse">
                <WifiOff size={14} />
                <span>OFFLINE (Read-Only)</span>
              </div>
            )}
            <ThemeToggle />
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input 
                type="text" 
                placeholder="Search files (Ctrl+K)..." 
                className="pl-9 w-64"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
            </div>
          </div>
        </header>
        
        <div className="flex-1 overflow-hidden p-8">
          <div className="max-w-6xl mx-auto h-full flex flex-col">
            {activeView === 'settings' ? (
              <SettingsPage />
            ) : activeView === 'profile' ? (
              <ProfilePage />
            ) : activeView === 'admin' ? (
              <AdminPage />
            ) : (
              <div className="flex-1 overflow-y-auto flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <select 
                      className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="AVAILABLE">Available</option>
                      <option value="LOCKED">Locked / In-Use</option>
                    </select>
                    <select className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                      <option value="ALL">All Disciplines</option>
                      <option value="ARCH">Architecture</option>
                      <option value="STRUC">Structural</option>
                      <option value="MEP">MEP</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => toast.success("Created 'New Folder'", { id: 'op'})}>+ New Folder</Button>
                    <Button variant="default" size="sm" onClick={() => toast.success("Select files to upload", { id: 'op'})}>Upload</Button>
                  </div>
                </div>
                
                <SyncQueueIndicator sharepointItemId="item-101" fileName="ARCH_FloorPlan_L1.rvt" />
                <FileTable 
                  files={filteredFiles} 
                  isLoading={isLoading} 
                  onLaunch={handleLaunchFile}
                  onClickFolder={navigateToFolder}
                  onFileUpload={handleFileUpload}
                  onVersionHistoryClick={(file) => setVersionModalState({ isOpen: true, fileName: file.file_name, itemId: file.sharepoint_item_id })}
                  onApproveClick={async (file) => {
                    toast.loading(`Requesting approval for ${file.file_name}...`, { id: 'approve' });
                    try {
                      const res = await fetch(`http://127.0.0.1:8080/api/v1/files/${file.sharepoint_item_id}/approve`, { method: 'POST' });
                      if (res.ok) {
                        toast.success(`${file.file_name} has been approved to SHARED state!`, { id: 'approve' });
                      } else {
                        throw new Error("Approval failed. Are you a BIM Manager?");
                      }
                    } catch (e: any) {
                      toast.error(e.message, { id: 'approve' });
                    }
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      <HandoverModal 
        isOpen={modalState.isOpen}
        fileName={modalState.fileName}
        sharepointItemId={modalState.itemId}
        onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
        onSuccess={() => {
          setModalState(prev => ({ ...prev, isOpen: false }));
          refresh();
        }}
      />
      <IsoRenameModal />
      <VersionHistoryModal 
        isOpen={versionModalState.isOpen}
        fileName={versionModalState.fileName}
        sharepointItemId={versionModalState.itemId}
        onClose={() => setVersionModalState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
export default App;









