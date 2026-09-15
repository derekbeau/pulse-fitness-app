import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  link,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  BODY_PROGRESS_PHOTO_ENCRYPTION_VERSION,
  BODY_PROGRESS_PHOTO_MAX_INPUT_BYTES,
  BODY_PROGRESS_PHOTO_MAX_PIXELS,
  type BodyProgressPhotoVariant,
  type BodyProgressPhotoView,
} from '@pulse/shared';
import type { MultipartFile } from '@fastify/multipart';
import sharp, { type Metadata, type OutputInfo } from 'sharp';

import type { StoredPhotoVariant } from '../../db/schema/body-progress-photos.js';

const FORMAT_MAGIC = Buffer.from('PBP1');
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = FORMAT_MAGIC.length + NONCE_BYTES;
const STORAGE_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.enc$/u;
const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const DEFAULT_MEDIA_ROOT =
  process.env.NODE_ENV === 'production'
    ? '/data/private/body-progress'
    : resolve(process.cwd(), 'data/private/body-progress');

export type MediaErrorCode =
  | 'BODY_PROGRESS_PHOTO_INVALID'
  | 'BODY_PROGRESS_PHOTO_FILE_COUNT_LIMIT'
  | 'BODY_PROGRESS_PHOTO_SIZE_LIMIT'
  | 'BODY_PROGRESS_PHOTO_SIGNATURE_MISMATCH'
  | 'BODY_PROGRESS_PHOTO_DECODER_REJECTED'
  | 'BODY_PROGRESS_PHOTO_PIXEL_LIMIT'
  | 'BODY_PROGRESS_PHOTO_UNSUPPORTED_FORMAT'
  | 'BODY_PROGRESS_PHOTO_HEIC_CLIENT_CONVERSION_REQUIRED'
  | 'BODY_PROGRESS_PHOTO_PROCESSING_FAILED'
  | 'BODY_PROGRESS_PHOTO_STORAGE_UNAVAILABLE'
  | 'BODY_PROGRESS_PHOTO_KEY_UNAVAILABLE'
  | 'BODY_PROGRESS_PHOTO_INTEGRITY_FAILURE';

export class ProgressPhotoMediaError extends Error {
  constructor(
    public readonly code: MediaErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProgressPhotoMediaError';
  }
}

export const getProgressPhotoMediaRoot = () =>
  resolve(process.env.BODY_PROGRESS_MEDIA_ROOT ?? DEFAULT_MEDIA_ROOT);

const parseMediaKey = () => {
  const encoded = process.env.BODY_PROGRESS_MEDIA_KEY;
  if (!encoded) {
    throw new ProgressPhotoMediaError(
      'BODY_PROGRESS_PHOTO_KEY_UNAVAILABLE',
      'Progress photo media is unavailable',
    );
  }
  if (!/^[A-Za-z0-9+/]{43}=$/u.test(encoded)) {
    throw new ProgressPhotoMediaError(
      'BODY_PROGRESS_PHOTO_KEY_UNAVAILABLE',
      'Progress photo media is unavailable',
    );
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) {
    throw new ProgressPhotoMediaError(
      'BODY_PROGRESS_PHOTO_KEY_UNAVAILABLE',
      'Progress photo media is unavailable',
    );
  }
  return key;
};

export const assertProgressPhotoMediaKey = () => {
  parseMediaKey().fill(0);
};

const buildAad = (input: {
  userId: string;
  photoId: string;
  view: BodyProgressPhotoView;
  variant: BodyProgressPhotoVariant;
  storageKey: string;
  mediaType: string;
  byteSize: number;
  width: number;
  height: number;
  checksum: string;
}) =>
  Buffer.from(
    [
      BODY_PROGRESS_PHOTO_ENCRYPTION_VERSION,
      input.userId,
      input.photoId,
      input.view,
      input.variant,
      input.storageKey,
      input.mediaType,
      String(input.byteSize),
      String(input.width),
      String(input.height),
      input.checksum,
    ].join('\u001f'),
    'utf8',
  );

const ensurePrivateRoot = async () => {
  const configured = getProgressPhotoMediaRoot();
  await mkdir(configured, { recursive: true, mode: PRIVATE_DIR_MODE });
  await chmod(configured, PRIVATE_DIR_MODE);
  const root = await realpath(configured);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new ProgressPhotoMediaError(
      'BODY_PROGRESS_PHOTO_STORAGE_UNAVAILABLE',
      'Progress photo storage is unavailable',
    );
  }
  return root;
};

const resolveStoragePath = (root: string, storageKey: string) => {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) {
    throw new ProgressPhotoMediaError(
      'BODY_PROGRESS_PHOTO_STORAGE_UNAVAILABLE',
      'Progress photo storage is unavailable',
    );
  }
  const path = resolve(root, storageKey);
  if (!path.startsWith(`${root}${sep}`)) {
    throw new ProgressPhotoMediaError(
      'BODY_PROGRESS_PHOTO_STORAGE_UNAVAILABLE',
      'Progress photo storage is unavailable',
    );
  }
  return path;
};

const sha256File = async (path: string) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
};

const encryptFile = async (input: { sourcePath: string; destinationPath: string; aad: Buffer }) => {
  const key = parseMediaKey();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
  key.fill(0);
  cipher.setAAD(input.aad);
  const source = createReadStream(input.sourcePath);
  async function* encryptedChunks() {
    yield FORMAT_MAGIC;
    yield nonce;
    for await (const chunk of source) {
      const encrypted = cipher.update(chunk as Buffer);
      if (encrypted.length) yield encrypted;
    }
    const final = cipher.final();
    if (final.length) yield final;
    yield cipher.getAuthTag();
  }
  await pipeline(
    Readable.from(encryptedChunks()),
    createWriteStream(input.destinationPath, { flags: 'wx', mode: PRIVATE_FILE_MODE }),
  );
  const contents = await readFile(input.destinationPath);
  return {
    nonce: nonce.toString('base64'),
    authTag: contents.subarray(contents.length - TAG_BYTES).toString('base64'),
  };
};

export const decryptVariantToTemporaryFile = async (input: {
  userId: string;
  photoId: string;
  view: BodyProgressPhotoView;
  variant: StoredPhotoVariant;
}) => {
  const root = await ensurePrivateRoot();
  const sourcePath = resolveStoragePath(root, input.variant.storageKey);
  const sourceStat = await stat(sourcePath).catch(() => null);
  if (!sourceStat?.isFile() || sourceStat.size <= HEADER_BYTES + TAG_BYTES) {
    throw new ProgressPhotoMediaError(
      'BODY_PROGRESS_PHOTO_INTEGRITY_FAILURE',
      'Progress photo content could not be verified',
    );
  }
  const handle = await open(sourcePath, 'r');
  let header: Buffer;
  let tag: Buffer;
  try {
    header = Buffer.alloc(HEADER_BYTES);
    tag = Buffer.alloc(TAG_BYTES);
    await handle.read(header, 0, HEADER_BYTES, 0);
    await handle.read(tag, 0, TAG_BYTES, sourceStat.size - TAG_BYTES);
  } finally {
    await handle.close();
  }
  const nonce = header.subarray(FORMAT_MAGIC.length);
  if (
    !header.subarray(0, FORMAT_MAGIC.length).equals(FORMAT_MAGIC) ||
    nonce.toString('base64') !== input.variant.nonce ||
    tag.toString('base64') !== input.variant.authTag
  ) {
    throw new ProgressPhotoMediaError(
      'BODY_PROGRESS_PHOTO_INTEGRITY_FAILURE',
      'Progress photo content could not be verified',
    );
  }
  const tempDirectory = await mkdtemp(join(tmpdir(), 'pulse-photo-read-'));
  await chmod(tempDirectory, PRIVATE_DIR_MODE);
  const outputPath = join(tempDirectory, `${randomUUID()}.jpg`);
  const key = parseMediaKey();
  const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
  key.fill(0);
  decipher.setAAD(
    buildAad({ ...input.variant, userId: input.userId, photoId: input.photoId, view: input.view }),
  );
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(sourcePath, { start: HEADER_BYTES, end: sourceStat.size - TAG_BYTES - 1 }),
      decipher,
      createWriteStream(outputPath, { flags: 'wx', mode: PRIVATE_FILE_MODE }),
    );
    return { path: outputPath, cleanup: () => rm(tempDirectory, { recursive: true, force: true }) };
  } catch {
    await rm(tempDirectory, { recursive: true, force: true });
    throw new ProgressPhotoMediaError(
      'BODY_PROGRESS_PHOTO_INTEGRITY_FAILURE',
      'Progress photo content could not be verified',
    );
  }
};

type DetectedInput = {
  format: 'jpeg' | 'png' | 'webp';
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
};

const detectInput = (header: Buffer): DetectedInput => {
  if (
    header.length >= 12 &&
    header.subarray(4, 8).toString('ascii') === 'ftyp' &&
    /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/u.test(header.subarray(8, 12).toString('ascii'))
  ) {
    throw new ProgressPhotoMediaError(
      'BODY_PROGRESS_PHOTO_HEIC_CLIENT_CONVERSION_REQUIRED',
      'HEIC/HEIF must be converted to JPEG before upload',
    );
  }
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff)
    return { format: 'jpeg', mediaType: 'image/jpeg' };
  if (
    header.length >= 8 &&
    header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return { format: 'png', mediaType: 'image/png' };
  if (
    header.length >= 12 &&
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return { format: 'webp', mediaType: 'image/webp' };
  throw new ProgressPhotoMediaError(
    'BODY_PROGRESS_PHOTO_UNSUPPORTED_FORMAT',
    'Only JPEG, PNG, and WebP images are accepted',
  );
};

const extensionFormats: Record<string, DetectedInput['format']> = {
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.png': 'png',
  '.webp': 'webp',
};

const validateFilenameAndHints = (file: MultipartFile, detected: DetectedInput) => {
  const filename = basename(file.filename);
  const extension = extname(filename).toLowerCase();
  const stem = filename.slice(0, -extension.length);
  if (
    !filename ||
    filename !== file.filename ||
    stem.includes('.') ||
    /[\\/\0]/u.test(file.filename)
  ) {
    throw new ProgressPhotoMediaError('BODY_PROGRESS_PHOTO_INVALID', 'Invalid upload filename');
  }
  if (
    extensionFormats[extension] !== detected.format ||
    file.mimetype.toLowerCase() !== detected.mediaType
  ) {
    throw new ProgressPhotoMediaError(
      'BODY_PROGRESS_PHOTO_SIGNATURE_MISMATCH',
      'File extension, media type, and content do not match',
    );
  }
};

const assertNoEmbeddedPayload = async (path: string) => {
  const bytes = await readFile(path);
  const signatures = [
    Buffer.from('PK\u0003\u0004'),
    Buffer.from('%PDF-'),
    Buffer.from('<svg'),
    Buffer.from('GIF87a'),
    Buffer.from('GIF89a'),
  ];
  if (signatures.some((signature) => bytes.indexOf(signature, 1) >= 0)) {
    throw new ProgressPhotoMediaError(
      'BODY_PROGRESS_PHOTO_INVALID',
      'Embedded or polyglot payloads are not accepted',
    );
  }
};

const writePartToTemp = async (part: MultipartFile, path: string) => {
  await pipeline(part.file, createWriteStream(path, { flags: 'wx', mode: PRIVATE_FILE_MODE }));
  if (part.file.truncated)
    throw new ProgressPhotoMediaError(
      'BODY_PROGRESS_PHOTO_SIZE_LIMIT',
      'Image exceeds the 12 MiB input limit',
    );
  const size = (await stat(path)).size;
  if (size <= 0 || size > BODY_PROGRESS_PHOTO_MAX_INPUT_BYTES) {
    throw new ProgressPhotoMediaError(
      'BODY_PROGRESS_PHOTO_SIZE_LIMIT',
      'Image exceeds the 12 MiB input limit',
    );
  }
  return size;
};

const variantSize = (variant: 'full' | 'comparison' | 'thumbnail') =>
  variant === 'full' ? 4096 : variant === 'comparison' ? 1600 : 480;

export const processAndEncryptPhoto = async (input: {
  part: MultipartFile;
  photoId: string;
  userId: string;
  view: BodyProgressPhotoView;
  beforeAtomicCommit?: (storageKey: string) => void | Promise<void>;
}) => {
  assertProgressPhotoMediaKey();
  const root = await ensurePrivateRoot();
  const tempDirectory = await mkdtemp(join(root, '.processing-'));
  await chmod(tempDirectory, PRIVATE_DIR_MODE);
  const stagedPath = join(tempDirectory, `${randomUUID()}.upload`);
  const committedPaths: string[] = [];
  try {
    await writePartToTemp(input.part, stagedPath);
    const headerHandle = await open(stagedPath, 'r');
    const header = Buffer.alloc(32);
    try {
      await headerHandle.read(header, 0, header.length, 0);
    } finally {
      await headerHandle.close();
    }
    const detected = detectInput(header);
    validateFilenameAndHints(input.part, detected);
    await assertNoEmbeddedPayload(stagedPath);
    let metadata: Metadata;
    try {
      metadata = await sharp(stagedPath, {
        animated: true,
        failOn: 'error',
        limitInputPixels: false,
      }).metadata();
    } catch {
      throw new ProgressPhotoMediaError(
        'BODY_PROGRESS_PHOTO_DECODER_REJECTED',
        'Image decoder rejected the file',
      );
    }
    if (metadata.format !== detected.format || !metadata.width || !metadata.height) {
      throw new ProgressPhotoMediaError(
        'BODY_PROGRESS_PHOTO_DECODER_REJECTED',
        'Image decoder rejected the file',
      );
    }
    if (metadata.pages && metadata.pages !== 1) {
      throw new ProgressPhotoMediaError(
        'BODY_PROGRESS_PHOTO_UNSUPPORTED_FORMAT',
        'Animated images are not accepted',
      );
    }
    if (metadata.width * metadata.height > BODY_PROGRESS_PHOTO_MAX_PIXELS) {
      throw new ProgressPhotoMediaError(
        'BODY_PROGRESS_PHOTO_PIXEL_LIMIT',
        'Image pixel dimensions exceed the safe limit',
      );
    }

    const sanitizedOriginalPath = join(tempDirectory, `original.${detected.format}`);
    let sanitizedOriginalInfo: OutputInfo;
    try {
      const sanitizedOriginal = sharp(stagedPath, {
        animated: false,
        failOn: 'error',
        limitInputPixels: BODY_PROGRESS_PHOTO_MAX_PIXELS,
      }).rotate();
      sanitizedOriginalInfo = await (
        detected.format === 'jpeg'
          ? sanitizedOriginal.jpeg({ quality: 95, progressive: false, mozjpeg: false })
          : detected.format === 'png'
            ? sanitizedOriginal.png({ compressionLevel: 9, progressive: false })
            : sanitizedOriginal.webp({ quality: 95, lossless: true })
      ).toFile(sanitizedOriginalPath);
    } catch {
      throw new ProgressPhotoMediaError(
        'BODY_PROGRESS_PHOTO_PROCESSING_FAILED',
        'Image processing failed',
      );
    }

    const variantInputs: Array<{
      variant: BodyProgressPhotoVariant;
      path: string;
      mediaType: string;
      width: number;
      height: number;
      byteSize: number;
    }> = [
      {
        variant: 'original',
        path: sanitizedOriginalPath,
        mediaType: detected.mediaType,
        width: sanitizedOriginalInfo.width,
        height: sanitizedOriginalInfo.height,
        byteSize: sanitizedOriginalInfo.size,
      },
    ];
    for (const variant of ['full', 'comparison', 'thumbnail'] as const) {
      const path = join(tempDirectory, `${variant}.jpg`);
      let info: OutputInfo;
      try {
        info = await sharp(stagedPath, {
          animated: false,
          failOn: 'error',
          limitInputPixels: BODY_PROGRESS_PHOTO_MAX_PIXELS,
        })
          .rotate()
          .resize({
            width: variantSize(variant),
            height: variantSize(variant),
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: variant === 'thumbnail' ? 78 : 88, progressive: false, mozjpeg: false })
          .toFile(path);
      } catch {
        throw new ProgressPhotoMediaError(
          'BODY_PROGRESS_PHOTO_PROCESSING_FAILED',
          'Image processing failed',
        );
      }
      variantInputs.push({
        variant,
        path,
        mediaType: 'image/jpeg',
        width: info.width,
        height: info.height,
        byteSize: info.size,
      });
    }

    const variants: StoredPhotoVariant[] = [];
    for (const variantInput of variantInputs) {
      const storageKey = `${randomUUID()}.enc`;
      const pendingPath = join(tempDirectory, storageKey);
      const destinationPath = resolveStoragePath(root, storageKey);
      const checksum = await sha256File(variantInput.path);
      const aad = buildAad({
        userId: input.userId,
        photoId: input.photoId,
        view: input.view,
        variant: variantInput.variant,
        storageKey,
        mediaType: variantInput.mediaType,
        byteSize: variantInput.byteSize,
        width: variantInput.width,
        height: variantInput.height,
        checksum,
      });
      const encrypted = await encryptFile({
        sourcePath: variantInput.path,
        destinationPath: pendingPath,
        aad,
      });
      await input.beforeAtomicCommit?.(storageKey);
      await link(pendingPath, destinationPath);
      await rm(pendingPath);
      await chmod(destinationPath, PRIVATE_FILE_MODE);
      committedPaths.push(destinationPath);
      variants.push({
        variant: variantInput.variant,
        storageKey,
        mediaType: variantInput.mediaType,
        byteSize: variantInput.byteSize,
        width: variantInput.width,
        height: variantInput.height,
        checksum,
        nonce: encrypted.nonce,
        authTag: encrypted.authTag,
      });
    }
    const normalized = variants.find((variant) => variant.variant === 'full');
    if (!normalized)
      throw new ProgressPhotoMediaError(
        'BODY_PROGRESS_PHOTO_PROCESSING_FAILED',
        'Image processing failed',
      );
    return {
      variants,
      normalized,
      cleanupCommitted: async () =>
        Promise.all(committedPaths.map((path) => rm(path, { force: true }))).then(() => undefined),
    };
  } catch (error) {
    await Promise.all(committedPaths.map((path) => rm(path, { force: true })));
    if (error instanceof ProgressPhotoMediaError) throw error;
    throw new ProgressPhotoMediaError(
      'BODY_PROGRESS_PHOTO_STORAGE_UNAVAILABLE',
      'Progress photo storage is unavailable',
    );
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
};

export const deleteStoredVariants = async (variants: StoredPhotoVariant[]) => {
  const staged = await stageStoredVariantsForDeletion(variants);
  await staged.commit();
  return { deleted: staged.staged, missing: staged.missing };
};

export const stageStoredVariantsForDeletion = async (variants: StoredPhotoVariant[]) => {
  if (variants.length === 0) {
    return {
      staged: 0,
      missing: 0,
      commit: async () => undefined,
      rollback: async () => undefined,
    };
  }
  const root = await ensurePrivateRoot();
  let missing = 0;
  const staged: Array<{ source: string; quarantine: string }> = [];
  for (const variant of variants) {
    const path = resolveStoragePath(root, variant.storageKey);
    const quarantine = join(root, `.delete-${randomUUID()}`);
    try {
      await rename(path, quarantine);
      staged.push({ source: path, quarantine });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
        missing += 1;
      else {
        await Promise.all(
          staged.map((item) => rename(item.quarantine, item.source).catch(() => undefined)),
        );
        throw new ProgressPhotoMediaError(
          'BODY_PROGRESS_PHOTO_STORAGE_UNAVAILABLE',
          'Progress photo storage is unavailable',
        );
      }
    }
  }
  return {
    staged: staged.length,
    missing,
    commit: async () => {
      await Promise.all(staged.map((item) => rm(item.quarantine, { force: true })));
    },
    rollback: async () => {
      await Promise.all(staged.map((item) => rename(item.quarantine, item.source)));
    },
  };
};

export const listEncryptedStorageKeys = async () => {
  const root = await ensurePrivateRoot();
  const { readdir } = await import('node:fs/promises');
  return (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && STORAGE_KEY_PATTERN.test(entry.name))
    .map((entry) => entry.name);
};

export const storedVariantExists = async (storageKey: string) => {
  const root = await ensurePrivateRoot();
  try {
    const result = await stat(resolveStoragePath(root, storageKey));
    return result.isFile();
  } catch (error) {
    if (error instanceof ProgressPhotoMediaError) throw error;
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
      return false;
    throw new ProgressPhotoMediaError(
      'BODY_PROGRESS_PHOTO_STORAGE_UNAVAILABLE',
      'Progress photo storage is unavailable',
    );
  }
};
