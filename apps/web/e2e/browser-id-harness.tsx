import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { ActivityForm } from '../src/features/activity/components/activity-form';
import type { Activity } from '../src/features/activity/types';
import '../src/styles/globals.css';

function Harness() {
  const [activities, setActivities] = useState<Activity[]>([]);
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Activity ID acceptance</h1>
      <ActivityForm onSubmit={(activity) => setActivities((current) => [...current, activity])} />
      <output data-testid="activity-output">{JSON.stringify(activities)}</output>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Browser ID acceptance root is missing');

createRoot(root).render(
  <React.StrictMode>
    <Harness />
  </React.StrictMode>,
);
