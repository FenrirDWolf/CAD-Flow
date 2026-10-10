import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';

export const ClashMatrix: React.FC = () => {
  // Mock clash data between models
  const models = ['ARCH_L1', 'STRUC_L1', 'MEP_HVAC', 'MEP_PLUMB'];
  const clashes = {
    'ARCH_L1-STRUC_L1': 12,
    'ARCH_L1-MEP_HVAC': 45,
    'STRUC_L1-MEP_HVAC': 8,
  };

  const getClashColor = (count: number) => {
    if (count === 0) return 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30';
    if (count < 15) return 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30';
    return 'bg-destructive/20 text-destructive border-destructive/30';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>BIM CI/CD: Nightly Clash Matrix</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                <th className="p-3 text-muted-foreground font-medium border-b">Models</th>
                {models.map(m => (
                  <th key={m} className="p-3 text-foreground font-medium border-b rotate-45 transform origin-bottom-left whitespace-nowrap h-24 w-24">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map((rowModel) => (
                <tr key={rowModel}>
                  <td className="p-3 text-foreground font-medium border-b border-border/50">{rowModel}</td>
                  {models.map((colModel) => {
                    if (rowModel === colModel) return <td key={colModel} className="p-3 border-b border-border/50 bg-muted/20"></td>;
                    
                    const key1 = `${rowModel}-${colModel}`;
                    const key2 = `${colModel}-${rowModel}`;
                    const count = clashes[key1 as keyof typeof clashes] ?? clashes[key2 as keyof typeof clashes] ?? 0;
                    
                    return (
                      <td key={colModel} className="p-3 border-b border-border/50 text-center">
                        <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center border font-bold ${getClashColor(count)} transition-transform hover:scale-110 cursor-pointer`}>
                          {count}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
