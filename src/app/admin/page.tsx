import { AdminOverviewClient } from '@/components/admin/AdminOverviewClient';
import { getAdminSystemStatus } from '@/lib/admin-data';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const status = await getAdminSystemStatus();
  return <AdminOverviewClient status={status} />;
}
