import React, { useState } from 'react';
import { Loader2, Clock } from 'lucide-react';
import { Badge } from './ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';

interface SyncStatus {
  userName: string;
  status: 'WAITING' | 'SYNCING' | 'COMPLETED';
  progress?: number;
}

export const SyncQueueIndicator: React.FC<{
  sharepointItemId: string;
  fileName: string;
}> = ({ sharepointItemId, fileName }) => {
  const [queue] = useState<SyncStatus[]>([]);

  if (queue.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
          Revit Sync Queue Active
        </CardTitle>
        <Badge variant="secondary">{fileName}</Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        {queue.map((item, idx) => (
          <div key={idx} className={`flex items-center justify-between p-3 rounded-md border ${item.status === 'SYNCING' ? 'border-primary bg-primary/5' : 'bg-muted/50'}`}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">
                {item.userName.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium">
                  {item.userName} {item.userName === 'You' && <span className="text-xs text-muted-foreground ml-1">(This Machine)</span>}
                </p>
                <p className={`text-xs ${item.status === 'SYNCING' ? 'text-primary' : 'text-muted-foreground'}`}>
                  {item.status === 'SYNCING' ? 'Synchronizing with Central...' : 'Waiting in queue...'}
                </p>
              </div>
            </div>

            {item.status === 'SYNCING' && item.progress !== undefined && (
              <div className="flex items-center gap-3 w-1/3">
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-8">{item.progress}%</span>
              </div>
            )}
            
            {item.status === 'WAITING' && (
              <div className="flex items-center text-muted-foreground text-xs gap-1">
                <Clock className="w-3 h-3" />
                Est. {idx * 45}s
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
