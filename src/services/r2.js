import { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function isR2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID
    && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY
    && process.env.R2_BUCKET,
  );
}

function getR2Client() {
  const accountId = requiredEnv('R2_ACCOUNT_ID');
  const accessKeyId = requiredEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requiredEnv('R2_SECRET_ACCESS_KEY');

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export function getR2Bucket() {
  return requiredEnv('R2_BUCKET');
}

export async function uploadFileToR2({ key, filePath, contentType, cacheControl }) {
  const client = getR2Client();
  const Bucket = getR2Bucket();

  const body = fs.createReadStream(filePath);

  // Managed multipart upload when needed (large files)
  const uploader = new Upload({
    client,
    params: {
      Bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
      CacheControl: cacheControl,
    },
  });

  await uploader.done();
  return { bucket: Bucket, key };
}

export async function copyObjectInR2({ sourceKey, destKey, contentType, cacheControl }) {
  const client = getR2Client();
  const Bucket = getR2Bucket();

  await client.send(new CopyObjectCommand({
    Bucket,
    Key: destKey,
    CopySource: `${Bucket}/${encodeURIComponent(sourceKey)}`,
    MetadataDirective: 'REPLACE',
    ContentType: contentType || 'application/octet-stream',
    CacheControl: cacheControl,
  }));

  return { bucket: Bucket, key: destKey };
}

export async function deleteObjectFromR2({ key }) {
  const client = getR2Client();
  const Bucket = getR2Bucket();
  await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
}

export async function getSignedDownloadUrl({ key, filename, expiresInSeconds }) {
  const client = getR2Client();
  const Bucket = getR2Bucket();

  const ttl = Number(expiresInSeconds ?? process.env.R2_SIGNED_URL_TTL_SECONDS ?? 3600);

  const cmd = new GetObjectCommand({
    Bucket,
    Key: key,
    ResponseContentDisposition: filename ? `attachment; filename="${filename}"` : undefined,
  });

  return await getSignedUrl(client, cmd, { expiresIn: ttl });
}

