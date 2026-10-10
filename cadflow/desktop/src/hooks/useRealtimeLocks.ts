import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';

export type LockStatus = 'PENDING' | 'ACTIVE' | 'SYNCING' | 'STALE' | 'AVAILABLE';

export interface FileNode {
  sharepoint_item_id: string;
  file_name: string;
  status: LockStatus;
  is_folder: boolean;
  drive_id: string;
  download_url?: string;
  locked_by?: string;
}

export interface Drive {
  drive_id: string;
  drive_name: string;
  root_item_id: string;
}

export function useSharePointExplorer() {
  const { userId } = useAuth();
  const [drives, setDrives] = useState<Drive[]>([]);
  const [currentDriveId, setCurrentDriveId] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<{id: string, name: string}[]>([]);

  // 1. Fetch Drives on mount
  useEffect(() => {
    const fetchDrives = async () => {
      try {
        const response = await fetch(`http://127.0.0.1:8080/api/v1/sharepoint/tree?user_id=${userId || ''}`, { headers: { 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123' } });
        if (!response.ok) throw new Error('Failed to fetch tree');
        const data = await response.json();
        
        const loadedDrives = data.tree.map((d: any) => ({
          drive_id: d.drive_id,
          drive_name: d.drive_name,
          root_item_id: d.root_item_id
        }));
        
        setDrives(loadedDrives);
        
        // Auto-select first drive
        if (loadedDrives.length > 0) {
          setCurrentDriveId(loadedDrives[0].drive_id);
          setCurrentFolderId(loadedDrives[0].root_item_id);
          setBreadcrumbs([{ id: loadedDrives[0].root_item_id, name: loadedDrives[0].drive_name }]);
        }
      } catch (err) {
        console.error("Error fetching SharePoint drives:", err);
      }
    };
    fetchDrives();
  }, [userId]);

    const [refreshTrigger, setRefreshTrigger] = useState(0);
  const refresh = () => setRefreshTrigger(prev => prev + 1);

  // 2. Fetch contents when drive or folder changes
  useEffect(() => {
    if (!currentDriveId || !currentFolderId) return;

    const fetchFolder = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`http://127.0.0.1:8080/api/v1/sharepoint/folder/${currentDriveId}/${currentFolderId}`, { headers: { 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123' } });
        if (!response.ok) throw new Error('Failed to fetch folder');
        const data = await response.json();
        
        const nodes: FileNode[] = data.children
          .filter((child: any) => child.is_folder || child.downloadUrl)
          .map((child: any) => ({
            sharepoint_item_id: child.id,
            file_name: child.name,
            is_folder: child.is_folder,
            drive_id: currentDriveId,
            download_url: child.downloadUrl,
            status: child.lock_status || 'AVAILABLE',
            locked_by: child.locked_by
          }));
        
        setFiles(nodes);
        setIsLoading(false);
      } catch (err) {
        console.error("Error fetching folder contents:", err);
        setIsLoading(false);
      }
    };
    fetchFolder();
  }, [currentDriveId, currentFolderId, refreshTrigger]);

  const navigateToFolder = (folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setBreadcrumbs(prev => {
      if (prev.length > 0 && prev[prev.length - 1].id === folderId) {
        return prev;
      }
      return [...prev, { id: folderId, name: folderName }];
    });
  };

  const navigateUp = (index: number) => {
    const target = breadcrumbs[index];
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    setCurrentFolderId(target.id);
  };

  const selectDrive = (driveId: string, driveName: string, rootItemId: string) => {
    setCurrentDriveId(driveId);
    setCurrentFolderId(rootItemId);
    setBreadcrumbs([{ id: rootItemId, name: driveName }]);
  };

  return { drives, files, isLoading, currentDriveId, breadcrumbs, navigateToFolder, navigateUp, selectDrive, refresh };
}


