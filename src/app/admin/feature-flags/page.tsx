import { AdminFeatureFlagsClient } from '@/components/admin/AdminFeatureFlagsClient';
import { getInitialAdminFeatureFlags } from '@/lib/admin-data';

export const dynamic = 'force-dynamic';

export default async function AdminFeatureFlagsPage() {
  const rows = await getInitialAdminFeatureFlags();
  return <AdminFeatureFlagsClient initialRows={rows} />;
}
