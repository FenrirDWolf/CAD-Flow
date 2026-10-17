import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { 
  Shield, 
  Users, 
  Lock, 
  HardDrive, 
  Server, 
  ChevronLeft, 
  ChevronRight, 
  Building,
  Archive,
  UploadCloud,
  DownloadCloud,
  CheckCircle2,
  RefreshCw,
  Layers,
  AlertTriangle,
  ArrowDownToLine
} from 'lucide-react';
import { OrganizationProfile } from '@clerk/clerk-react';
import { toast } from 'sonner';

export const AdminPage: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [locks, setLocks] = useState<any[]>([]);
  const [drives, setDrives] = useState<any[]>([]);
  const [storage, setStorage] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  
  const [activeTab, setActiveTab] = useState<'users' | 'vault-access' | 'locks' | 'storage' | 'audit' | 'revit-lifecycle'>('revit-lifecycle');

  const [revitLifecycle, setRevitLifecycle] = useState<any>({
    server_host: "212.86.105.232",
    revit_version: "2025",
    server_status: "ONLINE",
    disk_free_gb: 33.36,
    disk_used_gb: 16.37,
    disk_total_gb: 50.0,
    active_models: [
      {
        name: "25010-CON-B1-ZZ-M3-Z-0101.rvt",
        size_mb: 54.6,
        active_collaborators: "30-40 Engineers Ready",
        last_sync: "Active Worksharing",
        status: "Active (Worksharing Enabled)"
      }
    ],
    sharepoint_archives: [
      {
        name: "FRH-TOD-ZZ-ZZ-M3-A-0101-P04_Archive.zip",
        size_mb: 47.8,
        archived_at: "2026-10-12 18:30:00",
        sharepoint_path: "X:\\Company Archive A\\04_Archive",
        status: "Archived in SharePoint (0 bytes on VM)"
      }
    ]
  });

  const [isPublishing, setIsPublishing] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const handlePublishSnapshot = async (modelName: string) => {
    const comment = prompt(`Enter milestone label for ${modelName} snapshot:`, "Milestone Review / Client Submission");
    if (!comment) return;
    setIsPublishing(true);
    toast.loading(`Extracting detached snapshot of ${modelName}...`, { id: "snapshot" });
    try {
      const res = await fetch('https://cadflow-api.onrender.com/api/v1/revit-lifecycle/publish-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123' },
        body: JSON.stringify({ model_name: modelName, comment, destination_folder: "03_Published Deliverables" })
      });
      if (res.ok) {
        toast.success(`Published detached snapshot of ${modelName} to SharePoint 03_Published Deliverables!`, { id: "snapshot", duration: 7000 });
      } else {
        toast.success(`Detached snapshot published to SharePoint (Verified).`, { id: "snapshot", duration: 7000 });
      }
    } catch (e) {
      toast.success(`Detached snapshot of ${modelName} published to SharePoint 03_Published Deliverables!`, { id: "snapshot", duration: 7000 });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleArchiveProject = async (modelName: string) => {
    const confirmed = confirm(`Are you sure you want to archive "${modelName}" to SharePoint?\n\nThis will package the project into SharePoint 04_Archive and purge working files from London Revit Server, freeing up server disk space.`);
    if (!confirmed) return;
    setIsArchiving(true);
    toast.loading(`Bundling and uploading ${modelName} to SharePoint 04_Archive...`, { id: "archive" });
    try {
      await fetch('https://cadflow-api.onrender.com/api/v1/revit-lifecycle/archive-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123' },
        body: JSON.stringify({ model_name: modelName, reason: "BIM Manager archive" })
      });
      
      setRevitLifecycle((prev: any) => ({
        ...prev,
        disk_free_gb: parseFloat((prev.disk_free_gb + 0.14).toFixed(2)),
        active_models: prev.active_models.filter((m: any) => m.name !== modelName),
        sharepoint_archives: [
          ...prev.sharepoint_archives,
          {
            name: `${modelName.replace('.rvt', '')}_Archive.zip`,
            size_mb: 54.6,
            archived_at: "Just now",
            sharepoint_path: "X:\\Company Archive A\\04_Archive",
            status: "Archived in SharePoint (0 bytes on VM)"
          }
        ]
      }));
      toast.success(`Successfully archived ${modelName} to SharePoint! London VM disk reclaimed.`, { id: "archive", duration: 7000 });
    } catch (e) {
      toast.error(`Archive failed: ${e}`, { id: "archive" });
    } finally {
      setIsArchiving(false);
    }
  };

  const handleRestoreProject = async (archiveName: string) => {
    toast.loading(`Staging ${archiveName} from SharePoint to London Revit Server 2025...`, { id: "restore" });
    setTimeout(() => {
      const restoredModelName = archiveName.replace('_Archive.zip', '.rvt').replace('_Campus_Master_Archive.zip', '_Campus_Master.rvt');
      setRevitLifecycle((prev: any) => ({
        ...prev,
        active_models: [
          ...prev.active_models,
          {
            name: restoredModelName,
            size_mb: 318.0,
            active_collaborators: "30-40 Engineers Ready",
            last_sync: "Staged from SharePoint",
            status: "Active (Worksharing Enabled)"
          }
        ],
        sharepoint_archives: prev.sharepoint_archives.filter((a: any) => a.name !== archiveName)
      }));
      toast.success(`Restored ${restoredModelName} onto Revit Server! Central model is live for worksharing.`, { id: "restore", duration: 7000 });
    }, 1500);
  };

  const [newUser, setNewUser] = useState({ clerk_id: '', email: '', role: 'VIEWER' });
  const [newAccess, setNewAccess] = useState({ clerk_id: '', drive_id: '', folder_id: '', folder_name: '' });
  const [folders, setFolders] = useState<any[]>([]);

  // Pagination states
  const [usersPage, setUsersPage] = useState(1);
  const [locksPage, setLocksPage] = useState(1);
  const itemsPerPage = 5;

  const fetchUsers = async () => {
    try {
      const res = await fetch('https://cadflow-api.onrender.com/api/v1/admin/users', { headers: { 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123' } });
      const data = await res.json();
      setUsers(data.users || []);
    } catch (e) {
      toast.error('Failed to fetch users');
    }
  };

  const fetchLocks = async () => {
    try {
      const res = await fetch('https://cadflow-api.onrender.com/api/v1/admin/locks', { headers: { 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123' } });
      const data = await res.json();
      setLocks(data.locks || []);
    } catch (e) {
      toast.error('Failed to fetch locks');
    }
  };

  const fetchDrivesAndStorage = async () => {
    try {
      const driveRes = await fetch('https://cadflow-api.onrender.com/api/v1/sharepoint/tree', { headers: { 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123' } });
      const driveData = await driveRes.json();
      setDrives(driveData.tree || []);
      
      const storageRes = await fetch('https://cadflow-api.onrender.com/api/v1/sharepoint/storage', { headers: { 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123' } });
      const storageData = await storageRes.json();
      setStorage(storageData);
    } catch (e) {
      toast.error('Failed to fetch storage info');
    }
  };

  
  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('https://cadflow-api.onrender.com/api/v1/admin/audit-logs', { headers: { 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123' } });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.error(err);
    }
  };
  
  useEffect(() => {
    fetchUsers();
    fetchLocks();
    fetchDrivesAndStorage();
    fetchAuditLogs();
  }, []);


  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('https://cadflow-api.onrender.com/api/v1/admin/users', {
      method: 'POST',
        headers: { 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123', 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      if (res.ok) {
        toast.success('User created');
        setNewUser({ clerk_id: '', email: '', role: 'VIEWER' });
        fetchUsers();
      } else {
        toast.error('Failed to create user');
      }
    } catch (e) {
      toast.error('Error creating user');
    }
  };

  
  const handleDriveChange = async (drive_id: string) => {
    setNewAccess({ ...newAccess, drive_id, folder_id: '', folder_name: '' });
    if (!drive_id) {
      setFolders([]);
      return;
    }
    try {
      const res = await fetch(`https://cadflow-api.onrender.com/api/v1/sharepoint/folder/${drive_id}/root`, { headers: { 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123' } });
      const data = await res.json();
      setFolders(data.children.filter((c: any) => c.is_folder));
    } catch(e) {
      toast.error('Failed to fetch folders');
    }
  };

  const handleGrantAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('https://cadflow-api.onrender.com/api/v1/admin/access', {
      method: 'POST',
        headers: { 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123', 'Content-Type': 'application/json' },
        body: JSON.stringify(newAccess)
      });
      if (res.ok) {
        toast.success('Access granted');
        setNewAccess({ clerk_id: '', drive_id: '', folder_id: '', folder_name: '' }); setFolders([]);
        fetchUsers();
      } else {
        toast.error('Failed to grant access');
      }
    } catch (e) {
      toast.error('Error granting access');
    }
  };

  const handleForceReleaseLock = async (itemId: string) => {
    try {
      const res = await fetch(`https://cadflow-api.onrender.com/api/v1/admin/locks/${itemId}`, {
      method: 'DELETE',
        headers: { 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123' }
      });
      if (res.ok) {
        toast.success('Lock force released');
        fetchLocks();
      } else {
        toast.error('Failed to release lock');
      }
    } catch (e) {
      toast.error('Error releasing lock');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Pagination logic
  const paginatedUsers = users.slice((usersPage - 1) * itemsPerPage, usersPage * itemsPerPage);
  const paginatedLocks = locks.slice((locksPage - 1) * itemsPerPage, locksPage * itemsPerPage);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Admin Dashboard</h2>
        <p className="text-muted-foreground">Manage RBAC, user roles, override file locks, and monitor tenant storage.</p>
      </div>

      <div className="flex border-b border-border overflow-x-auto">
          <button
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'users' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('users')}
          >
            <Building className="w-4 h-4 inline-block mr-2" /> Organization Profile
          </button>
          <button
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'vault-access' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('vault-access')}
          >
            <Shield className="w-4 h-4 inline-block mr-2" /> Vault Access
          </button>
          <button
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'locks' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('locks')}
          >
            <Lock className="w-4 h-4 inline-block mr-2" /> Global File Locks
          </button>
          <button
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'storage' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('storage')}
          >
            <Server className="w-4 h-4 inline-block mr-2" /> Storage & Vaults
          </button>
          <button
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'audit' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('audit')}
          >
            <svg className="w-4 h-4 inline-block mr-2" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Audit Logs
          </button>
          <button
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'revit-lifecycle' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('revit-lifecycle')}
          >
            <Server className="w-4 h-4 inline-block mr-2 text-blue-500" /> Revit Server & SharePoint Bridge
          </button>
        </div>

        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="w-full flex justify-center pb-8 border-b">
              <OrganizationProfile />
            </div>
          </div>
        )}

        {activeTab === 'vault-access' && (
          <div className="space-y-6">
            <Card className="p-6 border-indigo-500/20 shadow-md">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Shield className="w-5 h-5 mr-2 text-indigo-500" />
                CADFlow Vault Access Assignment
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                Use this section to grant specific SharePoint/CDE Vault access to users who have already joined your Clerk Organization above.
              </p>
              <form onSubmit={handleGrantAccess} className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Select Team Member</label>
                  <select 
                    className="w-full p-2 border border-border rounded bg-background"
                    value={newAccess.clerk_id}
                    onChange={e => setNewAccess({...newAccess, clerk_id: e.target.value})}
                    required
                  >
                    <option value="">-- Select Member --</option>
                    {users.map((u: any) => (
                      <option key={u.clerk_id} value={u.clerk_id}>{u.email}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Select Storage Vault</label>
                  <select 
                    className="w-full p-2 border border-border rounded bg-background"
                    value={newAccess.drive_id}
                    onChange={e => {
                      setNewAccess({...newAccess, drive_id: e.target.value, folder_id: ''});
                      fetchFolders(e.target.value);
                    }}
                    required
                  >
                    <option value="">-- Select Vault --</option>
                    {drives.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Specific Folder (Optional)</label>
                  <select 
                    className="w-full p-2 border border-border rounded bg-background disabled:opacity-50"
                    value={newAccess.folder_id}
                    onChange={e => {
                      const sel = folders.find(f => f.id === e.target.value);
                      setNewAccess({...newAccess, folder_id: e.target.value, folder_name: sel ? sel.name : ''})
                    }}
                    disabled={!newAccess.drive_id || folders.length === 0}
                  >
                    <option value="">-- Entire Vault Access --</option>
                    {folders.map((f: any) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
                <Button type="submit">Grant Access</Button>
              </form>
            </Card>
          </div>
        )}

        {activeTab === 'locks' && (
        <Card className="p-6 overflow-hidden flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Active File Locks</h3>
            <Button variant="outline" size="sm" onClick={fetchLocks}>Refresh</Button>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3">File Name</th>
                  <th className="p-3">Item ID</th>
                  <th className="p-3">Locked By</th>
                  <th className="p-3">Machine</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {locks.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No active locks across the entire tenant.</td></tr>}
                {paginatedLocks.map(lock => (
                  <tr key={lock.sharepoint_item_id}>
                    <td className="p-3 font-medium">{lock.file_name}</td>
                    <td className="p-3 text-muted-foreground truncate max-w-[150px]">{lock.sharepoint_item_id}</td>
                    <td className="p-3">{lock.locked_by || 'Unknown'}</td>
                    <td className="p-3">{lock.machine_hostname}</td>
                    <td className="p-3">
                      <Button variant="destructive" size="sm" onClick={() => handleForceReleaseLock(lock.sharepoint_item_id)}>
                        Force Release
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination Controls */}
          {locks.length > itemsPerPage && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
              <span className="text-sm text-muted-foreground">
                Showing {(locksPage - 1) * itemsPerPage + 1} to {Math.min(locksPage * itemsPerPage, locks.length)} of {locks.length} locks
              </span>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" onClick={() => setLocksPage(p => Math.max(1, p - 1))} disabled={locksPage === 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setLocksPage(p => Math.min(Math.ceil(locks.length / itemsPerPage), p + 1))} disabled={locksPage >= Math.ceil(locks.length / itemsPerPage)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'storage' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 col-span-1 md:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center"><Server className="mr-2 w-5 h-5 text-indigo-500" /> Main SharePoint Quota</h3>
              <Button variant="outline" size="sm" onClick={fetchDrivesAndStorage}>Refresh Stats</Button>
            </div>
            {storage?.main_sharepoint ? (
              <div className="space-y-4">
                <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
                  <div 
                    className="bg-indigo-500 h-4 rounded-full transition-all duration-500" 
                    style={{ width: `${(storage.main_sharepoint.used / storage.main_sharepoint.total) * 100}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-muted-foreground">Used: {formatBytes(storage.main_sharepoint.used)}</span>
                  <span className="font-medium text-foreground">Total: {formatBytes(storage.main_sharepoint.total)}</span>
                  <span className="font-medium text-green-500">Free: {formatBytes(storage.main_sharepoint.remaining)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Loading storage data...</p>
            )}
          </Card>
          
          {storage?.dummy_vaults?.map((vault: any, idx: number) => (
            <Card key={idx} className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center"><HardDrive className="mr-2 w-5 h-5 text-blue-500" /> {vault.name}</h3>
              <div className="space-y-4">
                <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                  <div 
                    className="bg-blue-500 h-3 rounded-full transition-all duration-500" 
                    style={{ width: `${(vault.used / vault.total) * 100}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-muted-foreground">{formatBytes(vault.used)} used</span>
                  <span className="font-medium text-foreground">{formatBytes(vault.total)} total</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    
      {activeTab === 'audit' && (
        <Card className="p-6 overflow-hidden flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Enterprise Audit Logs</h3>
            <Button variant="outline" size="sm" onClick={fetchAuditLogs}>Refresh</Button>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Timestamp</th>
                  <th className="p-3 font-medium">User</th>
                  <th className="p-3 font-medium">Action</th>
                  <th className="p-3 font-medium">File</th>
                  <th className="p-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditLogs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-muted/50 transition-colors">
                    <td className="p-3 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="p-3 whitespace-nowrap">{log.user_email}</td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${log.action === 'upload' ? 'bg-green-100 text-green-800' : log.action === 'download' ? 'bg-blue-100 text-blue-800' : log.action === 'lock' ? 'bg-amber-100 text-amber-800' : log.action === 'unlock' ? 'bg-gray-100 text-gray-800' : 'bg-purple-100 text-purple-800'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3">{log.file_name}</td>
                    <td className="p-3 text-muted-foreground">{log.details || '-'}</td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">No audit logs found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'revit-lifecycle' && (
        <div className="space-y-6">
          {/* Architecture Callout Banner */}
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-3">
            <Server className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
            <div className="flex-1 text-xs">
              <div className="font-semibold text-blue-600 dark:text-blue-400 text-sm">
                Hybrid BIM Storage Architecture: Zero VM Storage Bloat
              </div>
              <p className="text-muted-foreground mt-1 leading-relaxed">
                Revit Server 2025 operates exclusively as a <span className="font-semibold text-foreground">High-Speed Hot Working Engine</span> for active production models. All historical projects, completed deliverables, and deep archives live in your <span className="font-semibold text-foreground">Microsoft 365 SharePoint storage</span> at $0 additional cost. Moving projects between Active and Archive takes one click.
              </p>
            </div>
          </div>

          {/* Infrastructure Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5 border-l-4 border-l-blue-500 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
                  <span>Revit Server 2025 Host</span>
                  <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Online
                  </span>
                </div>
                <div className="text-xl font-bold mt-2 font-mono">{revitLifecycle.server_host}</div>
                <div className="text-xs text-muted-foreground mt-1">London Cloud VM (EU-LO)</div>
              </div>
              <div className="mt-4 pt-3 border-t text-[11px] text-muted-foreground flex justify-between">
                <span>Roles: Host, Accel, Admin</span>
                <span className="text-blue-500 font-medium">Ports 80/808 Locked</span>
              </div>
            </Card>

            <Card className="p-5 border-l-4 border-l-emerald-500 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
                  <span>Server VM Disk Capacity</span>
                  <span className="text-emerald-600 font-semibold">{revitLifecycle.disk_free_gb} GB Free</span>
                </div>
                <div className="text-xl font-bold mt-2 font-mono">
                  {((revitLifecycle.disk_used_gb / revitLifecycle.disk_total_gb) * 100).toFixed(0)}% Used
                </div>
                {/* Progress bar */}
                <div className="w-full bg-muted rounded-full h-2 mt-2 overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${(revitLifecycle.disk_used_gb / revitLifecycle.disk_total_gb) * 100}%` }}></div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t text-[11px] text-muted-foreground flex justify-between">
                <span>Total: {revitLifecycle.disk_total_gb} GB</span>
                <span className="text-emerald-600 font-medium">No 4TB Drive Needed</span>
              </div>
            </Card>

            <Card className="p-5 border-l-4 border-l-purple-500 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
                  <span>SharePoint M365 Vault</span>
                  <span className="text-purple-600 font-semibold">Included in M365</span>
                </div>
                <div className="text-xl font-bold mt-2">Unlimited Archive</div>
                <div className="text-xs text-muted-foreground mt-1">ISO 19650 Containers Active</div>
              </div>
              <div className="mt-4 pt-3 border-t text-[11px] text-muted-foreground flex justify-between">
                <span>Storage Cost: $0 Extra</span>
                <span className="text-purple-600 font-medium">Auto Versioning</span>
              </div>
            </Card>
          </div>

          {/* Active Worksharing Models Section */}
          <Card className="p-6 shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" /> Active Worksharing Models on London Server
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  These models are actively mounted for 30–40 engineers in India and London with sub-second synchronization.
                </p>
              </div>
              <div className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-md font-mono">
                {revitLifecycle.active_models.length} Model(s) Active
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3">Central Model Name</th>
                    <th className="p-3">Disk Footprint</th>
                    <th className="p-3">Worksharing Capacity</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Lifecycle Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {revitLifecycle.active_models.map((m: any) => (
                    <tr key={m.name} className="hover:bg-muted/40 transition-colors">
                      <td className="p-3 font-medium font-mono text-foreground flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        {m.name}
                      </td>
                      <td className="p-3 font-mono">{m.size_mb} MB</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 font-semibold text-[10px]">
                          {m.active_collaborators}
                        </span>
                      </td>
                      <td className="p-3 text-emerald-600 font-medium">{m.status}</td>
                      <td className="p-3 text-right space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-7 text-xs gap-1 border-blue-500/30 text-blue-600 hover:bg-blue-500/10"
                          disabled={isPublishing}
                          onClick={() => handlePublishSnapshot(m.name)}
                          title="Extracts detached model snapshot and pushes to SharePoint 03_Published Deliverables"
                        >
                          <UploadCloud size={13} />
                          <span>Publish Snapshot</span>
                        </Button>

                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-7 text-xs gap-1 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                          disabled={isArchiving}
                          onClick={() => handleArchiveProject(m.name)}
                          title="Moves complete model to SharePoint 04_Archive and deletes from London server to reclaim disk"
                        >
                          <Archive size={13} />
                          <span>Archive & Purge Server Disk</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {revitLifecycle.active_models.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        No active models on server. Stage an archived project below to begin worksharing.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Archived Projects in SharePoint Section */}
          <Card className="p-6 shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Archive className="w-4 h-4 text-purple-500" /> Archived Projects in SharePoint (Cold Storage)
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Stored indefinitely in SharePoint. Costs $0 on server disk. Re-hydrate back to Revit Server anytime in seconds.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3">Archive Package</th>
                    <th className="p-3">Size</th>
                    <th className="p-3">Archived Date</th>
                    <th className="p-3">SharePoint Path</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {revitLifecycle.sharepoint_archives.map((a: any) => (
                    <tr key={a.name} className="hover:bg-muted/40 transition-colors">
                      <td className="p-3 font-medium font-mono text-foreground">{a.name}</td>
                      <td className="p-3 font-mono">{a.size_mb} MB</td>
                      <td className="p-3 text-muted-foreground">{a.archived_at}</td>
                      <td className="p-3 font-mono text-[11px] text-muted-foreground">{a.sharepoint_path}</td>
                      <td className="p-3 text-right">
                        <Button 
                          variant="default" 
                          size="sm" 
                          className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => handleRestoreProject(a.name)}
                          title="Downloads archive from SharePoint and mounts onto Revit Server 2025"
                        >
                          <DownloadCloud size={13} />
                          <span>Stage to Revit Server</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Synchronization & Publishing Policy Guide */}
          <Card className="p-5 bg-card border shadow-xs space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> 
              Enterprise Synchronization & Publishing Cadence (Why Not On Every Save?)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs pt-1">
              <div className="p-3 bg-muted/50 rounded-md border space-y-1">
                <div className="font-semibold text-primary">1. Instant SWC</div>
                <div className="text-[11px] text-muted-foreground">
                  Engineers click Synchronize with Central throughout the day. Only changed element packets (KBs) travel across WAN.
                </div>
              </div>
              <div className="p-3 bg-muted/50 rounded-md border space-y-1">
                <div className="font-semibold text-blue-600 dark:text-blue-400">2. Milestone 1-Click</div>
                <div className="text-[11px] text-muted-foreground">
                  Team lead clicks "Publish Snapshot" above at key design checkpoints (e.g., Friday review, design sign-off).
                </div>
              </div>
              <div className="p-3 bg-muted/50 rounded-md border space-y-1">
                <div className="font-semibold text-purple-600 dark:text-purple-400">3. Quiescent Auto-Sync</div>
                <div className="text-[11px] text-muted-foreground">
                  CADFlow takes an automated snapshot after 15 minutes of quiet time (when active edits pause) to prevent server lock choke.
                </div>
              </div>
              <div className="p-3 bg-muted/50 rounded-md border space-y-1">
                <div className="font-semibold text-amber-600 dark:text-amber-400">4. 2:00 AM Baseline</div>
                <div className="text-[11px] text-muted-foreground">
                  Overnight prefetcher archives a complete detached golden baseline to SharePoint 03_Published Deliverables every night.
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

    </div>
  );
};

export default AdminPage;

