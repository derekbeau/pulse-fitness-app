import { useEffect, useState, type FormEvent } from 'react';
import { CalendarDaysIcon, ClipboardPlusIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Protocol, ProtocolStatus } from '../types';

type ProtocolListProps = {
  protocols: Protocol[];
};

type ProtocolDraft = {
  name: string;
  notes: string;
  startDate: string;
  status: ProtocolStatus;
};

const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const PROTOCOL_STATUS_ORDER: Record<ProtocolStatus, number> = {
  active: 0,
  completed: 1,
  discontinued: 2,
};

const PROTOCOL_STATUS_META: Record<
  ProtocolStatus,
  {
    badgeClassName: string;
    label: string;
  }
> = {
  active: {
    badgeClassName:
      'border-transparent bg-emerald-200 text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-300',
    label: 'Active',
  },
  completed: {
    badgeClassName:
      'border-transparent bg-sky-200 text-sky-950 dark:bg-sky-500/20 dark:text-sky-300',
    label: 'Completed',
  },
  discontinued: {
    badgeClassName:
      'border-transparent bg-slate-200 text-slate-950 dark:bg-slate-500/20 dark:text-slate-300',
    label: 'Discontinued',
  },
};

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getDefaultDraft(): ProtocolDraft {
  return {
    name: '',
    notes: '',
    startDate: getTodayDate(),
    status: 'active',
  };
}

function parseDate(date: string) {
  return new Date(`${date}T12:00:00`);
}

function formatDate(date: string) {
  return fullDateFormatter.format(parseDate(date));
}

function createProtocolId(name: string) {
  const baseSlug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${baseSlug || 'protocol'}-${Date.now().toString(36)}`;
}

function getProtocolSortDate(protocol: Protocol) {
  if (protocol.status === 'active') {
    return protocol.startDate;
  }

  return protocol.endDate ?? protocol.startDate;
}

function sortProtocols(protocols: Protocol[]) {
  return [...protocols].sort((left, right) => {
    const statusDifference =
      PROTOCOL_STATUS_ORDER[left.status] - PROTOCOL_STATUS_ORDER[right.status];

    if (statusDifference !== 0) {
      return statusDifference;
    }

    const dateDifference =
      parseDate(getProtocolSortDate(right)).getTime() -
      parseDate(getProtocolSortDate(left)).getTime();

    if (dateDifference !== 0) {
      return dateDifference;
    }

    return left.name.localeCompare(right.name);
  });
}

export function ProtocolList({ protocols }: ProtocolListProps) {
  const [localProtocols, setLocalProtocols] = useState<Protocol[]>(() => protocols);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [draftProtocol, setDraftProtocol] = useState<ProtocolDraft>(() => getDefaultDraft());

  useEffect(() => {
    setLocalProtocols(protocols);
  }, [protocols]);

  const visibleProtocols = sortProtocols(localProtocols);

  function updateDraft<K extends keyof ProtocolDraft>(field: K, value: ProtocolDraft[K]) {
    setDraftProtocol((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  }

  function closeDialog() {
    setIsAddDialogOpen(false);
    setDraftProtocol(getDefaultDraft());
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = draftProtocol.name.trim();
    const notes = draftProtocol.notes.trim();

    if (!name || !draftProtocol.startDate) {
      return;
    }

    setLocalProtocols((currentProtocols) => [
      ...currentProtocols,
      {
        id: createProtocolId(name),
        name,
        notes,
        startDate: draftProtocol.startDate,
        status: draftProtocol.status,
        endDate: draftProtocol.status === 'active' ? undefined : draftProtocol.startDate,
      },
    ]);

    closeDialog();
  }

  function handleStatusChange(protocolId: string, nextStatus: ProtocolStatus) {
    const today = getTodayDate();

    setLocalProtocols((currentProtocols) =>
      currentProtocols.map((protocol) => {
        if (protocol.id !== protocolId || protocol.status === nextStatus) {
          return protocol;
        }

        return {
          ...protocol,
          status: nextStatus,
          endDate: nextStatus === 'active' ? undefined : (protocol.endDate ?? today),
        };
      }),
    );
  }

  return (
    <>
      <Card className="py-6 shadow-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl text-foreground">Protocols & Treatments</CardTitle>
            <CardDescription className="max-w-2xl">
              Track which therapies, drills, and training modifications are still in play versus
              which ones were completed or dropped.
            </CardDescription>
          </div>

          <Button className="gap-2 self-start" onClick={() => setIsAddDialogOpen(true)}>
            <ClipboardPlusIcon aria-hidden="true" className="size-4" />
            Add Protocol
          </Button>
        </CardHeader>

        <CardContent>
          {visibleProtocols.length > 0 ? (
            <div className="grid gap-3">
              {visibleProtocols.map((protocol) => (
                <article
                  className="grid gap-4 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm"
                  key={protocol.id}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-foreground">{protocol.name}</h3>
                        <Badge className={PROTOCOL_STATUS_META[protocol.status].badgeClassName}>
                          {PROTOCOL_STATUS_META[protocol.status].label}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                          <CalendarDaysIcon
                            aria-hidden="true"
                            className="size-3.5 text-muted-foreground"
                          />
                          Started {formatDate(protocol.startDate)}
                        </span>

                        {protocol.endDate ? (
                          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                            <CalendarDaysIcon
                              aria-hidden="true"
                              className="size-3.5 text-muted-foreground"
                            />
                            Ended {formatDate(protocol.endDate)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="w-full max-w-full space-y-2 lg:max-w-[12rem]">
                      <Label
                        className="text-xs font-semibold uppercase tracking-[0.16em]"
                        htmlFor={`protocol-status-${protocol.id}`}
                      >
                        Status
                      </Label>
                      <Select
                        onValueChange={(value) =>
                          handleStatusChange(protocol.id, value as ProtocolStatus)
                        }
                        value={protocol.status}
                      >
                        <SelectTrigger
                          aria-label={`Update protocol status for ${protocol.name}`}
                          id={`protocol-status-${protocol.id}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(['active', 'completed', 'discontinued'] as const).map((status) => (
                            <SelectItem key={status} value={status}>
                              {PROTOCOL_STATUS_META[status].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {protocol.notes ? (
                    <p className="rounded-xl bg-background/80 px-3 py-2 text-sm leading-6 text-muted-foreground">
                      {protocol.notes}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
              No protocols logged yet. Add the first therapy, drill, or training modification to
              start tracking it locally.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog
        onOpenChange={(open) => (open ? setIsAddDialogOpen(true) : closeDialog())}
        open={isAddDialogOpen}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Protocol</DialogTitle>
            <DialogDescription>
              Capture a therapy, exercise, or training modification for this condition.
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="protocol-name">Protocol name</Label>
                <Input
                  aria-label="Protocol name"
                  id="protocol-name"
                  onChange={(event) => updateDraft('name', event.target.value)}
                  placeholder="Spanish squats"
                  required
                  value={draftProtocol.name}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="protocol-status">Status</Label>
                <Select
                  onValueChange={(value) => updateDraft('status', value as ProtocolStatus)}
                  value={draftProtocol.status}
                >
                  <SelectTrigger aria-label="Protocol status" id="protocol-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['active', 'completed', 'discontinued'] as const).map((status) => (
                      <SelectItem key={status} value={status}>
                        {PROTOCOL_STATUS_META[status].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="protocol-start-date">Start date</Label>
                <Input
                  aria-label="Protocol start date"
                  id="protocol-start-date"
                  onChange={(event) => updateDraft('startDate', event.target.value)}
                  required
                  type="date"
                  value={draftProtocol.startDate}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="protocol-notes">Notes</Label>
              <Textarea
                aria-label="Protocol notes"
                className="min-h-28"
                id="protocol-notes"
                onChange={(event) => updateDraft('notes', event.target.value)}
                placeholder="What changed, how it helps, or when to use it."
                value={draftProtocol.notes}
              />
            </div>

            <DialogFooter>
              <Button onClick={closeDialog} type="button" variant="outline">
                Cancel
              </Button>
              <Button type="submit">Save Protocol</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
