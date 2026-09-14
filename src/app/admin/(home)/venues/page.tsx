import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { events, venues } from '@/db/schema';
import { requireRole } from '@/server/auth/rbac';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/ui/panel';

import { VenueManager } from './VenueManager';

export default async function VenuesPage() {
  await requireRole('ADMIN');
  const { t } = await getT();

  const rows = await db
    .select({
      id: venues.id,
      name: venues.name,
      address: venues.address,
      description: venues.description,
      mapImageUrl: venues.mapImageUrl,
      eventCount: sql<number>`(select count(*) from ${events} where ${events.venueId} = ${venues.id})`,
    })
    .from(venues)
    .orderBy(venues.name);

  return (
    <>
      <PageHeader title={t.venue.title} subtitle={t.venue.subtitle} />
      <VenueManager t={t} venues={rows} />
    </>
  );
}
