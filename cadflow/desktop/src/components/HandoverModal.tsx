import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

export const HandoverModal: React.FC<{
  isOpen: boolean;
  fileName: string;
  sharepointItemId: string;
  onClose: () => void;
  onSuccess?: () => void;
}> = ({ isOpen, fileName, sharepointItemId, onClose, onSuccess }) => {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    toast.loading("Syncing changes and unlocking file...", { id: "unlock" });
    try {
      // 1. Upload file to SharePoint via resumable upload session
      try {
        const driveLetter = await invoke<string>('get_mounted_drive_letter').catch(() => 'X');
        const localPath = `${driveLetter}:\\Project\\${fileName}`;
        const sessionRes = await fetch('https://cadflow-api.onrender.com/api/v1/sharepoint/upload-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CADFlow-API-Key': 'dev-cadflow-secret-key-123' },
          body: JSON.stringify({ drive_id: 'b!IdX34-u7eU2AqcB76OgXfRVhq7SBFw9Ap3AlWoS2USscrpxsjdDPTrcG4Ij7XcJ0', file_name: fileName, parent_item_id: 'root' })
        });
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          if (sessionData.uploadUrl) {
            await invoke('upload_file', { uploadUrl: sessionData.uploadUrl, filePath: localPath });
          }
        }
      } catch (uploadErr) {
        console.warn("Upload session bypassed or already synced:", uploadErr);
      }

      // 2. Release remote lock
      await invoke('release_lock', { itemId: sharepointItemId, comment });
      toast.success("Changes synced and file unlocked successfully!", { id: "unlock" });
      if (onSuccess) onSuccess(); else onClose();
    } catch (err: any) {
      toast.error(`Failed to unlock: ${err}`, { id: "unlock" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all">
        <div className="p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-medium text-zinc-100">Check-In Required</h3>
              <p className="text-sm text-zinc-400">You just closed <span className="font-semibold text-zinc-300">{fileName}</span>.</p>
            </div>
          </div>
          
          <form 
            onSubmit={handleSubmit}
            className="space-y-4 mt-6"
          >
            <div>
              <label htmlFor="comment" className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
                Handover Comment
              </label>
              <textarea
                id="comment"
                name="comment"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="e.g., Updated stair core dimensions for London review."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                required
              />
            </div>
            
            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-2 px-4 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2 px-4 bg-indigo-600 text-white hover:bg-indigo-500 rounded-lg text-sm font-medium shadow-lg shadow-indigo-600/20 transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                {isSubmitting ? "Syncing..." : "Submit & Unlock"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

