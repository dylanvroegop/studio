import { AdminShell } from '@/components/admin/AdminShell';
import { requireAdminPageAccess } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPageAccess();

  return <AdminShell>{children}</AdminShell>;
}
