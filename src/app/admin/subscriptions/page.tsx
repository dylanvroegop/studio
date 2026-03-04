import { AdminSubscriptionsClient } from '@/components/admin/AdminSubscriptionsClient';
import { searchAdminSubscriptions } from '@/lib/admin-data';

export const dynamic = 'force-dynamic';

export default async function AdminSubscriptionsPage() {
  const rows = await searchAdminSubscriptions('');
  return <AdminSubscriptionsClient initialRows={rows} />;
}
