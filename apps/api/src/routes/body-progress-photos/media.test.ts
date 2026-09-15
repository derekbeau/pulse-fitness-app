import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import type { MultipartFile } from '@fastify/multipart';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  decryptVariantToTemporaryFile,
  processAndEncryptPhoto,
  ProgressPhotoMediaError,
} from './media.js';

const TEST_KEY = Buffer.from('pulse-photo-test-key-32-bytes-ok!')
  .subarray(0, 32)
  .toString('base64');
const silhouette = Buffer.from(
  `<svg width="180" height="260" xmlns="http://www.w3.org/2000/svg"><rect width="180" height="260" fill="#dae7f2"/><circle cx="90" cy="45" r="25" fill="#9b6b43"/><path d="M55 75h70l20 110H35z" fill="#245e8c"/><rect x="52" y="185" width="28" height="70" fill="#273142"/><rect x="100" y="185" width="28" height="70" fill="#273142"/></svg>`,
);

const makeImage = async (format: 'jpeg' | 'png' | 'webp', orientation?: number) => {
  let image = sharp(silhouette);
  if (orientation) image = image.withMetadata({ orientation });
  return format === 'jpeg'
    ? image.jpeg().toBuffer()
    : format === 'png'
      ? image.png().toBuffer()
      : image.webp().toBuffer();
};

const part = (contents: Buffer, filename: string, mimetype: string, fieldname = 'front') =>
  ({
    type: 'file',
    fieldname,
    filename,
    encoding: '7bit',
    mimetype,
    file: Object.assign(Readable.from(contents), { truncated: false }),
    fields: {},
    toBuffer: async () => contents,
  }) as unknown as MultipartFile;

describe('progress photo media security', () => {
  let directory = '';
  let mediaRoot = '';
  beforeEach(async () => {
    directory = await realpath(await mkdtemp(join(tmpdir(), 'pulse-photo-media-')));
    mediaRoot = join(directory, 'private');
    process.env.BODY_PROGRESS_MEDIA_ROOT = mediaRoot;
    process.env.BODY_PROGRESS_MEDIA_KEY = TEST_KEY;
  });
  afterEach(async () => {
    delete process.env.BODY_PROGRESS_MEDIA_ROOT;
    delete process.env.BODY_PROGRESS_MEDIA_KEY;
    await rm(directory, { recursive: true, force: true });
  });

  it.each([
    ['jpeg', 'synthetic-clothed.jpg', 'image/jpeg'],
    ['png', 'synthetic-clothed.png', 'image/png'],
    ['webp', 'synthetic-clothed.webp', 'image/webp'],
  ] as const)(
    'normalizes and encrypts synthetic clothed %s input with metadata stripped',
    async (format, filename, mimetype) => {
      const processed = await processAndEncryptPhoto({
        part: part(await makeImage(format, format === 'jpeg' ? 6 : undefined), filename, mimetype),
        photoId: '33333333-3333-4333-8333-333333333333',
        userId: 'fixture-user',
        view: 'front',
      });
      expect(processed.variants.map(({ variant }) => variant)).toEqual([
        'original',
        'full',
        'comparison',
        'thumbnail',
      ]);
      expect(new Set(processed.variants.map(({ nonce }) => nonce)).size).toBe(4);
      const encrypted = await readFile(join(mediaRoot, processed.normalized.storageKey));
      expect(encrypted.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);
      expect((await lstat(mediaRoot)).mode & 0o777).toBe(0o700);
      expect((await lstat(join(mediaRoot, processed.normalized.storageKey))).mode & 0o777).toBe(
        0o600,
      );
      const original = processed.variants.find((variant) => variant.variant === 'original');
      if (!original) throw new Error('Sanitized original variant is missing');
      const decryptedOriginal = await decryptVariantToTemporaryFile({
        userId: 'fixture-user',
        photoId: '33333333-3333-4333-8333-333333333333',
        view: 'front',
        variant: original,
      });
      const decrypted = await decryptVariantToTemporaryFile({
        userId: 'fixture-user',
        photoId: '33333333-3333-4333-8333-333333333333',
        view: 'front',
        variant: processed.normalized,
      });
      try {
        const originalMetadata = await sharp(decryptedOriginal.path).metadata();
        expect(originalMetadata.format).toBe(format);
        expect(originalMetadata.exif).toBeUndefined();
        expect(originalMetadata.icc).toBeUndefined();
        expect(originalMetadata.xmp).toBeUndefined();
        expect(originalMetadata.pages ?? 1).toBe(1);
        const metadata = await sharp(decrypted.path).metadata();
        expect(metadata.format).toBe('jpeg');
        expect(metadata.exif).toBeUndefined();
        expect(metadata.icc).toBeUndefined();
        expect(metadata.xmp).toBeUndefined();
        expect(metadata.pages ?? 1).toBe(1);
        if (format === 'jpeg') {
          expect(originalMetadata.width).toBe(260);
          expect(originalMetadata.height).toBe(180);
          expect(metadata.width).toBe(260);
          expect(metadata.height).toBe(180);
        }
      } finally {
        await decryptedOriginal.cleanup();
        await decrypted.cleanup();
        await processed.cleanupCommitted();
      }
    },
  );

  it('rejects HEIC with the exact client-conversion contract and rejects hint/path mismatches', async () => {
    const heic = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic'), Buffer.alloc(20)]);
    await expect(
      processAndEncryptPhoto({
        part: part(heic, 'phone.heic', 'image/heic'),
        photoId: '33333333-3333-4333-8333-333333333333',
        userId: 'fixture-user',
        view: 'front',
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_HEIC_CLIENT_CONVERSION_REQUIRED' });
    const jpeg = await makeImage('jpeg');
    await expect(
      processAndEncryptPhoto({
        part: part(jpeg, 'photo.png', 'image/png'),
        photoId: '33333333-3333-4333-8333-333333333333',
        userId: 'fixture-user',
        view: 'front',
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_SIGNATURE_MISMATCH' });
    await expect(
      processAndEncryptPhoto({
        part: part(jpeg, '../photo.jpg', 'image/jpeg'),
        photoId: '33333333-3333-4333-8333-333333333333',
        userId: 'fixture-user',
        view: 'front',
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_INVALID' });
    await expect(
      processAndEncryptPhoto({
        part: part(jpeg, 'photo.profile.jpg', 'image/jpeg'),
        photoId: '33333333-3333-4333-8333-333333333333',
        userId: 'fixture-user',
        view: 'front',
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_INVALID' });
  });

  it('rejects malformed content that only imitates a JPEG signature', async () => {
    await expect(
      processAndEncryptPhoto({
        part: part(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]), 'broken.jpg', 'image/jpeg'),
        photoId: '33333333-3333-4333-8333-333333333333',
        userId: 'fixture-user',
        view: 'front',
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_DECODER_REJECTED' });
    expect(await readdir(mediaRoot)).toEqual([]);
  });

  it('fails closed for missing, wrong, and tampered keys without leaving plaintext', async () => {
    const processed = await processAndEncryptPhoto({
      part: part(await makeImage('jpeg'), 'synthetic-clothed.jpg', 'image/jpeg'),
      photoId: '33333333-3333-4333-8333-333333333333',
      userId: 'fixture-user',
      view: 'front',
    });
    delete process.env.BODY_PROGRESS_MEDIA_KEY;
    await expect(
      decryptVariantToTemporaryFile({
        userId: 'fixture-user',
        photoId: '33333333-3333-4333-8333-333333333333',
        view: 'front',
        variant: processed.normalized,
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_KEY_UNAVAILABLE' });
    process.env.BODY_PROGRESS_MEDIA_KEY = Buffer.alloc(32, 9).toString('base64');
    await expect(
      decryptVariantToTemporaryFile({
        userId: 'fixture-user',
        photoId: '33333333-3333-4333-8333-333333333333',
        view: 'front',
        variant: processed.normalized,
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_INTEGRITY_FAILURE' });
    process.env.BODY_PROGRESS_MEDIA_KEY = TEST_KEY;
    await expect(
      decryptVariantToTemporaryFile({
        userId: 'fixture-user',
        photoId: '33333333-3333-4333-8333-333333333333',
        view: 'back',
        variant: processed.normalized,
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_INTEGRITY_FAILURE' });
    await expect(
      decryptVariantToTemporaryFile({
        userId: 'fixture-user',
        photoId: '33333333-3333-4333-8333-333333333333',
        view: 'front',
        variant: { ...processed.normalized, width: processed.normalized.width + 1 },
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_INTEGRITY_FAILURE' });
    const path = join(mediaRoot, processed.normalized.storageKey);
    const ciphertext = await readFile(path);
    ciphertext[Math.floor(ciphertext.length / 2)] ^= 0xff;
    await writeFile(path, ciphertext, { mode: 0o600 });
    await expect(
      decryptVariantToTemporaryFile({
        userId: 'fixture-user',
        photoId: '33333333-3333-4333-8333-333333333333',
        view: 'front',
        variant: processed.normalized,
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_INTEGRITY_FAILURE' });
    expect(
      (await readdir(directory, { recursive: true })).some((name) => String(name).endsWith('.jpg')),
    ).toBe(false);
    await processed.cleanupCommitted();
  });

  it('enforces the 12 MiB decoded-input boundary and cleans all temporary files', async () => {
    const oversized = Buffer.alloc(12 * 1024 * 1024 + 1, 1);
    await expect(
      processAndEncryptPhoto({
        part: part(oversized, 'synthetic-clothed.jpg', 'image/jpeg'),
        photoId: '33333333-3333-4333-8333-333333333333',
        userId: 'fixture-user',
        view: 'front',
      }),
    ).rejects.toBeInstanceOf(ProgressPhotoMediaError);
    const files = await readdir(mediaRoot);
    expect(files).toEqual([]);
  });

  it('cleans encrypted and plaintext temporaries when atomic commit is interrupted', async () => {
    await expect(
      processAndEncryptPhoto({
        part: part(await makeImage('jpeg'), 'synthetic-clothed.jpg', 'image/jpeg'),
        photoId: '33333333-3333-4333-8333-333333333333',
        userId: 'fixture-user',
        view: 'front',
        beforeAtomicCommit: () => {
          throw new Error('synthetic atomic commit interruption');
        },
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_STORAGE_UNAVAILABLE' });
    expect(await readdir(mediaRoot)).toEqual([]);
  });

  it('rejects configured roots with a symlink final component or ancestor without target ciphertext', async () => {
    const jpeg = await makeImage('jpeg');
    const target = join(directory, 'symlink-target');
    await mkdir(target, { mode: 0o700 });
    await symlink(target, mediaRoot);
    await expect(
      processAndEncryptPhoto({
        part: part(jpeg, 'synthetic-clothed.jpg', 'image/jpeg'),
        photoId: '33333333-3333-4333-8333-333333333333',
        userId: 'fixture-user',
        view: 'front',
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_STORAGE_UNAVAILABLE' });
    expect(await readdir(target)).toEqual([]);

    await rm(mediaRoot);
    const ancestorTarget = join(directory, 'ancestor-target');
    const ancestorLink = join(directory, 'ancestor-link');
    await mkdir(ancestorTarget, { mode: 0o700 });
    await symlink(ancestorTarget, ancestorLink);
    process.env.BODY_PROGRESS_MEDIA_ROOT = join(ancestorLink, 'private');
    await expect(
      processAndEncryptPhoto({
        part: part(jpeg, 'synthetic-clothed.jpg', 'image/jpeg'),
        photoId: '33333333-3333-4333-8333-333333333333',
        userId: 'fixture-user',
        view: 'front',
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_STORAGE_UNAVAILABLE' });
    expect(await readdir(ancestorTarget)).toEqual([]);
  });

  it('revalidates the configured root after an ancestor replacement race before commit', async () => {
    const attackerTarget = join(directory, 'race-target');
    const movedRoot = join(directory, 'private-original');
    await mkdir(attackerTarget, { mode: 0o700 });
    let replaced = false;
    await expect(
      processAndEncryptPhoto({
        part: part(await makeImage('jpeg'), 'synthetic-clothed.jpg', 'image/jpeg'),
        photoId: '33333333-3333-4333-8333-333333333333',
        userId: 'fixture-user',
        view: 'front',
        beforeAtomicCommit: async () => {
          if (replaced) return;
          replaced = true;
          await rename(mediaRoot, movedRoot);
          await symlink(attackerTarget, mediaRoot);
        },
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_STORAGE_UNAVAILABLE' });
    expect(await readdir(attackerTarget)).toEqual([]);
    expect((await readdir(movedRoot)).filter((name) => name.endsWith('.enc'))).toEqual([]);
  });

  it.each([
    ['svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['gif', Buffer.from('GIF89a')],
    ['pdf', Buffer.from('%PDF-1.7')],
    ['zip', Buffer.from('PK\u0003\u0004')],
    ['executable', Buffer.from('MZ')],
  ])('rejects %s and unknown executable content', async (_name, contents) => {
    await expect(
      processAndEncryptPhoto({
        part: part(contents, 'synthetic-clothed.jpg', 'image/jpeg'),
        photoId: '33333333-3333-4333-8333-333333333333',
        userId: 'fixture-user',
        view: 'front',
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_UNSUPPORTED_FORMAT' });
  });

  it('rejects a valid-image ZIP polyglot and oversized decoded dimensions', async () => {
    const jpeg = await makeImage('jpeg');
    await expect(
      processAndEncryptPhoto({
        part: part(
          Buffer.concat([jpeg, Buffer.from('PK\u0003\u0004payload')]),
          'synthetic-clothed.jpg',
          'image/jpeg',
        ),
        photoId: '33333333-3333-4333-8333-333333333333',
        userId: 'fixture-user',
        view: 'front',
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_INVALID' });
    const bomb = await sharp({
      create: { width: 6500, height: 6500, channels: 3, background: '#24608d' },
      limitInputPixels: false,
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await expect(
      processAndEncryptPhoto({
        part: part(bomb, 'synthetic-clothed.png', 'image/png'),
        photoId: '33333333-3333-4333-8333-333333333333',
        userId: 'fixture-user',
        view: 'front',
      }),
    ).rejects.toMatchObject({ code: 'BODY_PROGRESS_PHOTO_PIXEL_LIMIT' });
  });
});
