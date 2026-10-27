import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface CardStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export interface NeonStorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function createNeonStorage(cfg: NeonStorageConfig): CardStorage {
  const s3 = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: true, // exigé par Neon Object Storage
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return {
    async put(key, body, contentType) {
      await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType }));
    },
    signedUrl(key, expiresInSeconds) {
      return getSignedUrl(s3, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), { expiresIn: expiresInSeconds });
    },
    async delete(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    },
    async list(prefix) {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const page = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, ContinuationToken: token }));
        for (const o of page.Contents ?? []) if (o.Key) keys.push(o.Key);
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },
  };
}

const STORAGE_VARS = {
  endpoint: "NEON_STORAGE_ENDPOINT",
  region: "NEON_STORAGE_REGION",
  accessKeyId: "NEON_STORAGE_ACCESS_KEY_ID",
  secretAccessKey: "NEON_STORAGE_SECRET_ACCESS_KEY",
  bucket: "NEON_STORAGE_BUCKET",
} as const;

export function storageConfigFromEnv(env: Record<string, string | undefined> = process.env): NeonStorageConfig {
  const read = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`${name} manquant`);
    return value;
  };
  return {
    endpoint: read(STORAGE_VARS.endpoint),
    region: read(STORAGE_VARS.region),
    accessKeyId: read(STORAGE_VARS.accessKeyId),
    secretAccessKey: read(STORAGE_VARS.secretAccessKey),
    bucket: read(STORAGE_VARS.bucket),
  };
}

let cached: CardStorage | undefined;

export function getCardStorage(): CardStorage {
  cached ??= createNeonStorage(storageConfigFromEnv());
  return cached;
}

export function createMemoryStorage(): CardStorage & { objects: Map<string, { body: Uint8Array; contentType: string }> } {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    objects,
    async put(key, body, contentType) {
      objects.set(key, { body, contentType });
    },
    async signedUrl(key, expiresInSeconds) {
      return `memory://${key}?expires=${expiresInSeconds}`;
    },
    async delete(key) {
      objects.delete(key);
    },
    async list(prefix) {
      return [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
}
