import React from 'react';
import { 
  FolderOpen, 
  ChevronLeft, 
  ChevronRight, 
  Settings, 
  Shield, Lock
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ViewType } from '../App';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react';

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
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  isCollapsed, 
  setIsCollapsed, 
  activeView, 
  setActiveView,
  drives = [],
  currentDriveId,
  onSelectDrive
}) => {
  return (
    <div 
      className={cn(
        "flex flex-col h-screen bg-background border-r text-muted-foreground transition-all duration-300 relative",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Collapse Toggle */}
      

      {/* Header / Brand */}
      <div className={cn("p-4 border-b flex items-center h-16", isCollapsed ? "justify-center" : "space-x-3")}>
                <div 
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 cursor-pointer overflow-hidden bg-gradient-to-br from-indigo-500 to-blue-600 shadow-md hover:opacity-90 transition-opacity"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title="Toggle Sidebar"
        >
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white">
            <path d="M50 10 L90 30 L90 70 L50 90 L10 70 L10 30 Z" stroke="currentColor" strokeWidth="8" strokeLinejoin="round"/>
            <path d="M50 10 L50 50 M10 30 L50 50 M90 30 L50 50 M50 50 L50 90" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        {!isCollapsed && <span className="font-semibold text-lg tracking-wide text-foreground">CADFlow</span>}
      </div>

      {/* Health Indicator */}
      <div className={cn("p-4 border-b flex flex-col", isCollapsed && "items-center")}>
        {!isCollapsed && <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-3 font-semibold">System Health</div>}
        <div className="flex items-center space-x-3">
          <div className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </div>
          {!isCollapsed && <span className="text-foreground text-sm font-medium">X:\ Drive Mounted</span>}
        </div>
      </div>

      {/* Project Tree */}
      <div className="flex-1 overflow-y-auto py-4">
        {!isCollapsed && <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2 px-4 font-semibold">Storage Vaults</div>}
        <div className="space-y-1 px-2">
          
          {drives.map(drive => {
            const isActive = activeView === 'files' && currentDriveId === drive.drive_id;
            return (
              <div 
                key={drive.drive_id}
                onClick={() => {
                  setActiveView('files');
                  if (onSelectDrive) onSelectDrive(drive.drive_id, drive.drive_name, drive.root_item_id);
                }}
                className={cn("py-2 px-2 rounded-md cursor-pointer flex items-center transition-colors", 
                  isCollapsed && "justify-center",
                  isActive ? "bg-muted text-foreground border-l-2 border-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground border-l-2 border-transparent"
                )}
              >
                <FolderOpen size={16} className="shrink-0" />
                {!isCollapsed && <span className="text-sm font-medium ml-3 truncate" title={drive.drive_name}>{drive.drive_name}</span>}
              </div>
            );
          })}
          
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="p-2 border-t flex flex-col space-y-1">
        <div 
          onClick={() => { /* Disabled for Demo */ }}
          className={cn("py-2 px-2 rounded-md cursor-pointer flex items-center transition", 
            isCollapsed && "justify-center",
            "text-muted-foreground opacity-50 cursor-not-allowed"
          )}
        >
          <Shield size={16} className="shrink-0" />
          {!isCollapsed && <span className="text-sm ml-3 flex-1">Admin Panel</span>}
          {!isCollapsed && <Lock size={12} className="ml-auto" />}
        </div>
        <div 
          onClick={() => { /* Disabled for Demo */ }}
          className={cn("py-2 px-2 rounded-md cursor-pointer flex items-center transition", 
            isCollapsed && "justify-center",
            "text-muted-foreground opacity-50 cursor-not-allowed"
          )}
        >
          <Settings size={16} className="shrink-0" />
          {!isCollapsed && <span className="text-sm ml-3 flex-1">Settings</span>}
          {!isCollapsed && <Lock size={12} className="ml-auto" />}
        </div>
      </div>

      {/* User Profile */}
      <div 
        onClick={() => setActiveView('profile')}
        className={cn("shrink-0 p-4 border-t flex items-center cursor-pointer transition-colors hover:bg-muted", 
          isCollapsed ? "justify-center" : "space-x-3",
          activeView === 'profile' ? "bg-muted" : "bg-background"
        )}
      >
        <SignedIn>
          <div className="shrink-0">
            <UserButton afterSignOutUrl="/" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden ml-2">
              <span className="text-sm font-medium text-foreground truncate">My Account</span>
              <span className="text-xs text-muted-foreground truncate">Manage Access</span>
            </div>
          )}
        </SignedIn>
        <SignedOut>
          <div className="w-full flex justify-center">
            <SignInButton mode="modal">
              
            </SignInButton>
          </div>
        </SignedOut>
      </div>
    </div>
  );
};







