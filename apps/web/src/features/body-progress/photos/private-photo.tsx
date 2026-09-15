import { useEffect, useState } from 'react';
import { ImageOff, LoaderCircle, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { fetchPrivatePhoto } from './api';
import { photoErrorMessage } from './utils';

interface PrivatePhotoProps {
  alt: string;
  id: string;
  variant: 'thumbnail' | 'comparison' | 'full';
  eager?: boolean;
  className?: string;
}

export function PrivatePhoto({ alt, id, variant, eager = false, className }: PrivatePhotoProps) {
  const [requested, setRequested] = useState(eager);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(eager);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void fetchPrivatePhoto(id, variant, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [attempt, id, requested, variant]);

  if (!requested)
    return (
      <Button
        className="min-h-11 w-full"
        onClick={() => {
          setLoading(true);
          setError(null);
          setRequested(true);
        }}
        variant="outline"
      >
        Load private {variant}
      </Button>
    );
  if (loading)
    return (
      <div
        aria-live="polite"
        className="flex min-h-40 items-center justify-center rounded-xl bg-secondary/40"
      >
        <LoaderCircle
          aria-hidden="true"
          className="size-5 animate-spin motion-reduce:animate-none"
        />
        <span className="ml-2">Loading private image…</span>
      </div>
    );
  if (error)
    return (
      <div className="rounded-xl border border-destructive/40 p-4" role="alert">
        <ImageOff aria-hidden="true" className="mb-2 size-6" />
        <p className="text-sm">{photoErrorMessage(error)}</p>
        <Button
          className="mt-3"
          onClick={() => {
            setLoading(true);
            setError(null);
            setAttempt((value) => value + 1);
          }}
          variant="outline"
        >
          <RotateCcw aria-hidden="true" /> Retry private image
        </Button>
      </div>
    );
  return url ? <img alt={alt} className={className} src={url} /> : null;
}
