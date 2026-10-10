import React from 'react';
import { GitCommit, GitBranch, RotateCcw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

export const VersionTimeline: React.FC = () => {
  const commits = [
    { id: 'v12', msg: 'Resolved MEP clashes on L1', user: 'Alex', time: '10 mins ago', type: 'sync' },
    { id: 'v11', msg: 'Added perimeter columns', user: 'Sarah', time: '2 hrs ago', type: 'sync' },
    { id: 'v10', msg: 'Published 30% DD Milestone', user: 'Admin', time: '1 day ago', type: 'publish' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-primary" />
          Model Timeline
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
          {commits.map((commit) => (
            <div key={commit.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border bg-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-primary">
                <GitCommit className="w-5 h-5" />
              </div>
              
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-lg bg-muted/50 border shadow-sm flex flex-col hover:bg-muted/80 transition-colors">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-foreground">{commit.msg}</span>
                  <Badge variant={commit.type === 'publish' ? 'default' : 'secondary'}>
                    {commit.id}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground mb-3">
                  {commit.user} • {commit.time}
                </div>
                <Button variant="ghost" size="sm" className="self-start h-8 px-2 text-muted-foreground hover:text-foreground">
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Restore this version
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
