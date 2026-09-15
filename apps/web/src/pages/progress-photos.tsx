import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  Camera,
  LockKeyhole,
  Pencil,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  BODY_PROGRESS_PHOTO_CONSENT_VERSION,
  BODY_PROGRESS_PHOTO_GUIDE_VERSION,
  type BodyProgressPhotoSet,
  type BodyProgressPhotoView,
  type PatchBodyProgressPhotoSet,
} from '@pulse/shared';
import { Link, useSearchParams } from 'react-router';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useBodyCheckIns } from '@/features/body-progress/api/body-progress';
import {
  useCreatePhotoSet,
  useDeleteAllPhotos,
  useDeletePhoto,
  useDeletePhotoSet,
  usePhotoPreferences,
  usePhotoSet,
  usePhotoSets,
  useSavePhotoPreferences,
  useSkipPhotoOccurrence,
  useSnoozePhotoOccurrence,
  useUpdatePhotoSet,
} from '@/features/body-progress/photos/api';
import { PhotoUpload } from '@/features/body-progress/photos/photo-upload';
import { PrivatePhoto } from '@/features/body-progress/photos/private-photo';
import {
  formatPhotoDate,
  photoErrorMessage,
  viewLabels,
} from '@/features/body-progress/photos/utils';

const selectClass =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm';
const today = () => new Date().toISOString().slice(0, 10);

function PrivacyFacts() {
  return (
    <ul className="grid gap-2 text-sm sm:grid-cols-2">
      <li className="rounded-lg bg-secondary/45 p-3">Encrypted in live storage</li>
      <li className="rounded-lg bg-secondary/45 p-3">
        Raw access requires your signed-in web session
      </li>
      <li className="rounded-lg bg-secondary/45 p-3">Retained until you explicitly delete it</li>
      <li className="rounded-lg bg-secondary/45 p-3">
        Newest 30 encrypted backup archives are retained with a separately stored key
      </li>
      <li className="rounded-lg bg-secondary/45 p-3 sm:col-span-2">
        No AI analysis. This is server-side encryption, not client-side end-to-end encryption.
      </li>
    </ul>
  );
}

function ConsentCard() {
  const query = usePhotoPreferences();
  const save = useSavePhotoPreferences();
  const purge = useDeleteAllPhotos();
  const { confirm, dialog } = useConfirmation();
  const [message, setMessage] = useState<string | null>(null);
  if (query.isPending) return <Skeleton className="h-56 w-full rounded-2xl" />;
  if (query.isError || !query.data)
    return (
      <Card role="alert">
        <CardHeader>
          <CardTitle>Private-photo settings could not be loaded</CardTitle>
          <CardDescription>No consent or storage state was assumed.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void query.refetch()} variant="outline">
            Retry settings
          </Button>
        </CardContent>
      </Card>
    );
  const state = query.data.consent.state;
  const decide = async (consentDecision: 'grant' | 'decline' | 'revoke') => {
    setMessage(null);
    try {
      await save.mutateAsync({
        consentDecision,
        consentVersion: BODY_PROGRESS_PHOTO_CONSENT_VERSION,
      });
      setMessage(
        consentDecision === 'revoke'
          ? 'Consent revoked. Existing photos were not deleted.'
          : consentDecision === 'grant'
            ? 'Private progress photos enabled.'
            : 'Private progress photos declined.',
      );
    } catch (error) {
      setMessage(photoErrorMessage(error));
    }
  };
  return (
    <Card
      className={state === 'granted' ? 'border-primary/35 bg-primary/[0.03]' : 'border-border/70'}
    >
      {dialog}
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
          <Badge variant={state === 'granted' ? 'default' : 'secondary'}>
            {state.replace('_', ' ')}
          </Badge>
        </div>
        <CardTitle>Private by design, under your control</CardTitle>
        <CardDescription>
          Camera permission is optional. Declining or revoking consent keeps this area safe and
          usable without capturing anything.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <PrivacyFacts />
        <div className="flex flex-wrap gap-2">
          {state !== 'granted' ? (
            <Button disabled={save.isPending} onClick={() => void decide('grant')}>
              Grant consent
            </Button>
          ) : (
            <Button
              disabled={save.isPending}
              onClick={() => void decide('revoke')}
              variant="outline"
            >
              Revoke consent
            </Button>
          )}
          {state === 'not_decided' ? (
            <Button
              disabled={save.isPending}
              onClick={() => void decide('decline')}
              variant="ghost"
            >
              Decline for now
            </Button>
          ) : null}
          {state === 'granted' || state === 'revoked' ? (
            <Button
              disabled={purge.isPending}
              onClick={() =>
                confirm({
                  title: 'Delete every private progress photo?',
                  description:
                    'This deletes all user-scoped photo sets and live encrypted variants. There is no restore promise; encrypted backups age out beyond the newest 30 archives.',
                  confirmLabel: 'Delete all photos',
                  onConfirm: async () => {
                    const result = await purge.mutateAsync();
                    setMessage(
                      `Deleted ${result.deletedSets} set(s), ${result.deletedPhotos} photo(s), and ${result.deletedFiles} encrypted file(s); ${result.missingFiles} file(s) were already missing. ${result.backupRetention}`,
                    );
                  },
                })
              }
              variant="destructive"
            >
              Delete all photos
            </Button>
          ) : null}
        </div>
        {state === 'revoked' ? (
          <p className="text-sm text-muted-foreground">
            Revocation stops new mutations; it does not delete retained photos. Delete individual
            photos or sets explicitly before revoking if you want live ciphertext removed.
          </p>
        ) : null}
        {message ? (
          <p aria-live="polite" className="text-sm">
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PreferencesCard() {
  const query = usePhotoPreferences();
  const save = useSavePhotoPreferences();
  const skip = useSkipPhotoOccurrence();
  const snooze = useSnoozePhotoOccurrence();
  const [editing, setEditing] = useState(false);
  const [cadence, setCadence] = useState('30');
  const [cadenceChange, setCadenceChange] = useState<'preserve_anchor' | 'restart'>(
    'preserve_anchor',
  );
  const [sideView, setSideView] = useState<'side_left' | 'side_right'>('side_right');
  const [reminder, setReminder] = useState('');
  const [snoozeUntil, setSnoozeUntil] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const preference = query.data;
  if (!preference || preference.consent.state !== 'granted') return null;
  const begin = () => {
    setCadence(String(preference.cadenceDays));
    setSideView(preference.sideView);
    setReminder(preference.reminderLocalTime ?? '');
    setEditing(true);
  };
  const submit = async () => {
    setMessage(null);
    const restartAnchorDate = preference.due.localDate ?? today();
    try {
      await save.mutateAsync({
        cadenceDays: Number(cadence),
        cadenceChange,
        ...(cadenceChange === 'restart' ? { restartAnchorDate } : {}),
        sideView,
        reminderLocalTime: reminder || null,
      });
      setEditing(false);
      setMessage('Cadence preferences saved from the server.');
    } catch (error) {
      setMessage(photoErrorMessage(error));
    }
  };
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarClock aria-hidden="true" className="size-5 text-primary" />
          <CardTitle>Photo cadence</CardTitle>
        </div>
        <CardDescription>
          Independent of circumference check-ins; all due dates come from the server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Current state</dt>
            <dd className="font-medium">{preference.due.state}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Due</dt>
            <dd className="font-medium">{preference.due.dueDate}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Next due</dt>
            <dd className="font-medium">{preference.due.nextDueDate}</dd>
          </div>
        </dl>
        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="photo-cadence">Cadence days (14–180)</Label>
              <Input
                id="photo-cadence"
                max={180}
                min={14}
                onChange={(e) => setCadence(e.target.value)}
                type="number"
                value={cadence}
              />
            </div>
            <div>
              <Label htmlFor="cadence-change">Anchor behavior</Label>
              <select
                className={selectClass}
                id="cadence-change"
                onChange={(e) => setCadenceChange(e.target.value as typeof cadenceChange)}
                value={cadenceChange}
              >
                <option value="preserve_anchor">Preserve current anchor</option>
                <option value="restart">Restart from today</option>
              </select>
            </div>
            <div>
              <Label htmlFor="side-view">Preferred side</Label>
              <select
                className={selectClass}
                id="side-view"
                onChange={(e) => setSideView(e.target.value as typeof sideView)}
                value={sideView}
              >
                <option value="side_left">Left side</option>
                <option value="side_right">Right side</option>
              </select>
            </div>
            <div>
              <Label htmlFor="reminder-time">Reminder time (optional)</Label>
              <Input
                id="reminder-time"
                onChange={(e) => setReminder(e.target.value)}
                type="time"
                value={reminder}
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button disabled={save.isPending} onClick={() => void submit()}>
                Save cadence
              </Button>
              <Button onClick={() => setEditing(false)} variant="ghost">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={begin} variant="outline">
            <Pencil aria-hidden="true" /> Edit cadence
          </Button>
        )}
        {preference.due.state === 'due' ||
        preference.due.state === 'overdue' ||
        preference.due.state === 'snoozed' ? (
          <div className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="photo-snooze">Snooze until</Label>
              <Input
                id="photo-snooze"
                min={preference.due.localDate ?? undefined}
                onChange={(e) => setSnoozeUntil(e.target.value)}
                type="date"
                value={snoozeUntil}
              />
            </div>
            <Button
              disabled={!snoozeUntil || snooze.isPending}
              onClick={async () => {
                try {
                  await snooze.mutateAsync(snoozeUntil);
                  setMessage('Photo reminder snoozed without changing its anchor.');
                } catch (error) {
                  setMessage(photoErrorMessage(error));
                }
              }}
              variant="outline"
            >
              Snooze
            </Button>
            <Button
              disabled={skip.isPending}
              onClick={async () => {
                try {
                  await skip.mutateAsync(preference.due.dueDate);
                  setMessage('Current photo occurrence skipped without changing its anchor.');
                } catch (error) {
                  setMessage(photoErrorMessage(error));
                }
              }}
              variant="ghost"
            >
              Skip occurrence
            </Button>
          </div>
        ) : null}
        {message ? (
          <p aria-live="polite" className="text-sm">
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CreateSetCard({ onCreated }: { onCreated: (id: string) => void }) {
  const preferences = usePhotoPreferences();
  const checkIns = useBodyCheckIns();
  const create = useCreatePhotoSet();
  const [date, setDate] = useState('');
  const [localTime, setLocalTime] = useState('');
  const [bodyCheckInId, setBodyCheckInId] = useState('');
  const [notes, setNotes] = useState('');
  const [meal, setMeal] = useState<'unspecified' | 'pre_meal' | 'post_meal'>('unspecified');
  const [workout, setWorkout] = useState<'unspecified' | 'pre_workout' | 'post_workout'>(
    'unspecified',
  );
  const [countScheduled, setCountScheduled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serverLocalDate = preferences.data?.due.localDate ?? today();
  if (preferences.data?.consent.state !== 'granted') return null;
  const submit = async () => {
    setError(null);
    try {
      const set = await create.mutateAsync({
        date: date || serverLocalDate,
        localTime: localTime || null,
        bodyCheckInId: bodyCheckInId || null,
        guideVersion: BODY_PROGRESS_PHOTO_GUIDE_VERSION,
        context: {
          meal,
          workout,
          pumpPresent: null,
          unusualBloating: null,
          clothingNotes: null,
          lightingNotes: null,
        },
        notes: notes || null,
        countAsScheduledOccurrence: countScheduled,
      });
      onCreated(set.id);
    } catch (reason) {
      setError(photoErrorMessage(reason));
    }
  };
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle>Start a dated photo set</CardTitle>
        <CardDescription>
          Create server-owned metadata first; photos can be added now or later.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="set-date">Date</Label>
          <Input
            id="set-date"
            onChange={(e) => setDate(e.target.value)}
            required
            type="date"
            value={date || serverLocalDate}
          />
        </div>
        <div>
          <Label htmlFor="set-time">Local time (optional)</Label>
          <Input
            id="set-time"
            onChange={(e) => setLocalTime(e.target.value)}
            type="time"
            value={localTime}
          />
        </div>
        <div>
          <Label htmlFor="check-in-link">Owned body check-in (optional)</Label>
          <select
            className={selectClass}
            disabled={checkIns.isPending || checkIns.isError}
            id="check-in-link"
            onChange={(e) => setBodyCheckInId(e.target.value)}
            value={bodyCheckInId}
          >
            <option value="">No linked check-in</option>
            {(checkIns.data?.data ?? []).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.date} · {entry.status}
              </option>
            ))}
          </select>
          {checkIns.isError ? (
            <p className="mt-1 text-xs text-destructive">
              Check-ins unavailable; arbitrary IDs are not accepted.
            </p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="meal-context">Meal context</Label>
          <select
            className={selectClass}
            id="meal-context"
            onChange={(e) => setMeal(e.target.value as typeof meal)}
            value={meal}
          >
            <option value="unspecified">Unspecified</option>
            <option value="pre_meal">Before meal</option>
            <option value="post_meal">After meal</option>
          </select>
        </div>
        <div>
          <Label htmlFor="workout-context">Workout context</Label>
          <select
            className={selectClass}
            id="workout-context"
            onChange={(e) => setWorkout(e.target.value as typeof workout)}
            value={workout}
          >
            <option value="unspecified">Unspecified</option>
            <option value="pre_workout">Before workout</option>
            <option value="post_workout">After workout</option>
          </select>
        </div>
        <div className="flex min-h-11 items-center gap-2">
          <Checkbox
            checked={countScheduled}
            id="count-scheduled"
            onCheckedChange={(value) => setCountScheduled(value === true)}
          />
          <Label htmlFor="count-scheduled">Count as scheduled occurrence</Label>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="set-notes">Notes (optional)</Label>
          <Textarea
            id="set-notes"
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
            value={notes}
          />
        </div>
        {error ? (
          <p className="sm:col-span-2" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          className="sm:col-span-2 sm:w-fit"
          disabled={!date || create.isPending || checkIns.isError}
          onClick={() => void submit()}
        >
          <Camera aria-hidden="true" /> {create.isPending ? 'Creating…' : 'Create partial set'}
        </Button>
      </CardContent>
    </Card>
  );
}

function SetDetail({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const query = usePhotoSet(id);
  const update = useUpdatePhotoSet();
  const deletePhoto = useDeletePhoto();
  const deleteSet = useDeletePhotoSet();
  const { confirm, dialog } = useConfirmation();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (query.isPending) return <Skeleton className="h-80 w-full rounded-2xl" />;
  if (query.isError || !query.data)
    return (
      <Card role="alert">
        <CardHeader>
          <CardTitle>Photo set could not be loaded</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void query.refetch()} variant="outline">
            Retry set
          </Button>
        </CardContent>
      </Card>
    );
  const set = query.data;
  const deleteWholeSet = () =>
    confirm({
      title: 'Delete this private photo set?',
      description:
        'All live encrypted variants in this set will be deleted. There is no restore promise; encrypted backups age out under the newest-30-archives policy.',
      confirmLabel: 'Delete set',
      onConfirm: async () => {
        const result = await deleteSet.mutateAsync(set);
        setMessage(
          `Deleted ${result.deleted} encrypted file${result.deleted === 1 ? '' : 's'}; ${result.missing} already missing.`,
        );
        onDeleted();
      },
    });
  return (
    <section className="space-y-4" aria-label={`Photo set ${set.date}`}>
      {dialog}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{set.status}</Badge>
            <Badge variant="outline">
              {set.photos.length} photo{set.photos.length === 1 ? '' : 's'}
            </Badge>
            {set.countAsScheduledOccurrence ? (
              <Badge variant="secondary">Scheduled occurrence</Badge>
            ) : null}
          </div>
          <CardTitle>{formatPhotoDate(set.date)}</CardTitle>
          <CardDescription>
            Guide {set.guideVersion} · {set.localTime ?? 'time not recorded'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {editing ? (
            <SetEditForm
              onCancel={() => setEditing(false)}
              onSave={async (input) => {
                try {
                  await update.mutateAsync({ id: set.id, input });
                  setEditing(false);
                  setMessage('Set metadata updated from server truth.');
                } catch (error) {
                  setMessage(photoErrorMessage(error));
                }
              }}
              set={set}
            />
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm">{set.notes || 'No notes recorded.'}</p>
              <p className="text-sm text-muted-foreground">
                Meal: {set.context.meal.replace('_', ' ')} · Workout:{' '}
                {set.context.workout.replace('_', ' ')}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setEditing(true)} variant="outline">
                  <Pencil aria-hidden="true" /> Edit metadata
                </Button>
                {set.bodyCheckInId ? (
                  <Button asChild variant="outline">
                    <Link to={`/body/check-ins/${set.bodyCheckInId}`}>Open linked check-in</Link>
                  </Button>
                ) : null}
                <Button
                  disabled={deleteSet.isPending}
                  onClick={deleteWholeSet}
                  variant="destructive"
                >
                  <Trash2 aria-hidden="true" /> Delete set
                </Button>
              </div>
            </>
          )}
          {message ? (
            <p aria-live="polite" className="text-sm">
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>
      {set.photos.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {set.photos.map((photo) => (
            <Card className="min-w-0" key={photo.id}>
              <CardHeader>
                <CardTitle className="text-base">{viewLabels[photo.view]}</CardTitle>
                <CardDescription>
                  {photo.width}×{photo.height} · normalized JPEG
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <PrivatePhoto
                  alt={`${viewLabels[photo.view]} progress photo from ${formatPhotoDate(set.date)}`}
                  className="aspect-[3/4] w-full rounded-xl object-contain bg-black"
                  id={photo.id}
                  variant="full"
                />
                <Button
                  className="w-full"
                  onClick={() =>
                    confirm({
                      title: `Delete ${viewLabels[photo.view].toLowerCase()} photo?`,
                      description:
                        'Every live encrypted variant will be deleted. The remaining set and other poses stay available.',
                      confirmLabel: 'Delete photo',
                      onConfirm: async () => {
                        const result = await deletePhoto.mutateAsync({
                          id: photo.id,
                          setId: set.id,
                        });
                        setMessage(
                          `Deleted ${result.deleted} encrypted file${result.deleted === 1 ? '' : 's'}; ${result.missing} already missing.`,
                        );
                        await query.refetch();
                      },
                    })
                  }
                  variant="outline"
                >
                  <Trash2 aria-hidden="true" /> Delete photo
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No photos yet. This partial metadata set remains valid.
          </CardContent>
        </Card>
      )}
      <PhotoUpload set={set} />
    </section>
  );
}

function SetEditForm({
  set,
  onCancel,
  onSave,
}: {
  set: BodyProgressPhotoSet;
  onCancel: () => void;
  onSave: (input: PatchBodyProgressPhotoSet) => Promise<void>;
}) {
  const [date, setDate] = useState(set.date);
  const [time, setTime] = useState(set.localTime ?? '');
  const [notes, setNotes] = useState(set.notes ?? '');
  const [clothing, setClothing] = useState(set.context.clothingNotes ?? '');
  const [lighting, setLighting] = useState(set.context.lightingNotes ?? '');
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor="edit-photo-date">Date</Label>
        <Input
          id="edit-photo-date"
          onChange={(e) => setDate(e.target.value)}
          type="date"
          value={date}
        />
      </div>
      <div>
        <Label htmlFor="edit-photo-time">Local time</Label>
        <Input
          id="edit-photo-time"
          onChange={(e) => setTime(e.target.value)}
          type="time"
          value={time}
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="edit-photo-notes">Notes</Label>
        <Textarea
          id="edit-photo-notes"
          maxLength={2000}
          onChange={(e) => setNotes(e.target.value)}
          value={notes}
        />
      </div>
      <div>
        <Label htmlFor="clothing-notes">Clothing notes</Label>
        <Textarea
          id="clothing-notes"
          maxLength={500}
          onChange={(e) => setClothing(e.target.value)}
          value={clothing}
        />
      </div>
      <div>
        <Label htmlFor="lighting-notes">Lighting notes</Label>
        <Textarea
          id="lighting-notes"
          maxLength={500}
          onChange={(e) => setLighting(e.target.value)}
          value={lighting}
        />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button
          onClick={() =>
            void onSave({
              date,
              localTime: time || null,
              notes: notes || null,
              context: {
                ...set.context,
                clothingNotes: clothing || null,
                lightingNotes: lighting || null,
              },
            })
          }
        >
          Save corrections
        </Button>
        <Button onClick={onCancel} variant="ghost">
          Cancel
        </Button>
      </div>
    </div>
  );
}

function TimelineAndComparison({ onOpen }: { onOpen: (id: string) => void }) {
  const query = usePhotoSets(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [pose, setPose] = useState<BodyProgressPhotoView>('front');
  const [showComparison, setShowComparison] = useState(false);
  const sets = query.data?.data ?? [];
  const selectedSets = sets.filter((set) => selected.includes(set.id));
  const shared = useMemo(
    () =>
      (['front', 'side_left', 'side_right', 'back'] as const).filter(
        (view) =>
          selectedSets.length >= 2 &&
          selectedSets.every((set) => set.photos.some((photo) => photo.view === view)),
      ),
    [selectedSets],
  );
  if (query.isPending) return <Skeleton className="h-72 w-full rounded-2xl" />;
  if (query.isError)
    return (
      <Card role="alert">
        <CardHeader>
          <CardTitle>Photo timeline could not be loaded</CardTitle>
          <CardDescription>Existing private-photo metadata was not replaced.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void query.refetch()} variant="outline">
            Retry timeline
          </Button>
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Private photo timeline</CardTitle>
          <CardDescription>
            Newest first · page {query.data?.meta.page ?? 1} of server-paginated metadata. Images
            load only when requested.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sets.length ? (
            <ol className="space-y-2">
              {sets.map((set) => (
                <li className="rounded-xl border border-border/70 p-3" key={set.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Checkbox
                      aria-label={`Select ${set.date} for comparison`}
                      checked={selected.includes(set.id)}
                      onCheckedChange={(value) => {
                        setShowComparison(false);
                        setSelected((current) =>
                          value === true
                            ? [...current, set.id]
                            : current.filter((id) => id !== set.id),
                        );
                      }}
                    />
                    <button
                      className="min-h-11 flex-1 text-left focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onOpen(set.id)}
                    >
                      <span className="block font-medium">{formatPhotoDate(set.date)}</span>
                      <span className="block text-sm text-muted-foreground">
                        {set.photos.map((photo) => viewLabels[photo.view]).join(' · ') ||
                          'No photos'}
                        {set.notes ? ' · notes' : ''}
                        {set.context.clothingNotes || set.context.lightingNotes ? ' · context' : ''}
                      </span>
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <Badge>{set.status}</Badge>
                      {set.bodyCheckInId ? (
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/body/check-ins/${set.bodyCheckInId}`}>Check-in</Link>
                        </Button>
                      ) : null}
                      <Button onClick={() => onOpen(set.id)} size="sm" variant="outline">
                        Open set
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="py-10 text-center">
              <LockKeyhole
                aria-hidden="true"
                className="mx-auto mb-3 size-8 text-muted-foreground"
              />
              <p className="font-medium">No private photo sets</p>
              <p className="text-sm text-muted-foreground">
                Create a dated partial set when you are ready.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      {selected.length >= 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Same-pose comparison</CardTitle>
            <CardDescription>
              Lighting, clothing, pose, distance, and context can change appearance. Pulse does not
              infer body fat or muscle change.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {shared.length ? (
              <>
                <div className="max-w-sm">
                  <Label htmlFor="comparison-pose">Shared pose</Label>
                  <select
                    className={selectClass}
                    id="comparison-pose"
                    onChange={(e) => {
                      setPose(e.target.value as BodyProgressPhotoView);
                      setShowComparison(false);
                    }}
                    value={shared.includes(pose) ? pose : shared[0]}
                  >
                    {shared.map((view) => (
                      <option key={view} value={view}>
                        {viewLabels[view]}
                      </option>
                    ))}
                  </select>
                </div>
                <Button onClick={() => setShowComparison(true)}>
                  Load authenticated comparison
                </Button>
                {showComparison ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {selectedSets.map((set) => {
                      const effectivePose = shared.includes(pose) ? pose : shared[0];
                      const photo = set.photos.find((item) => item.view === effectivePose);
                      return photo ? (
                        <figure className="min-w-0" key={set.id}>
                          <PrivatePhoto
                            alt={`${viewLabels[effectivePose]} comparison photo from ${formatPhotoDate(set.date)}`}
                            className="aspect-[3/4] w-full rounded-xl bg-black object-contain"
                            eager
                            id={photo.id}
                            variant="comparison"
                          />
                          <figcaption className="mt-2 text-sm">
                            <span className="font-medium">{formatPhotoDate(set.date)}</span>
                            <span className="block text-muted-foreground">
                              {set.context.meal.replace('_', ' ')} ·{' '}
                              {set.context.workout.replace('_', ' ')}
                            </span>
                          </figcaption>
                        </figure>
                      ) : null;
                    })}
                  </div>
                ) : null}
              </>
            ) : (
              <p role="status">
                These sets have no exact shared pose. Choose different sets or add the same pose to
                each.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function ProgressPhotosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('set');
  return (
    <main
      className="mx-auto flex w-full max-w-6xl flex-col gap-5 py-5"
      data-testid="progress-photos-page"
    >
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link to="/body">
              <ArrowLeft aria-hidden="true" /> Body Progress
            </Link>
          </Button>
        }
        description="Encrypted, authenticated progress photos with explicit consent and no image analysis."
        title="Private Progress Photos"
      />
      <ConsentCard />
      <PreferencesCard />
      {selectedId ? (
        <SetDetail id={selectedId} onDeleted={() => setSearchParams({})} />
      ) : (
        <>
          <CreateSetCard onCreated={(id) => setSearchParams({ set: id })} />
          <TimelineAndComparison onOpen={(id) => setSearchParams({ set: id })} />
        </>
      )}
    </main>
  );
}
