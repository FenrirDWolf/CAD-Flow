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

// Built-in initial Common Data Environment (ISO 19650) structure for zero-friction turnkey operation
const DEFAULT_DRIVES: Drive[] = [
  {
    drive_id: 'drive_london_hub',
    drive_name: 'London Commercial Hub (ISO 19650)',
    root_item_id: 'root_london_hub'
  },
  {
    drive_id: 'drive_bangalore_campus',
    drive_name: 'Bangalore Tech Park Campus',
    root_item_id: 'root_bangalore_campus'
  }
];

const DEFAULT_FILES_MAP: Record<string, FileNode[]> = {
  'root_london_hub': [
    {
      sharepoint_item_id: 'fld_wip',
      file_name: '01_Work-In-Progress (WIP)',
      is_folder: true,
      drive_id: 'drive_london_hub',
      status: 'AVAILABLE',
      file_type: 'File folder',
      modified_at: 'Today at 16:30',
      path: 'X:\\London Commercial Hub\\01_Work-In-Progress (WIP)'
    },
    {
      sharepoint_item_id: 'fld_shared',
      file_name: '02_Shared (ISO 19650)',
      is_folder: true,
      drive_id: 'drive_london_hub',
      status: 'AVAILABLE',
      file_type: 'File folder',
      modified_at: 'Yesterday at 18:00',
      path: 'X:\\London Commercial Hub\\02_Shared (ISO 19650)'
    },
    {
      sharepoint_item_id: 'fld_published',
      file_name: '03_Published Deliverables',
      is_folder: true,
      drive_id: 'drive_london_hub',
      status: 'AVAILABLE',
      file_type: 'File folder',
      modified_at: '14-Oct-2026',
      path: 'X:\\London Commercial Hub\\03_Published Deliverables'
    },
    {
      sharepoint_item_id: 'fld_archive',
      file_name: '04_Archive',
      is_folder: true,
      drive_id: 'drive_london_hub',
      status: 'AVAILABLE',
      file_type: 'File folder',
      modified_at: '01-Oct-2026',
      path: 'X:\\London Commercial Hub\\04_Archive'
    },
    {
      sharepoint_item_id: 'file_bim_execution_plan',
      file_name: 'HUB-PM-ZZ-PL-X-0001_BIM_Execution_Plan.pdf',
      is_folder: false,
      drive_id: 'drive_london_hub',
      status: 'AVAILABLE',
      file_type: 'Adobe Acrobat Document',
      size_bytes: 4_850_000,
      modified_at: 'Today at 11:20',
      path: 'X:\\London Commercial Hub\\HUB-PM-ZZ-PL-X-0001_BIM_Execution_Plan.pdf'
    }
  ],
  'fld_wip': [
    {
      sharepoint_item_id: 'fld_wip_arch',
      file_name: 'Architecture',
      is_folder: true,
      drive_id: 'drive_london_hub',
      status: 'AVAILABLE',
      file_type: 'File folder',
      modified_at: 'Today at 17:15',
      path: 'X:\\London Commercial Hub\\01_Work-In-Progress (WIP)\\Architecture'
    },
    {
      sharepoint_item_id: 'fld_wip_struc',
      file_name: 'Structural',
      is_folder: true,
      drive_id: 'drive_london_hub',
      status: 'AVAILABLE',
      file_type: 'File folder',
      modified_at: 'Today at 15:40',
      path: 'X:\\London Commercial Hub\\01_Work-In-Progress (WIP)\\Structural'
    },
    {
      sharepoint_item_id: 'fld_wip_mep',
      file_name: 'MEP Services',
      is_folder: true,
      drive_id: 'drive_london_hub',
      status: 'AVAILABLE',
      file_type: 'File folder',
      modified_at: 'Today at 14:10',
      path: 'X:\\London Commercial Hub\\01_Work-In-Progress (WIP)\\MEP Services'
    }
  ],
  'fld_wip_arch': [
    {
      sharepoint_item_id: 'file_rvt_central',
      file_name: 'HUB-AR-ZZ-MD-M3-0001_Central.rvt',
      is_folder: false,
      drive_id: 'drive_london_hub',
      status: 'AVAILABLE',
      file_type: 'Autodesk Revit Model (.rvt)',
      size_bytes: 84_520_000,
      modified_at: 'Today at 16:45',
      download_url: '',
      path: 'X:\\London Commercial Hub\\01_Work-In-Progress (WIP)\\Architecture\\HUB-AR-ZZ-MD-M3-0001_Central.rvt'
    },
    {
      sharepoint_item_id: 'file_dwg_l01',
      file_name: 'HUB-AR-L01-PL-M3-0001_FloorPlan.dwg',
      is_folder: false,
      drive_id: 'drive_london_hub',
      status: 'AVAILABLE',
      file_type: 'AutoCAD Drawing (.dwg)',
      size_bytes: 18_420_000,
      modified_at: 'Today at 16:30',
      download_url: '',
      path: 'X:\\London Commercial Hub\\01_Work-In-Progress (WIP)\\Architecture\\HUB-AR-L01-PL-M3-0001_FloorPlan.dwg'
    },
    {
      sharepoint_item_id: 'file_dwg_l02',
      file_name: 'HUB-AR-L02-PL-M3-0002_FloorPlan.dwg',
      is_folder: false,
      drive_id: 'drive_london_hub',
      status: 'LOCKED',
      locked_by: 'Sarah Jenkins (Architect - London)',
      file_type: 'AutoCAD Drawing (.dwg)',
      size_bytes: 16_840_000,
      modified_at: 'Today at 15:50',
      download_url: '',
      path: 'X:\\London Commercial Hub\\01_Work-In-Progress (WIP)\\Architecture\\HUB-AR-L02-PL-M3-0002_FloorPlan.dwg'
    },
    {
      sharepoint_item_id: 'file_dwg_elev',
      file_name: 'HUB-AR-ZZ-EL-M3-0001_Elevations.dwg',
      is_folder: false,
      drive_id: 'drive_london_hub',
      status: 'AVAILABLE',
      file_type: 'AutoCAD Drawing (.dwg)',
      size_bytes: 22_150_000,
      modified_at: 'Today at 12:15',
      download_url: '',
      path: 'X:\\London Commercial Hub\\01_Work-In-Progress (WIP)\\Architecture\\HUB-AR-ZZ-EL-M3-0001_Elevations.dwg'
    }
  ],
  'fld_wip_struc': [
    {
      sharepoint_item_id: 'file_rvt_struc_central',
      file_name: 'HUB-ST-ZZ-MD-M3-0001_StructuralFrame.rvt',
      is_folder: false,
      drive_id: 'drive_london_hub',
      status: 'AVAILABLE',
      file_type: 'Autodesk Revit Model (.rvt)',
      size_bytes: 62_100_000,
      modified_at: 'Today at 15:30',
      download_url: '',
      path: 'X:\\London Commercial Hub\\01_Work-In-Progress (WIP)\\Structural\\HUB-ST-ZZ-MD-M3-0001_StructuralFrame.rvt'
    },
    {
      sharepoint_item_id: 'file_dwg_framing',
      file_name: 'HUB-ST-L01-PL-M3-0001_FramingPlan.dwg',
      is_folder: false,
      drive_id: 'drive_london_hub',
      status: 'AVAILABLE',
      file_type: 'AutoCAD Drawing (.dwg)',
      size_bytes: 14_920_000,
      modified_at: 'Today at 14:00',
      download_url: '',
      path: 'X:\\London Commercial Hub\\01_Work-In-Progress (WIP)\\Structural\\HUB-ST-L01-PL-M3-0001_FramingPlan.dwg'
    }
  ],
  'fld_wip_mep': [
    {
      sharepoint_item_id: 'file_rvt_mep_central',
      file_name: 'HUB-ME-ZZ-MD-M3-0001_HVAC_Services.rvt',
      is_folder: false,
      drive_id: 'drive_london_hub',
      status: 'AVAILABLE',
      file_type: 'Autodesk Revit Model (.rvt)',
      size_bytes: 98_700_000,
      modified_at: 'Today at 13:45',
      download_url: '',
      path: 'X:\\London Commercial Hub\\01_Work-In-Progress (WIP)\\MEP Services\\HUB-ME-ZZ-MD-M3-0001_HVAC_Services.rvt'
    }
  ],
  'fld_shared': [
    {
      sharepoint_item_id: 'file_shared_site',
      file_name: 'HUB-CU-ZZ-PL-M3-0001_CivilSiteSurvey.dwg',
      is_folder: false,
      drive_id: 'drive_london_hub',
      status: 'AVAILABLE',
      file_type: 'AutoCAD Drawing (.dwg)',
      size_bytes: 31_200_000,
      modified_at: 'Yesterday at 17:30',
      download_url: '',
      path: 'X:\\London Commercial Hub\\02_Shared (ISO 19650)\\HUB-CU-ZZ-PL-M3-0001_CivilSiteSurvey.dwg'
    }
  ],
  'root_bangalore_campus': [
    {
      sharepoint_item_id: 'fld_bengaluru_wip',
      file_name: '01_Work-In-Progress',
      is_folder: true,
      drive_id: 'drive_bangalore_campus',
      status: 'AVAILABLE',
      file_type: 'File folder',
      modified_at: 'Today at 10:15',
      path: 'X:\\Bangalore Tech Park Campus\\01_Work-In-Progress'
    },
    {
      sharepoint_item_id: 'file_bengaluru_master',
      file_name: 'BTP-AR-ZZ-MD-M3-0001_Campus_Master.rvt',
      is_folder: false,
      drive_id: 'drive_bangalore_campus',
      status: 'AVAILABLE',
      file_type: 'Autodesk Revit Model (.rvt)',
      size_bytes: 142_300_000,
      modified_at: 'Today at 09:30',
      download_url: '',
      path: 'X:\\Bangalore Tech Park Campus\\BTP-AR-ZZ-MD-M3-0001_Campus_Master.rvt'
    }
  ]
};

export function useSharePointExplorer() {
  const { userId } = useAuth();
  const [drives, setDrives] = useState<Drive[]>(DEFAULT_DRIVES);
  const [currentDriveId, setCurrentDriveId] = useState<string | null>('drive_london_hub');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>('root_london_hub');
  const [filesMap, setFilesMap] = useState<Record<string, FileNode[]>>(DEFAULT_FILES_MAP);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Breadcrumb Path stack
  const [breadcrumbs, setBreadcrumbs] = useState<{id: string, name: string}[]>([
    { id: 'root_london_hub', name: 'London Commercial Hub (ISO 19650)' }
  ]);

  // Explorer Navigation History Stack for Back/Forward buttons
  const [history, setHistory] = useState<{folderId: string; breadcrumbs: {id: string, name: string}[]}[]>([
    { folderId: 'root_london_hub', breadcrumbs: [{ id: 'root_london_hub', name: 'London Commercial Hub (ISO 19650)' }] }
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // 1. Fetch Drives on mount (with fallback)
  useEffect(() => {
    const fetchDrives = async () => {
      try {
        const response = await fetch(`https://cadflow-api.onrender.com/api/v1/sharepoint/tree?user_id=${userId || ''}`, { 
          headers: { 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123' },
          signal: AbortSignal.timeout(3000)
        });
        if (!response.ok) throw new Error('API Tree response not OK');
        const data = await response.json();
        
        if (Array.isArray(data.tree) && data.tree.length > 0) {
          const loadedDrives = data.tree.map((d: any) => ({
            drive_id: d.drive_id,
            drive_name: d.drive_name,
            root_item_id: d.root_item_id
          }));
          setDrives(loadedDrives);
          setCurrentDriveId(loadedDrives[0].drive_id);
          setCurrentFolderId(loadedDrives[0].root_item_id);
          setBreadcrumbs([{ id: loadedDrives[0].root_item_id, name: loadedDrives[0].drive_name }]);
        }
      } catch (err) {
        // Fallback to local high-fidelity CDE mock drives
        console.info("Using CADFlow local CDE vault tree:", err);
      }
    };
    fetchDrives();
  }, [userId]);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const refresh = useCallback(() => setRefreshTrigger(prev => prev + 1), []);

  // 2. Fetch contents when drive or folder changes
  useEffect(() => {
    if (!currentFolderId) return;

    const fetchFolder = async () => {
      setIsLoading(true);
      try {
        if (currentDriveId) {
          const response = await fetch(`https://cadflow-api.onrender.com/api/v1/sharepoint/folder/${currentDriveId}/${currentFolderId}`, { 
            headers: { 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123' },
            signal: AbortSignal.timeout(3000)
          });
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data.children) && data.children.length > 0) {
              const nodes: FileNode[] = data.children.map((child: any) => ({
                sharepoint_item_id: child.id,
                file_name: child.name,
                is_folder: child.is_folder,
                drive_id: currentDriveId,
                download_url: child.downloadUrl,
                status: child.lock_status || 'AVAILABLE',
                locked_by: child.locked_by,
                size_bytes: child.size || (child.is_folder ? undefined : 15_000_000),
                modified_at: child.lastModifiedDateTime ? new Date(child.lastModifiedDateTime).toLocaleDateString() : 'Today',
                file_type: child.is_folder ? 'File folder' : (child.name.endsWith('.dwg') ? 'AutoCAD Drawing (.dwg)' : child.name.endsWith('.rvt') ? 'Autodesk Revit Model (.rvt)' : 'Document'),
                path: `X:\\Project\\${child.name}`
              }));
              setFiles(nodes);
              setIsLoading(false);
              return;
            }
          }
        }
      } catch (err) {
        // Fallback
      }

      // Local / Offline fallback from filesMap
      const localFiles = filesMap[currentFolderId] || [];
      setFiles(localFiles);
      setIsLoading(false);
    };

    fetchFolder();
  }, [currentDriveId, currentFolderId, refreshTrigger, filesMap]);

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
    const newFolder: FileNode = {
      sharepoint_item_id: `fld_${Date.now()}`,
      file_name: folderName,
      is_folder: true,
      drive_id: currentDriveId || 'drive_london_hub',
      status: 'AVAILABLE',
      file_type: 'File folder',
      modified_at: 'Just now',
      path: `X:\\Project\\${folderName}`
    };

    setFilesMap(prev => ({
      ...prev,
      [currentFolderId]: [...(prev[currentFolderId] || []), newFolder]
    }));
  };

  const renameFile = (id: string, newName: string) => {
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
    if (!currentFolderId) return;
    setFilesMap(prev => ({
      ...prev,
      [currentFolderId]: (prev[currentFolderId] || []).filter(f => !ids.has(f.sharepoint_item_id))
    }));
  };

  const updateFileLockStatus = (id: string, status: LockStatus, lockedBy?: string) => {
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
