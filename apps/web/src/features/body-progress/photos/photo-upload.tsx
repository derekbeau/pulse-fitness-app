import { useEffect, useRef, useState } from 'react';
import { Camera, Check, FileImage, RefreshCcw, Trash2, Upload } from 'lucide-react';
import type { BodyProgressPhotoSet, BodyProgressPhotoView } from '@pulse/shared';

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
import { ProgressBar } from '@/components/ui/progress-bar';
import { useUploadPhoto } from './api';
import { photoErrorMessage, viewLabels } from './utils';

type Selection = {
  file: File;
  url: string;
  status: 'ready' | 'uploading' | 'done' | 'failed';
  error?: string;
};
type Selections = Partial<Record<BodyProgressPhotoView, Selection>>;
const accepted = ['image/jpeg', 'image/png', 'image/webp'];
const heic = /\.(heic|heif)$/iu;

async function dimensions(file: File, url: string): Promise<number> {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file);
    const pixels = bitmap.width * bitmap.height;
    bitmap.close();
    return pixels;
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth * image.naturalHeight);
    image.onerror = () => reject(new Error('This image could not be decoded.'));
    image.src = url;
  });
}

export function PhotoUpload({ set }: { set: BodyProgressPhotoSet }) {
  const upload = useUploadPhoto();
  const [selections, setSelections] = useState<Selections>({});
  const selectionsRef = useRef(selections);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [cameraView, setCameraView] = useState<BodyProgressPhotoView | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  selectionsRef.current = selections;

  useEffect(
    () => () => {
      Object.values(selectionsRef.current).forEach((item) => item && URL.revokeObjectURL(item.url));
      streamRef.current?.getTracks().forEach((track) => track.stop());
      uploadControllerRef.current?.abort();
    },
    [],
  );

  const choose = async (view: BodyProgressPhotoView, file?: File) => {
    if (!file) return;
    setMessage(null);
    if (heic.test(file.name) || /hei[cf]/iu.test(file.type)) {
      setMessage(
        'HEIC/HEIF cannot be decoded or converted reliably in this app. Convert it to JPEG, PNG, or WebP first.',
      );
      return;
    }
    if (!accepted.includes(file.type)) {
      setMessage('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setMessage('The image is over the 12 MiB input limit.');
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      if ((await dimensions(file, url)) > 40_000_000) {
        URL.revokeObjectURL(url);
        setMessage('The image is over the 40 megapixel limit.');
        return;
      }
    } catch (error) {
      URL.revokeObjectURL(url);
      setMessage(photoErrorMessage(error));
      return;
    }
    setSelections((current) => {
      const previous = current[view];
      if (previous) URL.revokeObjectURL(previous.url);
      return { ...current, [view]: { file, url, status: 'ready' } };
    });
  };

  const openCamera = async (view: BodyProgressPhotoView) => {
    setCameraError(null);
    setCameraView(view);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Camera capture is unavailable in this browser.');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraError(
        'Camera permission was denied or capture is unavailable. File selection remains available below.',
      );
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraView(null);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !cameraView || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        void choose(
          cameraView,
          new File([blob], `${cameraView}-${set.date}.jpg`, { type: 'image/jpeg' }),
        );
        closeCamera();
      },
      'image/jpeg',
      0.92,
    );
  };

  const pending = Object.entries(selections).filter(
    ([, item]) => item && item.status !== 'done',
  ) as [BodyProgressPhotoView, Selection][];
  const uploadAll = async () => {
    setMessage(null);
    setProgress({ done: 0, total: pending.length });
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    for (const [view, item] of pending) {
      setSelections((current) => ({
        ...current,
        [view]: { ...item, status: 'uploading', error: undefined },
      }));
      try {
        await upload.mutateAsync({
          setId: set.id,
          view,
          file: item.file,
          signal: controller.signal,
        });
        URL.revokeObjectURL(item.url);
        setSelections(
          (current) =>
            Object.fromEntries(
              Object.entries(current).filter(([key]) => key !== view),
            ) as Selections,
        );
        setProgress((current) => ({ ...current, done: current.done + 1 }));
      } catch (error) {
        const copy = controller.signal.aborted
          ? 'Upload cancelled. The selected file remains in memory for retry or removal.'
          : photoErrorMessage(error);
        setSelections((current) => ({
          ...current,
          [view]: { ...item, status: 'failed', error: copy },
        }));
      }
      if (controller.signal.aborted) break;
    }
    uploadControllerRef.current = null;
  };

  const availableViews = (['front', 'side_left', 'side_right', 'back'] as const).filter(
    (view) => !set.photos.some((photo) => photo.view === view),
  );

  return (
    <Card className="border-primary/25">
      <CardHeader>
        <CardTitle>Add private photos</CardTitle>
        <CardDescription>
          JPEG, PNG, or WebP · 12 MiB and 40 MP per image · up to three views per upload. Images
          stay in memory until sent or removed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {availableViews.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {availableViews.map((view) => {
              const item = selections[view];
              return (
                <section className="min-w-0 rounded-xl border border-border/70 p-3" key={view}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="font-medium">{viewLabels[view]}</h3>
                    {item?.status === 'done' ? (
                      <Check aria-label="Uploaded" className="size-5 text-primary" />
                    ) : null}
                  </div>
                  {item ? (
                    <img
                      alt={`${viewLabels[view]} selected preview`}
                      className="mb-3 aspect-[3/4] w-full rounded-lg object-cover"
                      src={item.url}
                    />
                  ) : (
                    <div className="mb-3 flex aspect-[3/4] items-center justify-center rounded-lg bg-secondary/50">
                      <FileImage aria-hidden="true" className="size-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="grid gap-2">
                    <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium focus-within:ring-2 focus-within:ring-ring">
                      <FileImage aria-hidden="true" className="size-4" /> Choose file
                      <input
                        accept="image/jpeg,image/png,image/webp,.heic,.heif"
                        className="sr-only"
                        onChange={(event) => void choose(view, event.target.files?.[0])}
                        type="file"
                      />
                    </label>
                    <Button onClick={() => void openCamera(view)} type="button" variant="outline">
                      <Camera aria-hidden="true" /> Use camera
                    </Button>
                    {item ? (
                      <Button
                        onClick={() =>
                          setSelections((current) => {
                            URL.revokeObjectURL(item.url);
                            return Object.fromEntries(
                              Object.entries(current).filter(([key]) => key !== view),
                            ) as Selections;
                          })
                        }
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" /> Remove selection
                      </Button>
                    ) : null}
                  </div>
                  {item?.error ? (
                    <p className="mt-2 text-sm text-destructive" role="alert">
                      {item.error}
                    </p>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <p>All supported poses are already present. Delete a photo before replacing it.</p>
        )}
        {progress.total ? (
          <ProgressBar
            label="Upload progress"
            max={progress.total}
            showValue
            value={progress.done}
          />
        ) : null}
        {message ? (
          <p className="rounded-lg border border-destructive/40 p-3 text-sm" role="alert">
            {message}
          </p>
        ) : null}
        <Button disabled={!pending.length || upload.isPending} onClick={() => void uploadAll()}>
          {pending.some(([, item]) => item.status === 'failed') ? (
            <RefreshCcw aria-hidden="true" />
          ) : (
            <Upload aria-hidden="true" />
          )}
          {upload.isPending
            ? 'Uploading securely…'
            : pending.some(([, item]) => item.status === 'failed')
              ? 'Retry failed uploads'
              : `Upload ${pending.length || ''} selected`}
        </Button>
        {upload.isPending ? (
          <Button
            onClick={() => uploadControllerRef.current?.abort()}
            type="button"
            variant="outline"
          >
            Cancel upload
          </Button>
        ) : null}
        <p aria-live="polite" className="text-sm text-muted-foreground">
          The set becomes complete only when the server returns every configured pose.
        </p>
      </CardContent>
      <Dialog
        onOpenChange={(open) => {
          if (!open) closeCamera();
        }}
        open={cameraView !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Capture {cameraView ? viewLabels[cameraView].toLowerCase() : ''} photo
            </DialogTitle>
            <DialogDescription>
              Camera access is optional. Nothing is uploaded until you review and select Upload.
            </DialogDescription>
          </DialogHeader>
          {cameraError ? (
            <div className="rounded-lg border border-destructive/40 p-3" role="alert">
              {cameraError}
            </div>
          ) : (
            <video
              aria-label="Camera preview"
              className="aspect-[3/4] w-full rounded-xl bg-black object-cover"
              muted
              playsInline
              ref={videoRef}
            />
          )}
          <DialogFooter>
            <Button onClick={closeCamera} variant="outline">
              Use file instead
            </Button>
            <Button disabled={Boolean(cameraError)} onClick={capture}>
              Capture photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
