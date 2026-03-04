import { AdminUsersClient } from '@/components/admin/AdminUsersClient';
import { searchAdminUsers } from '@/lib/admin-data';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const rows = await searchAdminUsers('');
  return <AdminUsersClient initialRows={rows} />;
}
