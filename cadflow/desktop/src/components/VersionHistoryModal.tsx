import React, { useState, useEffect } from 'react';
import { X, Clock, RotateCcw, User } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

export interface Version {
  id: string;
  timestamp: string;
  author: string;
  comment: string;
}

interface Props {
  isOpen: boolean;
  fileName: string;
  sharepointItemId: string;
  onClose: () => void;
}

export const VersionHistoryModal: React.FC<Props> = ({ isOpen, fileName, sharepointItemId, onClose }) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && sharepointItemId) {
      fetchVersions();
    }
  }, [isOpen, sharepointItemId]);

  const fetchVersions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8080/api/v1/files/${sharepointItemId}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data);
      } else {
        throw new Error("Failed to fetch versions");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (versionId: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:8080/api/v1/files/${sharepointItemId}/restore/${versionId}`, {
        method: 'POST'
      });
      if (res.ok) {
        toast.success(`Restored ${fileName} to version ${versionId}`);
        onClose();
      } else {
        throw new Error("Restore failed");
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-[500px] shadow-lg border border-border animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Version History</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X size={18} />
          </Button>
        </div>
        
        <div className="p-6">
          <p className="text-sm text-muted-foreground mb-4">
            Viewing history for <span className="font-semibold text-foreground">{fileName}</span>
          </p>
          
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading versions...</div>
          ) : versions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No previous versions found.</div>
          ) : (
            <div className="space-y-4">
              {versions.map((v, i) => (
                <div key={v.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">Version {versions.length - i}</span>
                      <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded-full">
                        {new Date(v.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <User size={12} />
                      <span>{v.author}</span>
                      <span>•</span>
                      <span>{v.comment}</span>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleRestore(v.id)}
                    className="shrink-0"
                  >
                    <RotateCcw size={14} className="mr-1.5" />
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
