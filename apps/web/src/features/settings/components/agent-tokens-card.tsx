import { useState } from 'react';

import {
  CheckIcon,
  ClipboardIcon,
  KeyIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  useAgentTokens,
  useCreateAgentToken,
  useDeleteAgentToken,
  useRegenerateAgentToken,
  type AgentTokenListItem,
} from '@/hooks/use-agent-tokens';

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestamp));
}

function CopyableToken({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-foreground">Your token</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-lg border border-border/80 bg-secondary/50 px-3 py-2 text-xs break-all font-mono text-foreground">
          {token}
        </code>
        <Button
          className="shrink-0"
          onClick={handleCopy}
          size="icon"
          type="button"
          variant="outline"
        >
          {copied ? <CheckIcon className="size-4" /> : <ClipboardIcon className="size-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Copy this token now — it won't be shown again.
      </p>
    </div>
  );
}

function CreateTokenDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const createMutation = useCreateAgentToken();

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setName('');
      setRevealedToken(null);
      createMutation.reset();
    }
    onOpenChange(nextOpen);
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;

    const result = await createMutation.mutateAsync(trimmed);
    setRevealedToken(result.token);
  }

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{revealedToken ? 'Token created' : 'Create agent token'}</DialogTitle>
          <DialogDescription>
            {revealedToken
              ? "Your new token is ready. Copy it now — you won't be able to see it again."
              : 'Give this token a name so you can identify it later.'}
          </DialogDescription>
        </DialogHeader>

        {revealedToken ? (
          <CopyableToken token={revealedToken} />
        ) : (
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground" htmlFor="token-name">
              Token name
            </Label>
            <Input
              autoFocus
              id="token-name"
              maxLength={255}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) handleCreate();
              }}
              placeholder='e.g. "Claude Code", "iOS Shortcut"'
              value={name}
            />
          </div>
        )}

        <DialogFooter>
          {revealedToken ? (
            <Button onClick={() => handleClose(false)} type="button">
              Done
            </Button>
          ) : (
            <Button
              disabled={!name.trim() || createMutation.isPending}
              onClick={handleCreate}
              type="button"
            >
              {createMutation.isPending ? 'Creating...' : 'Create token'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegenerateTokenDialog({
  open,
  onOpenChange,
  token,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: AgentTokenListItem | null;
}) {
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const regenerateMutation = useRegenerateAgentToken();

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setRevealedToken(null);
      regenerateMutation.reset();
    }
    onOpenChange(nextOpen);
  }

  async function handleRegenerate() {
    if (!token) return;

    const result = await regenerateMutation.mutateAsync(token.id);
    setRevealedToken(result.token);
  }

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {revealedToken ? 'Token regenerated' : `Regenerate "${token?.name}"?`}
          </DialogTitle>
          <DialogDescription>
            {revealedToken
              ? "Your new token is ready. Copy it now — you won't be able to see it again."
              : 'The current token will stop working immediately. Any agents using it will need to be updated.'}
          </DialogDescription>
        </DialogHeader>

        {revealedToken ? <CopyableToken token={revealedToken} /> : null}

        <DialogFooter>
          {revealedToken ? (
            <Button onClick={() => handleClose(false)} type="button">
              Done
            </Button>
          ) : (
            <>
              <Button onClick={() => handleClose(false)} type="button" variant="outline">
                Cancel
              </Button>
              <Button
                disabled={regenerateMutation.isPending}
                onClick={handleRegenerate}
                type="button"
                variant="destructive"
              >
                {regenerateMutation.isPending ? 'Regenerating...' : 'Regenerate'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenRow({
  token,
  onRegenerate,
  onDelete,
}: {
  token: AgentTokenListItem;
  onRegenerate: (token: AgentTokenListItem) => void;
  onDelete: (token: AgentTokenListItem) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/80 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <KeyIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium text-foreground">{token.name}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Created {formatDate(token.createdAt)}</span>
          {token.lastUsedAt && <span>Last used {formatDate(token.lastUsedAt)}</span>}
          {!token.lastUsedAt && <span>Never used</span>}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          className="gap-1.5"
          onClick={() => onRegenerate(token)}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCwIcon className="size-3.5" />
          <span className="hidden sm:inline">Regenerate</span>
        </Button>
        <Button
          className="gap-1.5"
          onClick={() => onDelete(token)}
          size="sm"
          type="button"
          variant="outline"
        >
          <TrashIcon className="size-3.5" />
          <span className="hidden sm:inline">Delete</span>
        </Button>
      </div>
    </div>
  );
}

export function AgentTokensCard() {
  const { data: tokens = [], isLoading } = useAgentTokens();
  const deleteMutation = useDeleteAgentToken();

  const [showCreate, setShowCreate] = useState(false);
  const [regenerateTarget, setRegenerateTarget] = useState<AgentTokenListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentTokenListItem | null>(null);

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    <>
      <Card className="gap-4 border-border/70 shadow-sm">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle>
                <h2 className="text-xl font-semibold text-foreground">Agent Tokens</h2>
              </CardTitle>
              <CardDescription>
                Create tokens for AI agents and automations to access your Pulse data.
              </CardDescription>
            </div>
            <Button
              className="shrink-0 gap-1.5"
              onClick={() => setShowCreate(true)}
              size="sm"
              type="button"
            >
              <PlusIcon className="size-4" />
              <span className="hidden sm:inline">New token</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[72px] animate-pulse rounded-xl border border-border/50 bg-secondary/30"
                />
              ))}
            </div>
          ) : tokens.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 px-4 py-8 text-center">
              <KeyIcon className="mx-auto size-8 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-medium text-foreground">No agent tokens yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a token to let AI agents log meals, workouts, and more.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tokens.map((token) => (
                <TokenRow
                  key={token.id}
                  onDelete={setDeleteTarget}
                  onRegenerate={setRegenerateTarget}
                  token={token}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateTokenDialog onOpenChange={setShowCreate} open={showCreate} />

      <RegenerateTokenDialog
        onOpenChange={(open) => {
          if (!open) setRegenerateTarget(null);
        }}
        open={regenerateTarget !== null}
        token={regenerateTarget}
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This token will stop working immediately. Any agents using it will lose access. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleteMutation.isPending} onClick={handleDelete}>
              {deleteMutation.isPending ? 'Deleting...' : 'Delete token'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
