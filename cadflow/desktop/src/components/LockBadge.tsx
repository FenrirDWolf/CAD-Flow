import React from 'react';
import { type FileLock } from '../hooks/useRealtimeLocks';
import { Badge } from './ui/Badge';

export const LockBadge: React.FC<{ status: FileLock['status']; lockedBy?: string }> = ({ status, lockedBy }) => {
  const getVariant = () => {
    switch(status) {
      case 'AVAILABLE': return 'success';
      case 'LOCKED': return 'destructive';
      case 'SYNCING': return 'warning';
      case 'STALE': return 'secondary';
      default: return 'default';
    }
  };

  const labels = {
    AVAILABLE: 'Available',
    LOCKED: `Locked by ${lockedBy}`,
    SYNCING: 'Syncing Checkpoint...',
    STALE: `Stale Lock (${lockedBy})`
  };

  return (
    <Badge variant={getVariant()} className="font-medium gap-1.5 py-1">
      {status === 'SYNCING' && (
        <span className="relative flex h-2 w-2 mr-1">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
        </span>
      )}
      {status === 'AVAILABLE' && <div className="h-1.5 w-1.5 rounded-full bg-green-500" />}
      {status === 'LOCKED' && <div className="h-1.5 w-1.5 rounded-full bg-red-500" />}
      {status === 'STALE' && <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />}
      <span>{labels[status]}</span>
    </Badge>
  );
};
