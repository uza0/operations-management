import { requireRole } from '@/server/auth/rbac';
import { SurveysPage } from '@/features/surveys/SurveysPage';

export const dynamic = 'force-dynamic';

export default async function LeaderSurveysPage() {
  const user = await requireRole('TEAM_LEADER');
  return <SurveysPage user={user} />;
}
