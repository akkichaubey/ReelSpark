'use client';

import { Suspense } from 'react';
import { WorkspaceDashboard } from '@/components/WorkspaceDashboard';
import { SiteLoader } from '@/components/SiteLoader';

export default function DashboardPage() {
  return <Suspense fallback={<SiteLoader label="Opening your workspace…" />}><WorkspaceDashboard /></Suspense>;
}
