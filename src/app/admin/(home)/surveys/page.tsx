import { requireRole } from '@/server/auth/rbac';
import { SurveysPage } from '@/features/surveys/SurveysPage';

export const dynamic = 'force-dynamic';

export default async function AdminSurveysPage() {
  const user = await requireRole('ADMIN');
  return <SurveysPage user={user} />;
}
