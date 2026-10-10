import React from 'react';
import { UserProfile } from '@clerk/clerk-react';

export const ProfilePage: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-300 p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Organization & Access Management</h2>
        <p className="text-muted-foreground mt-1">Manage your team, invite architects, and configure RBAC roles.</p>
      </div>

      <div className="flex flex-col gap-12 max-w-5xl">
        {/* Clerk Organization Profile - Handles RBAC and invites */}


        {/* Clerk User Profile - Handles personal identity */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Personal Identity</h3>
<UserProfile />
        </div>
      </div>
    </div>
  );
};

