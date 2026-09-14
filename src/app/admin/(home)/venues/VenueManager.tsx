'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { deleteVenueAction, saveVenueAction } from '@/server/actions/venues';
import { idle } from '@/server/actions/types';
import { FormError, EmptyState } from '@/components/ui/states';
import { Dialog, SubmitButton, ConfirmSubmit, DictionaryProvider } from '@/components/ui/client';
import { MapUploader } from '@/components/venue/MapUploader';
import { IconEdit, IconPin, IconPlus } from '@/components/ui/icons';
import type { Dictionary } from '@/lib/i18n';

export type VenueRow = {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  mapImageUrl: string | null;
  eventCount: number;
};

function VenueForm({
  t,
  venue,
  onDone,
}: {
  t: Dictionary;
  venue?: VenueRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(saveVenueAction, idle);

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <form action={action} className="space-y-4">
      {venue ? <input type="hidden" name="venueId" value={venue.id} /> : null}
      <div>
        <label className="field-label" htmlFor="venue-name">
          {t.venue.name}
        </label>
        <input
          id="venue-name"
          name="name"
          className="field"
          required
          defaultValue={venue?.name ?? ''}
          placeholder="ملعب الزوراء"
        />
      </div>
      <div>
        <label className="field-label" htmlFor="venue-address">
          {t.venue.address} <span className="text-ink-500">({t.common.optional})</span>
        </label>
        <input
          id="venue-address"
          name="address"
          className="field"
          defaultValue={venue?.address ?? ''}
        />
      </div>
      <div>
        <label className="field-label" htmlFor="venue-description">
          {t.venue.description} <span className="text-ink-500">({t.common.optional})</span>
        </label>
        <textarea
          id="venue-description"
          name="description"
          rows={3}
          className="field"
          defaultValue={venue?.description ?? ''}
        />
      </div>
      {state.status === 'error' ? <FormError message={state.message} /> : null}
      <div className="flex justify-end">
        <SubmitButton pendingLabel={t.common.saving}>{t.common.save}</SubmitButton>
      </div>
    </form>
  );
}

function DeleteVenue({ t, venue }: { t: Dictionary; venue: VenueRow }) {
  const router = useRouter();
  const [state, action] = useActionState(deleteVenueAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="venueId" value={venue.id} />
      <ConfirmSubmit
        className="btn-danger btn-sm"
        message={`${t.common.delete} — ${venue.name}?`}
      >
        {t.common.delete}
      </ConfirmSubmit>
      {state.status === 'error' ? <FormError message={state.message} /> : null}
    </form>
  );
}

export function VenueManager({ t, venues }: { t: Dictionary; venues: VenueRow[] }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<VenueRow | null>(null);

  return (
    <DictionaryProvider dict={t}>
      <div className="mb-4 flex justify-end">
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          <IconPlus width={16} height={16} />
          {t.venue.newVenue}
        </button>
      </div>

      {venues.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={t.venue.empty}
            hint={t.venue.emptyHint}
            icon={<IconPin width={20} height={20} />}
            action={
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => setCreating(true)}
              >
                {t.venue.newVenue}
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {venues.map((venue) => (
            <article key={venue.id} className="panel overflow-hidden">
              <div className="relative aspect-[16/10] w-full bg-ink-850">
                {venue.mapImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={venue.mapImageUrl}
                    alt={`${t.venue.mapImage} — ${venue.name}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink-500">
                    <IconPin width={22} height={22} />
                    <span className="text-[12.5px]">{t.venue.noMap}</span>
                  </div>
                )}
              </div>

              <div className="space-y-3 p-4">
                <div>
                  <h3 className="text-[15px] font-semibold text-ink-100">{venue.name}</h3>
                  {venue.address ? (
                    <p className="mt-0.5 text-[12.5px] text-ink-400">{venue.address}</p>
                  ) : null}
                </div>

                <p className="text-[12.5px] text-ink-500">
                  {t.venue.eventsCount}: <span className="nums">{venue.eventCount}</span>
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setEditing(venue)}
                  >
                    <IconEdit width={15} height={15} />
                    {t.common.edit}
                  </button>
                  <MapUploader
                    venueId={venue.id}
                    label={venue.mapImageUrl ? t.venue.replaceMap : t.venue.uploadMap}
                  />
                  {venue.eventCount === 0 ? <DeleteVenue t={t} venue={venue} /> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title={t.venue.newVenue}
        description={t.venue.subtitle}
      >
        <VenueForm t={t} onDone={() => setCreating(false)} />
      </Dialog>

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={t.venue.editVenue}
      >
        {editing ? (
          <VenueForm t={t} venue={editing} onDone={() => setEditing(null)} />
        ) : null}
      </Dialog>
    </DictionaryProvider>
  );
}
