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
  locationUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  eventCount: number;
};

/**
 * Where the venue is, for the briefing every member gets on their phone.
 *
 * Two ways in, because both happen: an organiser at a desk pastes a link from
 * Google Maps, and an organiser standing at the gate of a place that is on no
 * map taps the button and the device's own coordinates are captured. The second
 * fills the same link field, so everything downstream has one thing to read.
 */
function LocationFields({ t, venue }: { t: Dictionary; venue?: VenueRow }) {
  const [url, setUrl] = useState(venue?.locationUrl ?? '');
  const [lat, setLat] = useState<number | null>(venue?.latitude ?? null);
  const [lng, setLng] = useState<number | null>(venue?.longitude ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError(t.venue.locationUnsupported);
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLat(Number(latitude.toFixed(6)));
        setLng(Number(longitude.toFixed(6)));
        setUrl(`https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`);
        setBusy(false);
      },
      () => {
        setError(t.venue.locationDenied);
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <div>
      <label className="field-label" htmlFor="venue-location">
        {t.venue.locationUrl} <span className="text-ink-500">({t.common.optional})</span>
      </label>
      <input
        id="venue-location"
        name="locationUrl"
        className="field"
        inputMode="url"
        dir="ltr"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://maps.google.com/..."
      />
      <input type="hidden" name="latitude" value={lat ?? ''} />
      <input type="hidden" name="longitude" value={lng ?? ''} />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={useMyLocation} disabled={busy}>
          <IconPin width={15} height={15} />
          {busy ? t.venue.locating : t.venue.useMyLocation}
        </button>
        {lat !== null && lng !== null ? (
          <span className="nums text-[12px] text-ink-400" dir="ltr">
            {lat}, {lng}
          </span>
        ) : null}
      </div>

      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-500">{t.venue.locationHint}</p>
      <FormError message={error} />
    </div>
  );
}

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
      <LocationFields t={t} venue={venue} />
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

                {venue.locationUrl ? (
                  <a
                    href={venue.locationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="-my-2.5 inline-flex min-h-[44px] items-center gap-1.5 py-2.5 text-[12.5px] text-brand-400 hover:text-brand-300"
                  >
                    <IconPin width={14} height={14} />
                    {t.venue.openLocation}
                  </a>
                ) : (
                  <p className="text-[12.5px] text-warn-text">{t.venue.noLocation}</p>
                )}

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
