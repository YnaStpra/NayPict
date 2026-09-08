import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, type PutObjectCommandInput, S3Client } from '@aws-sdk/client-s3';
import { type ReadBody, type StorageObject, type StorageStrategy, type StorageUploadObject } from '@/server/storage/storage-types';
import { registerStorageStrategy } from '@/server/storage/storage-registry';
import { type Storage } from '@/server/entity/storage';
import { StorageTypeEnum } from '@/server/enums/storage-enum';
import BizError from '@/server/error/biz-error';
import { formatHttpUrl } from '@/lib/url';

// This module implements S3 storage strategy.

const s3ClientCache = new Map<string, S3Client>();
const corsConfiguredBuckets = new Set<string>();

// Ensure bucket has open CORS headers for direct browser PUT uploads
async function ensureBucketCors(client: S3Client, bucket: string): Promise<void> {
  if (corsConfiguredBuckets.has(bucket)) return;
  corsConfiguredBuckets.add(bucket);

  try {
    const { PutBucketCorsCommand } = await import('@aws-sdk/client-s3');
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ['*'],
              AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
              AllowedOrigins: ['*'],
              ExposeHeaders: ['ETag', 'Content-Range', 'Accept-Ranges', 'x-amz-request-id'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      })
    );
  } catch (err) {
    console.warn(`[S3] Note: Could not auto-apply CORS to bucket ${bucket}:`, err);
  }
}

class S3StorageStrategy implements StorageStrategy {

  // Created or retrieve cached S3 client based on storage configuration with HTTP/2 keep-alive.
  private createClient(storage: Storage): S3Client {
    const region = storage.region?.trim() || 'auto';
    const endpoint = formatHttpUrl(storage.endpoint);
    const accessKeyId = storage.accessKey?.trim();
    const secretAccessKey = storage.secretKey?.trim();

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new BizError('s3.configIncomplete');
    }

    const cacheKey = `${storage.storageId || 'default'}_${endpoint}_${accessKeyId}`;
    let client = s3ClientCache.get(cacheKey);

    if (!client) {
      client = new S3Client({
        region,
        endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId,
          secretAccessKey
        }
      });
      s3ClientCache.set(cacheKey, client);
    }

    return client;
  }

  // Convert custom metadata items to S3 PutObject parameter.
  private buildPutOptions(metadata: string[][]) {
    const options: Partial<PutObjectCommandInput> = {};

    for (const [name, value] of metadata) {
      if (name === 'Cache-Control') {
        options.CacheControl = value;
        continue;
      }

      if (name === 'Content-Type') {
        options.ContentType = value;
        continue;
      }

      if (name === 'Content-Disposition') {
        options.ContentDisposition = value;
        continue;
      }

      options.Metadata = {
        ...options.Metadata,
        [name]: value,
      };
    }

    return options;
  }

  // Save multiple files to S3.
  async put(files: StorageUploadObject[], storage: Storage): Promise<void> {
    const client = this.createClient(storage);
    const bucket = storage.bucket?.trim();

    if (!bucket) {
      throw new BizError('s3.bucketRequired');
    }

    for (const file of files) {
      const putOptions = file.metadata ? this.buildPutOptions(file.metadata) : {};

      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: file.key,
        Body: file.body,
        ...putOptions,
        ContentType: file.type ?? putOptions.ContentType,
      }));
    }
  }

  // from S3 Read the file and convert it into a response body (supports HTTP Range for video streaming).
  async get(key: string, storage: Storage, range?: string): Promise<StorageObject> {
    const client = this.createClient(storage);
    const bucket = storage.bucket?.trim();

    if (!bucket) {
      throw new BizError('s3.bucketRequired');
    }

    const commandInput: { Bucket: string; Key: string; Range?: string } = {
      Bucket: bucket,
      Key: key,
    };
    if (range) {
      commandInput.Range = range;
    }

    const res = await client.send(new GetObjectCommand(commandInput));

    if (!res.Body) {
      throw new BizError('s3.readFailed');
    }

    return {
      body: res.Body as ReadBody,
      size: res.ContentLength ?? 0,
      type: res.ContentType ?? 'application/octet-stream',
      contentRange: res.ContentRange,
      statusCode: range && res.ContentRange ? 206 : 200,
    };
  }

  // from S3 Delete one or more files.
  async delete(key: string | string[], storage: Storage): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];

    if (!keys.length) {
      return;
    }

    const client = this.createClient(storage);
    const bucket = storage.bucket?.trim();

    if (!bucket) {
      throw new BizError('s3.bucketRequired');
    }

    await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: keys.map((item) => ({
          Key: item
        })),
        Quiet: true
      }
    }));
  }



  // Generate a presigned PutObject URL for direct-to-storage upload (S3 / Cloudflare R2).
  async getPresignedPutUrl(key: string, contentType: string, storage: Storage, expiresIn = 3600): Promise<string> {
    const client = this.createClient(storage);
    const bucket = storage.bucket?.trim();

    if (!bucket) {
      throw new BizError('s3.bucketRequired');
    }

    // Ensure bucket CORS is configured for browser direct PUT uploads
    void ensureBucketCors(client, bucket);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      CacheControl: 'private, no-store',
    });

    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    return getSignedUrl(client, command, { expiresIn });
  }
}

registerStorageStrategy(StorageTypeEnum.S3, () => new S3StorageStrategy());

export { S3StorageStrategy };
