import type { Metadata } from 'next';
import { AdminReportPage } from '@/screens/AdminReportPage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Private website review · Workspace',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminReportPage />;
}
