import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Shield, Users, Lock, HardDrive, Server, ChevronLeft, ChevronRight, Building } from 'lucide-react';
import { OrganizationProfile } from '@clerk/clerk-react';
import { toast } from 'sonner';

export const AdminPage: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [locks, setLocks] = useState<any[]>([]);
  const [drives, setDrives] = useState<any[]>([]);
  const [storage, setStorage] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  
  const [activeTab, setActiveTab] = useState<'users' | 'vault-access' | 'locks' | 'storage' | 'audit'>('users');

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

    </div>
  );
};

export default AdminPage;

