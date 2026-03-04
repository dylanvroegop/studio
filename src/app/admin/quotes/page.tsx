import { AdminQuotesClient } from '@/components/admin/AdminQuotesClient';
import { searchAdminQuotes } from '@/lib/admin-data';

export const dynamic = 'force-dynamic';

export default async function AdminQuotesPage() {
  const rows = await searchAdminQuotes('');
  return <AdminQuotesClient initialRows={rows} />;
}
