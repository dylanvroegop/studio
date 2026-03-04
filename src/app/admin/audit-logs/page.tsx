import { AdminAuditLogsClient } from '@/components/admin/AdminAuditLogsClient';
import { getAdminAuditLogs } from '@/lib/admin-data';

export const dynamic = 'force-dynamic';

export default async function AdminAuditLogsPage() {
  const rows = await getAdminAuditLogs();
  return <AdminAuditLogsClient rows={rows} />;
}
