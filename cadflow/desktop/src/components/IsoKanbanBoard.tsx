import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';

export const IsoKanbanBoard: React.FC = () => {
  const columns = [
    { name: 'WIP (Work In Progress)', files: ['ARCH_L1.rvt', 'ARCH_L2.rvt'], color: 'border-blue-500/50 bg-blue-500/5' },
    { name: 'SHARED (Coordination)', files: ['STRUC_L1.dwg'], color: 'border-yellow-500/50 bg-yellow-500/5' },
    { name: 'PUBLISHED (Client Review)', files: ['SITE_Master.dwg'], color: 'border-green-500/50 bg-green-500/5' },
    { name: 'ARCHIVED', files: [], color: 'border-border/50 bg-muted/5' }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>ISO 19650 Lifecycle</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => (
            <div key={col.name} className={`flex-1 min-w-[250px] border rounded-lg p-4 ${col.color}`}>
              <h4 className="font-semibold text-muted-foreground mb-4 text-sm tracking-wider uppercase">{col.name}</h4>
              <div className="space-y-3">
                {col.files.map(f => (
                  <div key={f} className="bg-background border p-3 rounded-md shadow-sm cursor-pointer hover:border-primary transition-colors">
                    <p className="text-sm font-medium text-foreground">{f}</p>
                  </div>
                ))}
                {col.files.length === 0 && (
                  <div className="border-2 border-dashed border-border rounded-md h-20 flex items-center justify-center text-muted-foreground text-sm">
                    Drop files here
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
