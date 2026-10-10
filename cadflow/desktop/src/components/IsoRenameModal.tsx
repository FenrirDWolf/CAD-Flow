import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';

interface IsoValidationFailedPayload {
  file_path: string;
}

export const IsoRenameModal: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [filePath, setFilePath] = useState('');

  useEffect(() => {
    let unlisten: () => void;
    if (window.__TAURI_IPC__) {
      try {
        listen<IsoValidationFailedPayload>('iso_validation_failed', (event) => {
          setFilePath(event.payload.file_path);
          setOpen(true);
        }).then(f => unlisten = f);
      } catch (e) {
        console.warn("Tauri listen failed:", e);
      }
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-md w-full p-6 border border-red-500/30">
        <div className="flex items-center gap-3 text-red-500 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-xl font-bold">ISO 19650 Violation</h2>
        </div>
        
        <p className="text-zinc-600 dark:text-zinc-300 mb-4">
          The file <strong className="text-zinc-900 dark:text-white break-all">{filePath}</strong> does not conform to the project's standard naming convention.
        </p>
        
        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded mb-6 text-sm text-red-800 dark:text-red-200">
          <p className="font-semibold mb-1">Required Format:</p>
          <code className="bg-red-100 dark:bg-red-900/40 px-2 py-1 rounded">PRJ-ARC-Z01-ZZ-M3-A-0001.dwg</code>
        </div>

        <div className="flex justify-end">
          <button 
            onClick={() => setOpen(false)}
            className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded hover:bg-zinc-300 dark:hover:bg-zinc-700 font-medium transition-colors"
          >
            Acknowledge & Rename
          </button>
        </div>
      </div>
    </div>
  );
};

