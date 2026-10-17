import { useState, useEffect, useCallback } from 'react';
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
  size_bytes?: number;
  modified_at?: string;
  file_type?: string;
  path?: string;
}

export interface Drive {
  drive_id: string;
  drive_name: string;
  root_item_id: string;
}

// Real Microsoft 365 SharePoint & OneDrive Connected Vaults (4 TB Storage Pool)
export const REAL_VAULT_DRIVES: Drive[] = [
  {
    drive_id: 'b!IdX34-u7eU2AqcB76OgXfRVhq7SBFw9Ap3AlWoS2USscrpxsjdDPTrcG4Ij7XcJ0',
    drive_name: 'Company Archive A (1TB)',
    root_item_id: '01SZIGEDCKPQHQXC66GBH2OGLGQVHZOMOV'
  },
  {
    drive_id: 'b!YfBLBFnRfUGJ49G5wh0dohVhq7SBFw9Ap3AlWoS2USscrpxsjdDPTrcG4Ij7XcJ0',
    drive_name: 'Company Archive B (1TB)',
    root_item_id: '01QYXCTPYHT4ZB6QDTYVF3OWKBTJN3YJC7'
  },
  {
    drive_id: 'b!LuxZGSALJUG_TKWSoIlemRVhq7SBFw9Ap3AlWoS2USscrpxsjdDPTrcG4Ij7XcJ0',
    drive_name: 'Company Archive C (1TB)',
    root_item_id: '01M75NK2QX34EXQPKVYZGKCQ6CMPTBY4UX'
  },
  {
    drive_id: 'b!2PchUiW2GE68XVurw4hPKwpUzRC-DC1DrU45xzmJ23DZnT9FvYuyTLJuiaGZu2LN',
    drive_name: 'SharePoint Documents (1TB)',
    root_item_id: 'root'
  }
];

export function useSharePointExplorer() {
  const { userId } = useAuth();
  const [drives, setDrives] = useState<Drive[]>(REAL_VAULT_DRIVES);
  const [currentDriveId, setCurrentDriveId] = useState<string | null>(REAL_VAULT_DRIVES[0].drive_id);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(REAL_VAULT_DRIVES[0].root_item_id);
  const [filesMap, setFilesMap] = useState<Record<string, FileNode[]>>({});
  const [files, setFiles] = useState<FileNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Breadcrumb Path stack
  const [breadcrumbs, setBreadcrumbs] = useState<{id: string, name: string}[]>([
    { id: REAL_VAULT_DRIVES[0].root_item_id, name: REAL_VAULT_DRIVES[0].drive_name }
  ]);

  // Explorer Navigation History Stack for Back/Forward buttons
  const [history, setHistory] = useState<{folderId: string; breadcrumbs: {id: string, name: string}[]}[]>([
    { folderId: REAL_VAULT_DRIVES[0].root_item_id, breadcrumbs: [{ id: REAL_VAULT_DRIVES[0].root_item_id, name: REAL_VAULT_DRIVES[0].drive_name }] }
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // 1. Fetch live drives on mount from Microsoft Graph via backend API
  useEffect(() => {
    let isMounted = true;
    const fetchDrives = async () => {
      try {
        const response = await fetch(`https://cadflow-api.onrender.com/api/v1/sharepoint/tree`, { 
          headers: { 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123' },
          signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error('API Tree response not OK');
        const data = await response.json();
        
        if (isMounted && Array.isArray(data.tree) && data.tree.length > 0) {
          const loadedDrives: Drive[] = data.tree.map((d: any) => ({
            drive_id: d.drive_id,
            drive_name: d.drive_name,
            root_item_id: d.root_item_id
          }));
          setDrives(loadedDrives);
          if (!loadedDrives.some(d => d.drive_id === currentDriveId)) {
            setCurrentDriveId(loadedDrives[0].drive_id);
            setCurrentFolderId(loadedDrives[0].root_item_id);
            setBreadcrumbs([{ id: loadedDrives[0].root_item_id, name: loadedDrives[0].drive_name }]);
          }
        }
      } catch (err) {
        console.warn("Using configured 4TB real storage vaults:", err);
      }
    };
    fetchDrives();
    return () => { isMounted = false; };
  }, [userId]);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const refresh = useCallback(() => setRefreshTrigger(prev => prev + 1), []);

  // 2. Fetch real contents when drive or folder changes
  useEffect(() => {
    if (!currentFolderId || !currentDriveId) return;

    let isMounted = true;
    const fetchFolder = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`https://cadflow-api.onrender.com/api/v1/sharepoint/folder/${currentDriveId}/${currentFolderId}`, { 
          headers: { 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123' },
          signal: AbortSignal.timeout(15000)
        });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.children)) {
            const currentDrive = drives.find(d => d.drive_id === currentDriveId);
            const driveName = currentDrive ? currentDrive.drive_name : 'Vault';
            const nodes: FileNode[] = data.children.map((child: any) => ({
              sharepoint_item_id: child.id,
              file_name: child.name,
              is_folder: child.is_folder,
              drive_id: currentDriveId,
              download_url: child.downloadUrl || '',
              status: child.lock_status || 'AVAILABLE',
              locked_by: child.locked_by,
              size_bytes: child.size,
              modified_at: child.lastModifiedDateTime ? new Date(child.lastModifiedDateTime).toLocaleDateString() : 'Recent',
              file_type: child.is_folder 
                ? 'File folder' 
                : (child.name.toLowerCase().endsWith('.dwg') 
                    ? 'AutoCAD Drawing (.dwg)' 
                    : child.name.toLowerCase().endsWith('.rvt') 
                      ? 'Autodesk Revit Model (.rvt)' 
                      : child.name.toLowerCase().endsWith('.pdf')
                        ? 'Adobe Acrobat Document'
                        : child.name.toLowerCase().endsWith('.zip')
                          ? 'ZIP Archive'
                          : 'Document'),
              path: `X:\\${driveName}\\${child.name}`
            }));
            if (isMounted) {
              setFiles(nodes);
              setFilesMap(prev => ({ ...prev, [currentFolderId]: nodes }));
              setIsLoading(false);
            }
            return;
          }
        }
      } catch (err) {
        console.warn("Folder fetch error:", err);
      }

      if (isMounted) {
        const cached = filesMap[currentFolderId] || [];
        setFiles(cached);
        setIsLoading(false);
      }
    };

    fetchFolder();
    return () => { isMounted = false; };
  }, [currentDriveId, currentFolderId, refreshTrigger]);

  // Navigate deeper into a folder
  const navigateToFolder = (folderId: string, folderName: string) => {
    const nextBreadcrumbs = [...breadcrumbs, { id: folderId, name: folderName }];
    setCurrentFolderId(folderId);
    setBreadcrumbs(nextBreadcrumbs);

    // Push into history stack
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push({ folderId, breadcrumbs: nextBreadcrumbs });
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  // Navigate up via breadcrumb click or Up button
  const navigateUp = (index: number) => {
    if (index < 0 || index >= breadcrumbs.length) return;
    const target = breadcrumbs[index];
    const nextBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setCurrentFolderId(target.id);
    setBreadcrumbs(nextBreadcrumbs);

    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push({ folderId: target.id, breadcrumbs: nextBreadcrumbs });
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  const navigateToParent = () => {
    if (breadcrumbs.length > 1) {
      navigateUp(breadcrumbs.length - 2);
    }
  };

  // Back / Forward Browser / Explorer Navigation
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  const goBack = () => {
    if (!canGoBack) return;
    const prev = history[historyIndex - 1];
    setHistoryIndex(historyIndex - 1);
    setCurrentFolderId(prev.folderId);
    setBreadcrumbs(prev.breadcrumbs);
  };

  const goForward = () => {
    if (!canGoForward) return;
    const next = history[historyIndex + 1];
    setHistoryIndex(historyIndex + 1);
    setCurrentFolderId(next.folderId);
    setBreadcrumbs(next.breadcrumbs);
  };

  const selectDrive = (driveId: string, driveName: string, rootItemId: string) => {
    setCurrentDriveId(driveId);
    setCurrentFolderId(rootItemId);
    const newBreadcrumbs = [{ id: rootItemId, name: driveName }];
    setBreadcrumbs(newBreadcrumbs);

    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push({ folderId: rootItemId, breadcrumbs: newBreadcrumbs });
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  // Local file manipulation (create folder, rename, delete)
  const createFolder = (folderName: string) => {
    if (!currentFolderId) return;
    const currentDrive = drives.find(d => d.drive_id === currentDriveId);
    const driveName = currentDrive ? currentDrive.drive_name : 'Vault';
    const newFolder: FileNode = {
      sharepoint_item_id: `fld_${Date.now()}`,
      file_name: folderName,
      is_folder: true,
      drive_id: currentDriveId || REAL_VAULT_DRIVES[0].drive_id,
      status: 'AVAILABLE',
      file_type: 'File folder',
      modified_at: 'Just now',
      path: `X:\\${driveName}\\${folderName}`
    };

    setFiles(prev => [...prev, newFolder]);
    setFilesMap(prev => ({
      ...prev,
      [currentFolderId]: [...(prev[currentFolderId] || []), newFolder]
    }));
  };

  const renameFile = (id: string, newName: string) => {
    setFiles(prev => prev.map(f => f.sharepoint_item_id === id ? { ...f, file_name: newName } : f));
    if (!currentFolderId) return;
    setFilesMap(prev => ({
      ...prev,
      [currentFolderId]: (prev[currentFolderId] || []).map(f => {
        if (f.sharepoint_item_id === id) {
          return { ...f, file_name: newName };
        }
        return f;
      })
    }));
  };

  const deleteFiles = (ids: Set<string>) => {
    setFiles(prev => prev.filter(f => !ids.has(f.sharepoint_item_id)));
    if (!currentFolderId) return;
    setFilesMap(prev => ({
      ...prev,
      [currentFolderId]: (prev[currentFolderId] || []).filter(f => !ids.has(f.sharepoint_item_id))
    }));
  };

  const updateFileLockStatus = (id: string, status: LockStatus, lockedBy?: string) => {
    setFiles(prev => prev.map(f => f.sharepoint_item_id === id ? { ...f, status, locked_by: lockedBy } : f));
    if (!currentFolderId) return;
    setFilesMap(prev => ({
      ...prev,
      [currentFolderId]: (prev[currentFolderId] || []).map(f => {
        if (f.sharepoint_item_id === id) {
          return { ...f, status, locked_by: lockedBy };
        }
        return f;
      })
    }));
  };

  return { 
    drives, 
    files, 
    isLoading, 
    currentDriveId, 
    currentFolderId,
    breadcrumbs, 
    navigateToFolder, 
    navigateUp, 
    navigateToParent,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    selectDrive, 
    refresh,
    createFolder,
    renameFile,
    deleteFiles,
    updateFileLockStatus
  };
}
