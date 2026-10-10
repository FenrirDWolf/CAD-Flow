import React, { useState, useEffect, useRef } from 'react';
import { type FileNode } from '../hooks/useRealtimeLocks';
import { LockBadge } from './LockBadge';
import { ExternalLink, Folder, CheckCircle, Clock, Edit2, FolderOutput, Trash2, Copy, Scissors, Clipboard } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { toast } from 'sonner';

const AutoCADIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
    <rect width="24" height="24" rx="4" fill="#D32F2F"/>
    <path d="M12 5L6 17H8.5L9.5 14H14.5L15.5 17H18L12 5ZM10.5 11.5L12 7.5L13.5 11.5H10.5Z" fill="white"/>
  </svg>
);

const RevitIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
    <rect width="24" height="24" rx="4" fill="#1565C0"/>
    <path d="M7 6H13C15.5 6 17 7.5 17 10C17 11.5 16 12.5 15 13L17 18H14.5L13 14H9V18H7V6ZM9 8V12H13C14 12 14.5 11.5 14.5 10C14.5 8.5 14 8 13 8H9Z" fill="white"/>
  </svg>
);

const GenericFileIcon = () => (
  <div className="w-6 h-6 bg-muted rounded flex items-center justify-center shrink-0">
    <span className="text-[10px] text-muted-foreground font-bold">FILE</span>
  </div>
);

export const FileTable: React.FC<{ 
  files: FileNode[], 
  isLoading?: boolean,
  onLaunch: (f: FileNode) => void,
  onClickFolder: (id: string, name: string) => void,
  onFileUpload?: (files: FileList) => void,
  onVersionHistoryClick?: (f: FileNode) => void,
  onApproveClick?: (f: FileNode) => void
}> = ({ files, isLoading, onLaunch, onClickFolder, onFileUpload, onVersionHistoryClick, onApproveClick }) => {
  const [isDragging, setIsDragging] = useState(false);
  
  // File Explorer State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  
  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file: FileNode } | null>(null);
  
  // Clipboard State (Mocking UI)
  const [clipboard, setClipboard] = useState<{ action: 'copy' | 'cut', files: FileNode[] } | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Keyboard Shortcuts (Ctrl+C, Ctrl+X, Ctrl+V, Delete, F2)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (selectedIds.size === 0) return;
    
    const selectedFiles = files.filter(f => selectedIds.has(f.sharepoint_item_id));

    if (e.ctrlKey && e.key === 'c') {
      setClipboard({ action: 'copy', files: selectedFiles });
      toast.success(`Copied ${selectedFiles.length} item(s)`);
    } else if (e.ctrlKey && e.key === 'x') {
      setClipboard({ action: 'cut', files: selectedFiles });
      toast.success(`Cut ${selectedFiles.length} item(s)`);
    } else if (e.ctrlKey && e.key === 'v') {
      if (clipboard) {
        toast.success(`Pasting ${clipboard.files.length} item(s)...`);
        // Here we would call the backend to execute the paste
        setClipboard(null);
      }
    } else if (e.key === 'Delete') {
      toast.error(`Deleting ${selectedFiles.length} item(s)...`);
      // Backend call here
    } else if (e.key === 'F2' && selectedFiles.length === 1) {
      toast.info(`Renaming ${selectedFiles[0].file_name}`);
    }
  };

  const handleRowClick = (e: React.MouseEvent, file: FileNode, index: number) => {
    e.stopPropagation();
    setContextMenu(null); // Close menu if open

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
        newSelected.add(files[i].sharepoint_item_id);
      }
      setSelectedIds(newSelected);
    } else {
      setSelectedIds(new Set([file.sharepoint_item_id]));
      setLastSelectedId(file.sharepoint_item_id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, file: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    
    // If right-clicking an unselected item, select only that item
    if (!selectedIds.has(file.sharepoint_item_id)) {
      setSelectedIds(new Set([file.sharepoint_item_id]));
      setLastSelectedId(file.sharepoint_item_id);
    }
    
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const isCut = (id: string) => {
    return clipboard?.action === 'cut' && clipboard.files.some(f => f.sharepoint_item_id === id);
  };

  return (
    <Card 
      className="overflow-hidden relative min-h-[400px] outline-none"
      tabIndex={0}
      ref={containerRef}
      onKeyDown={handleKeyDown}
      onClick={() => {
        setSelectedIds(new Set()); // Deselect all on background click
        setContextMenu(null);
      }}
      onContextMenu={(e) => {
        e.preventDefault(); // Prevent native context menu on background
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
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary z-50 flex items-center justify-center backdrop-blur-sm rounded-lg pointer-events-none">
          <p className="text-xl font-semibold text-primary">Drop files here to upload to SharePoint</p>
        </div>
      )}
      
      <table className="w-full text-left text-sm text-muted-foreground select-none">
        <thead className="bg-muted/50 text-xs uppercase font-semibold text-muted-foreground border-b sticky top-0 z-10">
          <tr>
            <th className="px-6 py-4 w-1/2">Name</th>
            <th className="px-6 py-4">Status</th>
            <th className="px-6 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading ? (
            <tr>
              <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground">
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <p>Loading files...</p>
                </div>
              </td>
            </tr>
          ) : files.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground">
                This folder is empty.
              </td>
            </tr>
          ) : (
            files.map((file, index) => {
              const isRevit = file.file_name.endsWith('.rvt');
              const isCad = file.file_name.endsWith('.dwg');
              const isLocked = file.status === 'LOCKED' || file.status === 'STALE';
              const isSelected = selectedIds.has(file.sharepoint_item_id);
              
              return (
                <tr 
                  key={file.sharepoint_item_id} 
                  className={`transition-colors group cursor-pointer ${
                    isSelected ? 'bg-primary/20 text-foreground' : 'hover:bg-muted/30'
                  } ${isCut(file.sharepoint_item_id) ? 'opacity-50' : ''}`}
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
                  <td className="px-6 py-3 flex items-center space-x-4">
                    {file.is_folder ? (
                      <Folder size={24} className="text-blue-400 shrink-0 fill-blue-400/20" />
                    ) : isRevit ? (
                      <RevitIcon />
                    ) : isCad ? (
                      <AutoCADIcon />
                    ) : (
                      <GenericFileIcon />
                    )}
                    
                    <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                      {file.file_name}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {!file.is_folder && <LockBadge status={file.status} lockedBy={file.locked_by} />}
                  </td>
                  <td className="px-6 py-3 text-right flex items-center justify-end space-x-2">
                    {!file.is_folder && (
                      <Button 
                        variant={isLocked ? "secondary" : "outline"}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLaunch(file);
                        }}
                        className={isLocked ? "" : "text-primary border-primary/30 hover:bg-primary/10"}
                      >
                        <span>{isLocked ? 'Read-Only' : 'Launch'}</span>
                        <ExternalLink size={12} className="ml-1.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* Custom Windows-style Context Menu */}
      {contextMenu && (
        <div 
          className="fixed bg-background border border-border rounded-md shadow-xl z-[150] py-1 flex flex-col min-w-[200px] text-sm animate-in fade-in zoom-in-95 duration-75"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* File specific actions */}
          {!contextMenu.file.is_folder && (
            <>
              <button 
                className="flex items-center gap-2 px-4 py-2 hover:bg-muted text-left font-medium" 
                onClick={() => { setContextMenu(null); onLaunch(contextMenu.file); }}
              >
                <ExternalLink size={14} /> Open
              </button>
              <div className="h-px bg-border my-1" />
              {onApproveClick && (
                <button 
                  className="flex items-center gap-2 px-4 py-2 hover:bg-green-500/10 text-green-600 text-left" 
                  onClick={() => { setContextMenu(null); onApproveClick(contextMenu.file); }}
                >
                  <CheckCircle size={14} /> Approve File
                </button>
              )}
              {onVersionHistoryClick && (
                <button 
                  className="flex items-center gap-2 px-4 py-2 hover:bg-blue-500/10 text-blue-600 text-left" 
                  onClick={() => { setContextMenu(null); onVersionHistoryClick(contextMenu.file); }}
                >
                  <Clock size={14} /> Version History
                </button>
              )}
              <div className="h-px bg-border my-1" />
            </>
          )}

          {/* Standard OS Actions */}
          <button 
            className="flex items-center gap-2 px-4 py-2 hover:bg-muted text-left" 
            onClick={() => {
              setContextMenu(null);
              setClipboard({ action: 'cut', files: files.filter(f => selectedIds.has(f.sharepoint_item_id)) });
              toast.success(`Cut ${selectedIds.size} item(s)`);
            }}
          >
            <Scissors size={14} /> Cut <span className="ml-auto text-xs text-muted-foreground">Ctrl+X</span>
          </button>
          
          <button 
            className="flex items-center gap-2 px-4 py-2 hover:bg-muted text-left" 
            onClick={() => {
              setContextMenu(null);
              setClipboard({ action: 'copy', files: files.filter(f => selectedIds.has(f.sharepoint_item_id)) });
              toast.success(`Copied ${selectedIds.size} item(s)`);
            }}
          >
            <Copy size={14} /> Copy <span className="ml-auto text-xs text-muted-foreground">Ctrl+C</span>
          </button>

          <button 
            className={`flex items-center gap-2 px-4 py-2 text-left ${clipboard ? 'hover:bg-muted' : 'opacity-50 cursor-not-allowed'}`}
            onClick={() => {
              if (!clipboard) return;
              setContextMenu(null);
              toast.success(`Pasting ${clipboard.files.length} item(s)...`);
              setClipboard(null);
            }}
            disabled={!clipboard}
          >
            <Clipboard size={14} /> Paste <span className="ml-auto text-xs text-muted-foreground">Ctrl+V</span>
          </button>

          <div className="h-px bg-border my-1" />
          
          <button 
            className={`flex items-center gap-2 px-4 py-2 text-left ${selectedIds.size === 1 ? 'hover:bg-muted' : 'opacity-50 cursor-not-allowed'}`}
            onClick={() => {
              if (selectedIds.size !== 1) return;
              setContextMenu(null);
              toast.info(`Renaming ${contextMenu.file.file_name}`);
            }}
          >
            <Edit2 size={14} /> Rename <span className="ml-auto text-xs text-muted-foreground">F2</span>
          </button>

          <button 
            className="flex items-center gap-2 px-4 py-2 hover:bg-red-500/10 text-red-500 text-left" 
            onClick={() => {
              setContextMenu(null);
              toast.error(`Deleting ${selectedIds.size} item(s)...`);
            }}
          >
            <Trash2 size={14} /> Delete <span className="ml-auto text-xs text-muted-foreground">Del</span>
          </button>
        </div>
      )}
    </Card>
  );
};
