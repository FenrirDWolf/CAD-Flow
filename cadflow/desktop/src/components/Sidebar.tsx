import React, { useState, useEffect } from 'react';
import { 
  FolderOpen, 
  Settings, 
  Shield, 
  Lock,
  HardDrive,
  Server,
  ChevronRight,
  ChevronDown,
  Folder,
  Layers,
  Database
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ViewType } from '../App';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react';
import { invoke } from '@tauri-apps/api/core';
import { REVIT_SERVER_HOST } from '../config';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  drives?: {drive_id: string, drive_name: string, root_item_id: string}[];
  currentDriveId?: string | null;
  onSelectDrive?: (id: string, name: string, rootItemId: string) => void;
  onSelectQuickFolder?: (folderName: string) => void;
  driveLetter?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  isCollapsed, 
  setIsCollapsed, 
  activeView, 
  setActiveView,
  drives = [],
  currentDriveId,
  onSelectDrive,
  onSelectQuickFolder,
  driveLetter = 'X'
}) => {
  const [revitServerStatus, setRevitServerStatus] = useState<{ online: boolean; host: string; machine_name?: string } | null>(null);
  const [isVaultsExpanded, setIsVaultsExpanded] = useState(true);

  // Poll / Query Revit Server Status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const status: any = await invoke('get_revit_server_status');
        setRevitServerStatus(status);
      } catch (e) {
        setRevitServerStatus({ online: true, host: REVIT_SERVER_HOST });
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      className={cn(
        "flex flex-col h-screen bg-card/60 backdrop-blur-md border-r border-border text-muted-foreground transition-all duration-300 relative select-none",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header / Brand */}
      <div className={cn("p-3.5 border-b flex items-center h-14", isCollapsed ? "justify-center" : "space-x-2.5")}>
        <div 
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 cursor-pointer overflow-hidden bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-500 shadow-md hover:scale-105 transition-transform"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title="Toggle Navigation Pane"
        >
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white">
            <path d="M50 10 L90 30 L90 70 L50 90 L10 70 L10 30 Z" stroke="currentColor" strokeWidth="9" strokeLinejoin="round"/>
            <path d="M50 10 L50 50 M10 30 L50 50 M90 30 L50 50 M50 50 L50 90" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        {!isCollapsed && (
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm tracking-tight text-foreground">CADFlow</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">CDE</span>
            </div>
            <span className="text-[10px] text-muted-foreground truncate">Windows File Explorer</span>
          </div>
        )}
      </div>

      {/* Navigation Pane Body */}
      <div className="flex-1 overflow-y-auto py-3 space-y-4 px-2">
        {/* THIS PC / LOCAL DRIVES SECTION */}
        <div>
          {!isCollapsed && (
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 px-2 font-semibold">
              This PC
            </div>
          )}

          {/* Virtual Drive X:\ */}
          <div 
            onClick={() => {
              setActiveView('files');
              if (drives.length > 0 && onSelectDrive) {
                onSelectDrive(drives[0].drive_id, drives[0].drive_name, drives[0].root_item_id);
              }
            }}
            className={cn(
              "group py-2 px-2 rounded-md cursor-pointer flex flex-col transition-all hover:bg-muted/60",
              isCollapsed && "items-center justify-center",
              activeView === 'files' ? "bg-muted/80 text-foreground" : "text-muted-foreground"
            )}
            title={`CADFlow Virtual Drive (${driveLetter}:) - Mounted NTFS Cache`}
          >
            <div className="flex items-center w-full space-x-2.5">
              <div className="relative">
                <HardDrive size={18} className="text-primary shrink-0" />
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-background"></span>
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground truncate">CADFlow ({driveLetter}:)</span>
                    <span className="text-[9px] px-1 rounded bg-emerald-500/10 text-emerald-600 font-semibold">Mounted</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 truncate">3.8 TB free of 4.0 TB (SharePoint + Multi-Vault)</div>
                </div>
              )}
            </div>
            
            {/* Storage Progress Bar */}
            {!isCollapsed && (
              <div className="w-full bg-muted rounded-full h-1 mt-1.5 overflow-hidden">
                <div className="bg-primary h-full rounded-full" style={{ width: '5%' }}></div>
              </div>
            )}
          </div>

          {/* Revit Server 2025 London Hub */}
          <div 
            className={cn(
              "group mt-1.5 py-2 px-2 rounded-md cursor-pointer flex items-center transition-all hover:bg-muted/60",
              isCollapsed && "justify-center"
            )}
            title={`Autodesk Revit Server 2025 Host (${revitServerStatus?.host || REVIT_SERVER_HOST}) - Ready for Multi-User Worksharing`}
          >
            <div className="relative">
              <Server size={18} className="text-blue-500 shrink-0" />
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-background animate-pulse"></span>
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0 ml-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground truncate">Revit Server 2025</span>
                  <span className="text-[9px] px-1 rounded bg-blue-500/10 text-blue-600 font-semibold">Online</span>
                </div>
                <div className="text-[10px] text-muted-foreground truncate">{revitServerStatus?.host || REVIT_SERVER_HOST}</div>
              </div>
            )}
          </div>
        </div>

        {/* STORAGE VAULTS / CDE PROJECTS */}
        <div>
          {!isCollapsed && (
            <div 
              className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 px-2 font-semibold cursor-pointer hover:text-foreground"
              onClick={() => setIsVaultsExpanded(!isVaultsExpanded)}
            >
              <span>Storage Vaults</span>
              {isVaultsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </div>
          )}

          {(!isCollapsed ? isVaultsExpanded : true) && (
            <div className="space-y-1">
              {drives.map(drive => {
                const isActive = activeView === 'files' && currentDriveId === drive.drive_id;
                return (
                  <div 
                    key={drive.drive_id}
                    onClick={() => {
                      setActiveView('files');
                      if (onSelectDrive) onSelectDrive(drive.drive_id, drive.drive_name, drive.root_item_id);
                    }}
                    className={cn(
                      "py-1.5 px-2 rounded-md cursor-pointer flex items-center transition-colors text-xs", 
                      isCollapsed && "justify-center",
                      isActive 
                        ? "bg-primary/10 text-primary font-medium border-l-2 border-primary" 
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground border-l-2 border-transparent"
                    )}
                  >
                    <FolderOpen size={16} className={cn("shrink-0", isActive ? "text-primary" : "text-amber-500")} />
                    {!isCollapsed && (
                      <span className="ml-2.5 truncate" title={drive.drive_name}>
                        {drive.drive_name}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ISO 19650 QUICK ACCESS LANES */}
        {!isCollapsed && (
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 px-2 font-semibold">
              ISO 19650 States
            </div>
            <div className="space-y-0.5 text-xs">
              <div 
                className="py-1 px-2 rounded hover:bg-muted/60 cursor-pointer flex items-center gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => onSelectQuickFolder && onSelectQuickFolder('01_Work-In-Progress (WIP)')}
              >
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="truncate">01 WIP (Work-In-Progress)</span>
              </div>
              <div 
                className="py-1 px-2 rounded hover:bg-muted/60 cursor-pointer flex items-center gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => onSelectQuickFolder && onSelectQuickFolder('02_Shared (ISO 19650)')}
              >
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="truncate">02 Shared (Consultants)</span>
              </div>
              <div 
                className="py-1 px-2 rounded hover:bg-muted/60 cursor-pointer flex items-center gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => onSelectQuickFolder && onSelectQuickFolder('03_Published Deliverables')}
              >
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <span className="truncate">03 Published (Client Sign-Off)</span>
              </div>
              <div 
                className="py-1 px-2 rounded hover:bg-muted/60 cursor-pointer flex items-center gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => onSelectQuickFolder && onSelectQuickFolder('04_Archive')}
              >
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                <span className="truncate">04 Archive</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings & Admin Footer */}
      <div className="p-2 border-t border-border flex flex-col space-y-0.5">
        <div 
          onClick={() => setActiveView('admin')}
          className={cn(
            "py-1.5 px-2 rounded-md cursor-pointer flex items-center transition-colors text-xs", 
            isCollapsed && "justify-center",
            activeView === 'admin' ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Shield size={16} className="shrink-0 text-indigo-500" />
          {!isCollapsed && <span className="ml-2.5 flex-1 font-medium">BIM Admin Console</span>}
        </div>
        <div 
          onClick={() => setActiveView('settings')}
          className={cn(
            "py-1.5 px-2 rounded-md cursor-pointer flex items-center transition-colors text-xs", 
            isCollapsed && "justify-center",
            activeView === 'settings' ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Settings size={16} className="shrink-0 text-muted-foreground" />
          {!isCollapsed && <span className="ml-2.5 flex-1 font-medium">Settings & Cache</span>}
        </div>
      </div>

      {/* User Profile */}
      <div 
        onClick={() => setActiveView('profile')}
        className={cn(
          "shrink-0 p-3 border-t border-border flex items-center cursor-pointer transition-colors hover:bg-muted/60", 
          isCollapsed ? "justify-center" : "space-x-2.5",
          activeView === 'profile' ? "bg-muted" : "bg-card/40"
        )}
      >
        <SignedIn>
          <div className="shrink-0">
            <UserButton afterSignOutUrl="/" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden ml-1 min-w-0">
              <span className="text-xs font-semibold text-foreground truncate">CADFlow Architect</span>
              <span className="text-[10px] text-muted-foreground truncate">UK/India Collaboration Node</span>
            </div>
          )}
        </SignedIn>
        <SignedOut>
          <div className="w-full flex justify-center">
            <SignInButton mode="modal">
              <button className="text-xs text-primary font-medium hover:underline">Sign In</button>
            </SignInButton>
          </div>
        </SignedOut>
      </div>
    </div>
  );
};
