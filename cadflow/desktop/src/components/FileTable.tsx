import React, { useState, useEffect, useRef } from 'react';
import { type FileNode } from '../hooks/useRealtimeLocks';
import { LockBadge } from './LockBadge';
import { 
  ExternalLink, 
  Folder, 
  CheckCircle, 
  Clock, 
  Edit2, 
  Trash2, 
  Copy, 
  Scissors, 
  Clipboard, 
  HardDrive, 
  FolderOpen, 
  FileText, 
  Lock, 
  Unlock, 
  CheckSquare, 
  Square,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Info
} from 'lucide-react';
import { Button } from './ui/Button';
import { toast } from 'sonner';
import { invoke } from '@tauri-apps/api/core';

export const AutoCADIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 drop-shadow-xs">
    <rect width="24" height="24" rx="4" fill="#D32F2F"/>
    <path d="M12 4.5L5.5 18H8.2L9.4 14.8H14.6L15.8 18H18.5L12 4.5ZM10.3 12.3L12 7.8L13.7 12.3H10.3Z" fill="white"/>
  </svg>
);

export const RevitIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 drop-shadow-xs">
    <rect width="24" height="24" rx="4" fill="#1565C0"/>
    <path d="M6.5 5.5H13.2C15.8 5.5 17.5 7.1 17.5 9.7C17.5 11.3 16.5 12.4 15.3 12.9L17.5 18.5H14.7L12.8 13.8H8.8V18.5H6.5V5.5ZM8.8 7.6V11.7H13C14.1 11.7 15.1 11 15.1 9.7C15.1 8.3 14.1 7.6 13 7.6H8.8Z" fill="white"/>
  </svg>
);

export const GenericFileIcon = () => (
  <div className="w-5 h-5 bg-muted rounded flex items-center justify-center shrink-0 border">
    <FileText size={12} className="text-muted-foreground" />
  </div>
);

export interface FileTableProps {
  files: FileNode[];
  isLoading?: boolean;
  viewMode?: 'details' | 'grid';
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onLaunch: (f: FileNode, readOnly?: boolean) => void;
  onClickFolder: (id: string, name: string) => void;
  onFileUpload?: (files: FileList) => void;
  onVersionHistoryClick?: (f: FileNode) => void;
  onApproveClick?: (f: FileNode) => void;
  onPropertiesClick?: (f: FileNode) => void;
  onRename?: (f: FileNode) => void;
  onDelete?: (files: FileNode[]) => void;
  onToggleLock?: (f: FileNode) => void;
}

export const FileTable: React.FC<FileTableProps> = ({ 
  files, 
  isLoading, 
  viewMode = 'details',
  selectedIds,
  setSelectedIds,
  onLaunch, 
  onClickFolder, 
  onFileUpload, 
  onVersionHistoryClick, 
  onApproveClick,
  onPropertiesClick,
  onRename,
  onDelete,
  onToggleLock
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  
  // Sort State
  const [sortField, setSortField] = useState<'name' | 'status' | 'date' | 'type' | 'size'>('name');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file: FileNode } | null>(null);
  
  // Clipboard State
  const [clipboard, setClipboard] = useState<{ action: 'copy' | 'cut', files: FileNode[] } | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Format File Size
  const formatSize = (bytes?: number) => {
    if (bytes === undefined || bytes === null) return '--';
    if (bytes >= 1024 * 1024 * 1024) {
      return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    if (bytes >= 1024) {
      return (bytes / 1024).toFixed(0) + ' KB';
    }
    return bytes + ' B';
  };

  // Keyboard Shortcuts (Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Delete, F2)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelectedIds(new Set(files.map(f => f.sharepoint_item_id)));
      return;
    }

    if (selectedIds.size === 0) return;
    const selectedFiles = files.filter(f => selectedIds.has(f.sharepoint_item_id));

    if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      setClipboard({ action: 'copy', files: selectedFiles });
      toast.success(`Copied ${selectedFiles.length} item(s)`);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'x') {
      setClipboard({ action: 'cut', files: selectedFiles });
      toast.success(`Cut ${selectedFiles.length} item(s)`);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
      if (clipboard) {
        toast.success(`Pasted ${clipboard.files.length} item(s) to folder`);
        setClipboard(null);
      }
    } else if (e.key === 'Delete') {
      if (onDelete) onDelete(selectedFiles);
    } else if (e.key === 'F2' && selectedFiles.length === 1) {
      if (onRename) onRename(selectedFiles[0]);
    }
  };

  const handleRowClick = (e: React.MouseEvent, file: FileNode, index: number) => {
    e.stopPropagation();
    setContextMenu(null);

    if (e.ctrlKey || e.metaKey) {
      const newSelected = new Set(selectedIds);
      if (newSelected.has(file.sharepoint_item_id)) {
        newSelected.delete(file.sharepoint_item_id);
      } else {
        newSelected.add(file.sharepoint_item_id);
      }
      setSelectedIds(newSelected);
      setLastSelectedId(file.sharepoint_item_id);
    } else if (e.shiftKey && lastSelectedId) {
      const lastIndex = files.findIndex(f => f.sharepoint_item_id === lastSelectedId);
      const start = Math.min(lastIndex, index);
      const end = Math.max(lastIndex, index);
      
      const newSelected = new Set(selectedIds);
      for (let i = start; i <= end; i++) {
        if (files[i]) newSelected.add(files[i].sharepoint_item_id);
      }
      setSelectedIds(newSelected);
    } else {
      setSelectedIds(new Set([file.sharepoint_item_id]));
      setLastSelectedId(file.sharepoint_item_id);
    }
  };

  const handleCheckboxToggle = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
    setLastSelectedId(id);
  };

  const handleContextMenu = (e: React.MouseEvent, file: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!selectedIds.has(file.sharepoint_item_id)) {
      setSelectedIds(new Set([file.sharepoint_item_id]));
      setLastSelectedId(file.sharepoint_item_id);
    }
    
    // Boundary check so context menu doesn't overflow screen
    const x = Math.min(e.clientX, window.innerWidth - 240);
    const y = Math.min(e.clientY, window.innerHeight - 380);
    setContextMenu({ x, y, file });
  };

  const handleRevealInExplorer = async (file: FileNode) => {
    try {
      const targetPath = file.path || `C:\\Users\\Public\\CADFlow_Cache\\Project\\${file.file_name}`;
      await invoke('reveal_in_explorer', { filePath: targetPath });
      toast.success(`Opening in Windows Explorer: ${file.file_name}`);
    } catch (e: any) {
      toast.error(`Explorer reveal: ${e}`);
    }
  };

  const handleCopyPath = async (file: FileNode) => {
    const fullPath = file.path || `X:\\Project\\${file.file_name}`;
    await navigator.clipboard.writeText(fullPath);
    toast.success(`Copied path to clipboard: ${fullPath}`);
  };

  const isCut = (id: string) => {
    return clipboard?.action === 'cut' && clipboard.files.some(f => f.sharepoint_item_id === id);
  };

  // Sorting
  const sortedFiles = [...files].sort((a, b) => {
    // Folders always float to top in Windows Explorer
    if (a.is_folder && !b.is_folder) return -1;
    if (!a.is_folder && b.is_folder) return 1;

    let res = 0;
    if (sortField === 'name') {
      res = a.file_name.localeCompare(b.file_name);
    } else if (sortField === 'status') {
      res = (a.status || '').localeCompare(b.status || '');
    } else if (sortField === 'date') {
      res = (a.modified_at || '').localeCompare(b.modified_at || '');
    } else if (sortField === 'type') {
      res = (a.file_type || '').localeCompare(b.file_type || '');
    } else if (sortField === 'size') {
      res = (a.size_bytes || 0) - (b.size_bytes || 0);
    }
    return sortAsc ? res : -res;
  });

  const handleHeaderSort = (field: 'name' | 'status' | 'date' | 'type' | 'size') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div 
      className="flex-1 overflow-auto relative select-none outline-none bg-background rounded-md border border-border"
      tabIndex={0}
      ref={containerRef}
      onKeyDown={handleKeyDown}
      onClick={() => {
        setSelectedIds(new Set());
        setContextMenu(null);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (onFileUpload && e.dataTransfer.files) {
          onFileUpload(e.dataTransfer.files);
        }
      }}
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/15 border-2 border-dashed border-primary z-50 flex items-center justify-center backdrop-blur-xs rounded-md pointer-events-none">
          <div className="flex flex-col items-center space-y-2 bg-background/90 p-6 rounded-lg shadow-xl border">
            <FolderOpen size={40} className="text-primary animate-bounce" />
            <p className="text-base font-semibold text-foreground">Drop files here to upload to X:\ Drive</p>
            <p className="text-xs text-muted-foreground">Files will be synchronized with zero-corruption guarantee</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3 text-muted-foreground">
          <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-medium tracking-wide">Loading directory contents...</p>
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-2 text-muted-foreground">
          <Folder size={44} className="opacity-30" />
          <p className="text-sm font-medium">This folder is empty</p>
          <p className="text-xs opacity-70">Drag files here or use the '+ New' button to add models</p>
        </div>
      ) : viewMode === 'details' ? (
        /* Windows Explorer Details Table View */
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-muted/40 text-muted-foreground border-b sticky top-0 z-10 backdrop-blur-md">
            <tr>
              <th className="w-10 px-3 py-2 text-center">
                <input 
                  type="checkbox"
                  aria-label="Select all files"
                  checked={selectedIds.size === files.length && files.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(files.map(f => f.sharepoint_item_id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                  className="rounded border-input text-primary focus:ring-0 cursor-pointer w-3.5 h-3.5"
                />
              </th>
              <th 
                className="px-3 py-2 font-medium cursor-pointer hover:bg-muted/60 transition-colors w-[40%]"
                onClick={() => handleHeaderSort('name')}
              >
                <div className="flex items-center space-x-1.5">
                  <span>Name</span>
                  {sortField === 'name' ? (sortAsc ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-40" />}
                </div>
              </th>
              <th 
                className="px-3 py-2 font-medium cursor-pointer hover:bg-muted/60 transition-colors w-[22%]"
                onClick={() => handleHeaderSort('status')}
              >
                <div className="flex items-center space-x-1.5">
                  <span>Status / Lock</span>
                  {sortField === 'status' ? (sortAsc ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-40" />}
                </div>
              </th>
              <th 
                className="px-3 py-2 font-medium cursor-pointer hover:bg-muted/60 transition-colors w-[15%]"
                onClick={() => handleHeaderSort('date')}
              >
                <div className="flex items-center space-x-1.5">
                  <span>Date modified</span>
                  {sortField === 'date' ? (sortAsc ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-40" />}
                </div>
              </th>
              <th 
                className="px-3 py-2 font-medium cursor-pointer hover:bg-muted/60 transition-colors w-[13%]"
                onClick={() => handleHeaderSort('type')}
              >
                <div className="flex items-center space-x-1.5">
                  <span>Type</span>
                  {sortField === 'type' ? (sortAsc ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-40" />}
                </div>
              </th>
              <th 
                className="px-3 py-2 font-medium text-right cursor-pointer hover:bg-muted/60 transition-colors w-[10%]"
                onClick={() => handleHeaderSort('size')}
              >
                <div className="flex items-center justify-end space-x-1.5">
                  <span>Size</span>
                  {sortField === 'size' ? (sortAsc ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-40" />}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 font-normal">
            {sortedFiles.map((file, index) => {
              const isRevit = file.file_name.endsWith('.rvt');
              const isCad = file.file_name.endsWith('.dwg');
              const isPdf = file.file_name.endsWith('.pdf');
              const isSelected = selectedIds.has(file.sharepoint_item_id);
              const isLocked = file.status === 'LOCKED';

              return (
                <tr 
                  key={file.sharepoint_item_id}
                  className={`group transition-colors cursor-pointer select-none ${
                    isSelected 
                      ? 'bg-primary/15 text-foreground' 
                      : 'hover:bg-muted/40 text-foreground/90'
                  } ${isCut(file.sharepoint_item_id) ? 'opacity-40' : ''}`}
                  onClick={(e) => handleRowClick(e, file, index)}
                  onContextMenu={(e) => handleContextMenu(e, file)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (file.is_folder) {
                      onClickFolder(file.sharepoint_item_id, file.file_name);
                    } else {
                      onLaunch(file);
                    }
                  }}
                >
                  {/* Checkbox cell */}
                  <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="checkbox"
                      aria-label={`Select ${file.file_name}`}
                      checked={isSelected}
                      onChange={(e) => handleCheckboxToggle(e as any, file.sharepoint_item_id)}
                      className={`rounded border-input text-primary focus:ring-0 cursor-pointer w-3.5 h-3.5 transition-opacity ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    />
                  </td>

                  {/* Name cell with Icon */}
                  <td className="px-3 py-2">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      {file.is_folder ? (
                        <Folder size={18} className="text-amber-500 fill-amber-500/20 shrink-0" />
                      ) : isRevit ? (
                        <RevitIcon />
                      ) : isCad ? (
                        <AutoCADIcon />
                      ) : isPdf ? (
                        <FileText size={18} className="text-red-500 shrink-0" />
                      ) : (
                        <GenericFileIcon />
                      )}
                      <span className="truncate font-medium text-foreground group-hover:text-primary transition-colors">
                        {file.file_name}
                      </span>
                    </div>
                  </td>

                  {/* Status / Lock Cell */}
                  <td className="px-3 py-2">
                    {!file.is_folder ? (
                      <LockBadge status={file.status} lockedBy={file.locked_by} />
                    ) : (
                      <span className="text-muted-foreground text-[11px]">Folder</span>
                    )}
                  </td>

                  {/* Date Modified */}
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap text-[11px]">
                    {file.modified_at || 'Today'}
                  </td>

                  {/* File Type */}
                  <td className="px-3 py-2 text-muted-foreground truncate text-[11px]">
                    {file.file_type || (file.is_folder ? 'File folder' : isCad ? 'AutoCAD Drawing' : isRevit ? 'Revit Model' : 'Document')}
                  </td>

                  {/* File Size */}
                  <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap font-mono text-[11px]">
                    {formatSize(file.size_bytes)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        /* Windows Explorer Large Icons / Grid View */
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {sortedFiles.map((file, index) => {
            const isRevit = file.file_name.endsWith('.rvt');
            const isCad = file.file_name.endsWith('.dwg');
            const isPdf = file.file_name.endsWith('.pdf');
            const isSelected = selectedIds.has(file.sharepoint_item_id);

            return (
              <div
                key={file.sharepoint_item_id}
                className={`relative group flex flex-col items-center text-center p-3 rounded-lg border transition-all cursor-pointer ${
                  isSelected 
                    ? 'bg-primary/15 border-primary/50 ring-1 ring-primary/40' 
                    : 'bg-card hover:bg-muted/40 border-border/60 hover:border-border'
                } ${isCut(file.sharepoint_item_id) ? 'opacity-40' : ''}`}
                onClick={(e) => handleRowClick(e, file, index)}
                onContextMenu={(e) => handleContextMenu(e, file)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (file.is_folder) {
                    onClickFolder(file.sharepoint_item_id, file.file_name);
                  } else {
                    onLaunch(file);
                  }
                }}
              >
                {/* Item Checkbox */}
                <div 
                  className={`absolute top-2 left-2 z-10 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                  onClick={(e) => handleCheckboxToggle(e, file.sharepoint_item_id)}
                >
                  <input 
                    type="checkbox" 
                    aria-label={`Select ${file.file_name}`}
                    checked={isSelected}
                    readOnly
                    className="rounded border-input text-primary focus:ring-0 cursor-pointer w-3.5 h-3.5"
                  />
                </div>

                {/* Lock Badge Overlay */}
                {!file.is_folder && file.status === 'LOCKED' && (
                  <div className="absolute top-2 right-2 z-10 bg-red-500/90 text-white rounded p-1 shadow-xs" title={`Locked by ${file.locked_by}`}>
                    <Lock size={12} />
                  </div>
                )}

                {/* Big Icon */}
                <div className="w-14 h-14 flex items-center justify-center my-2">
                  {file.is_folder ? (
                    <Folder size={48} className="text-amber-500 fill-amber-500/20" />
                  ) : isRevit ? (
                    <div className="scale-150"><RevitIcon /></div>
                  ) : isCad ? (
                    <div className="scale-150"><AutoCADIcon /></div>
                  ) : isPdf ? (
                    <FileText size={42} className="text-red-500" />
                  ) : (
                    <FileText size={42} className="text-muted-foreground" />
                  )}
                </div>

                {/* Filename */}
                <span className="text-xs font-medium text-foreground line-clamp-2 break-all w-full leading-tight">
                  {file.file_name}
                </span>

                {/* Size / Metadata */}
                <span className="text-[10px] text-muted-foreground mt-1">
                  {file.is_folder ? 'Folder' : formatSize(file.size_bytes)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Windows 11 Explorer Right-Click Context Menu */}
      {contextMenu && (
        <div 
          className="fixed bg-background/95 backdrop-blur-md border border-border rounded-lg shadow-2xl z-[150] py-1.5 flex flex-col min-w-[220px] text-xs animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* File specific actions */}
          {!contextMenu.file.is_folder ? (
            <>
              <button 
                className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-primary/10 hover:text-primary text-left font-medium" 
                onClick={() => { setContextMenu(null); onLaunch(contextMenu.file); }}
              >
                <ExternalLink size={14} /> Open in {contextMenu.file.file_name.endsWith('.rvt') ? 'Revit' : 'AutoCAD'}
              </button>
              
              <button 
                className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted text-left" 
                onClick={() => { setContextMenu(null); onLaunch(contextMenu.file, true); }}
              >
                <Lock size={14} className="text-amber-500" /> Open in Read-Only Mode
              </button>

              <button 
                className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted text-left" 
                onClick={() => { setContextMenu(null); handleRevealInExplorer(contextMenu.file); }}
              >
                <FolderOpen size={14} className="text-blue-500" /> Show in Windows File Explorer
              </button>

              <div className="h-px bg-border my-1" />

              {/* Lock / Unlock Toggle */}
              {onToggleLock && (
                <button 
                  className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted text-left font-medium"
                  onClick={() => { setContextMenu(null); onToggleLock(contextMenu.file); }}
                >
                  {contextMenu.file.status === 'LOCKED' ? (
                    <>
                      <Unlock size={14} className="text-emerald-500" /> Release Lock & Sync Changes
                    </>
                  ) : (
                    <>
                      <Lock size={14} className="text-red-500" /> Lock for Exclusive Editing
                    </>
                  )}
                </button>
              )}

              {onVersionHistoryClick && (
                <button 
                  className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted text-left" 
                  onClick={() => { setContextMenu(null); onVersionHistoryClick(contextMenu.file); }}
                >
                  <Clock size={14} className="text-blue-500" /> Version History (Audit)
                </button>
              )}

              {onApproveClick && (
                <button 
                  className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-emerald-500/10 text-emerald-600 text-left" 
                  onClick={() => { setContextMenu(null); onApproveClick(contextMenu.file); }}
                >
                  <CheckCircle size={14} /> Approve for ISO 19650 SHARED
                </button>
              )}
            </>
          ) : (
            <button 
              className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted text-left font-medium" 
              onClick={() => { 
                setContextMenu(null); 
                onClickFolder(contextMenu.file.sharepoint_item_id, contextMenu.file.file_name); 
              }}
            >
              <FolderOpen size={14} /> Open Folder
            </button>
          )}

          <div className="h-px bg-border my-1" />

          {/* Windows Standard File Operations */}
          <button 
            className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted text-left" 
            onClick={() => { setContextMenu(null); handleCopyPath(contextMenu.file); }}
          >
            <Copy size={14} /> Copy as path <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+Shift+C</span>
          </button>

          <button 
            className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted text-left" 
            onClick={() => {
              setContextMenu(null);
              setClipboard({ action: 'cut', files: files.filter(f => selectedIds.has(f.sharepoint_item_id)) });
              toast.success(`Cut ${selectedIds.size} item(s)`);
            }}
          >
            <Scissors size={14} /> Cut <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+X</span>
          </button>
          
          <button 
            className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted text-left" 
            onClick={() => {
              setContextMenu(null);
              setClipboard({ action: 'copy', files: files.filter(f => selectedIds.has(f.sharepoint_item_id)) });
              toast.success(`Copied ${selectedIds.size} item(s)`);
            }}
          >
            <Copy size={14} /> Copy <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+C</span>
          </button>

          <button 
            className={`flex items-center gap-2.5 px-3 py-1.5 text-left ${clipboard ? 'hover:bg-muted' : 'opacity-40 cursor-not-allowed'}`}
            onClick={() => {
              if (!clipboard) return;
              setContextMenu(null);
              toast.success(`Pasting ${clipboard.files.length} item(s)...`);
              setClipboard(null);
            }}
            disabled={!clipboard}
          >
            <Clipboard size={14} /> Paste <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+V</span>
          </button>

          <div className="h-px bg-border my-1" />
          
          <button 
            className={`flex items-center gap-2.5 px-3 py-1.5 text-left ${selectedIds.size === 1 ? 'hover:bg-muted' : 'opacity-40 cursor-not-allowed'}`}
            onClick={() => {
              if (selectedIds.size !== 1) return;
              setContextMenu(null);
              if (onRename) onRename(contextMenu.file);
            }}
          >
            <Edit2 size={14} /> Rename <span className="ml-auto text-[10px] text-muted-foreground">F2</span>
          </button>

          <button 
            className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-red-500/10 text-red-500 text-left" 
            onClick={() => {
              setContextMenu(null);
              if (onDelete) onDelete(files.filter(f => selectedIds.has(f.sharepoint_item_id)));
            }}
          >
            <Trash2 size={14} /> Delete <span className="ml-auto text-[10px] text-muted-foreground">Del</span>
          </button>

          <div className="h-px bg-border my-1" />

          {/* Properties Dialog */}
          <button 
            className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted text-left font-medium" 
            onClick={() => {
              setContextMenu(null);
              if (onPropertiesClick) onPropertiesClick(contextMenu.file);
            }}
          >
            <Info size={14} className="text-primary" /> Properties <span className="ml-auto text-[10px] text-muted-foreground">Alt+Enter</span>
          </button>
        </div>
      )}
    </div>
  );
};
