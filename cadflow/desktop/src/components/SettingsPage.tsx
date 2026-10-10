import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Database, ShieldCheck, HardDrive, DownloadCloud, Activity } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground mt-1">Manage local workspace, integrations, and preferences.</p>
      </div>

      <div className="grid gap-6">
        {/* Entra ID Integration */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-md">
                <ShieldCheck className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <CardTitle>Microsoft Entra ID (Azure AD)</CardTitle>
                <CardDescription>Identity provider for SSO and RBAC</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-md bg-muted/30">
              <div className="space-y-1">
                <p className="text-sm font-medium">Tenant Status</p>
                <p className="text-sm text-muted-foreground">Connected to Twilight Group Inc.</p>
              </div>
              <Button variant="outline" size="sm">Manage Connection</Button>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Auto-Sync Azure AD Groups</label>
              <p className="text-xs text-muted-foreground">When enabled, users added to M365 groups will automatically receive CADFlow access.</p>
              <div className="flex items-center gap-4 mt-2">
                <Button variant="secondary" size="sm">Force Sync Now</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Local Storage & Sync Path */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-md">
                <HardDrive className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <CardTitle>Local Sync Directory</CardTitle>
                <CardDescription>Map your cloud files to your local OneDrive / SharePoint synced folder for instant opening.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Local SharePoint/OneDrive Path</label>
              <div className="flex gap-2">
                <Input 
                  type="text" 
                  id="sync-path-input"
                  defaultValue={localStorage.getItem('localSyncPath') || ''} 
                  placeholder="e.g. C:\Users\John\OneDrive - Architecture Firm"
                />
                <Button 
                  onClick={() => {
                    const el = document.getElementById('sync-path-input') as HTMLInputElement;
                    localStorage.setItem('localSyncPath', el.value);
                    alert('Sync path saved!');
                  }}
                >
                  Save
                </Button>
                <Button 
                  variant="outline"
                  onClick={async () => {
                    try {
                      const { invoke } = await import('@tauri-apps/api/core');
                      const paths: string[] = await invoke('get_onedrive_paths');
                      if (paths && paths.length > 0) {
                        const el = document.getElementById('sync-path-input') as HTMLInputElement;
                        // Just pick the first detected path (likely the org OneDrive)
                        el.value = paths[0];
                        localStorage.setItem('localSyncPath', paths[0]);
                        alert(`Auto-detected: ${paths[0]}`);
                      } else {
                        alert('Could not auto-detect OneDrive paths from Registry.');
                      }
                    } catch (e) {
                      console.error(e);
                      alert('Error auto-detecting paths.');
                    }
                  }}
                >
                  Auto-Detect
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                This enables instant-launch. When you click Launch, CADFlow will tell Windows to open this local path directly, skipping the download step.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Sync Engine */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-md">
                <Activity className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <CardTitle>Sync Engine & P2P</CardTitle>
                <CardDescription>Delta-chunking and LAN peer discovery</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <p className="text-sm font-medium">Delta-Chunking (CDC)</p>
                <p className="text-xs text-muted-foreground">Only upload changed blocks for 1GB+ RVT files</p>
              </div>
              <div className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-xs rounded-full font-medium">
                Active
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Local LAN Discovery (mDNS)</p>
                <p className="text-xs text-muted-foreground">Download CAD chunks from peers in the same office</p>
              </div>
              <Button variant="secondary" size="sm">Configure</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
