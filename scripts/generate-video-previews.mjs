import { neon } from '@neondatabase/serverless';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v7 as uuidv7 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is not defined in environment or .env');
  process.exit(1);
}

const sql = neon(dbUrl);

function buildThumbnailVideoKey(checksum, photoId) {
  return `previews/video/${checksum.slice(0, 2)}/${checksum.slice(2, 4)}/${photoId}.mp4`;
}

async function main() {
  console.log('🚀 Starting 360p Video Thumbnail Generation for NayPict...');

  // 1. Fetch R2 storage configuration for videos
  const storages = await sql`
    SELECT storage_id, name, endpoint, bucket, access_key, secret_key, region
    FROM storage
    ORDER BY CASE WHEN name ILIKE '%video%' THEN 0 ELSE 1 END, sort ASC
  `;

  if (!storages || storages.length === 0) {
    console.error('Video storage configuration not found in database.');
    process.exit(1);
  }

  const videoStorage = storages[0];
  console.log(`📦 Target Storage: ${videoStorage.name} (bucket: ${videoStorage.bucket})`);

  const s3Client = new S3Client({
    region: videoStorage.region || 'auto',
    endpoint: videoStorage.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: videoStorage.access_key,
      secretAccessKey: videoStorage.secret_key,
    },
  });

  // 2. Query all active videos that lack a 360p preview (type = 4)
  const pendingVideos = await sql`
    SELECT p.photo_id, p.name, p.checksum, p.size, f.key as original_key
    FROM photo p
    JOIN file f ON p.photo_id = f.photo_id AND f.type = 1
    WHERE p.type LIKE 'video/%'
      AND p.status = 1
      AND NOT EXISTS (
        SELECT 1 FROM file f2 WHERE f2.photo_id = p.photo_id AND f2.type = 4
      )
    ORDER BY p.create_time DESC;
  `;

  const total = pendingVideos.length;
  console.log(`📹 Found ${total} videos requiring 360p thumbnail generation.\n`);

  if (total === 0) {
    console.log('✅ All videos already have 360p thumbnails! Nothing to do.');
    process.exit(0);
  }

  const tmpDir = path.resolve('/tmp/naypict_transcode');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  let completed = 0;
  let failed = 0;
  let totalOrigBytes = 0;
  let totalNewBytes = 0;
  const overallStart = Date.now();

  const CONCURRENCY = 3;

  async function processVideo(video, idx) {
    const itemNum = idx + 1;
    const { photo_id: photoId, name, checksum, size: origSize, original_key: originalKey } = video;
    const targetKey = buildThumbnailVideoKey(checksum, photoId);
    const thumbTmp = path.join(tmpDir, `thumb_${photoId}.mp4`);

    try {
      const t0 = Date.now();
      const gatewayUrl = `https://naypict-media-gateway.naypict.workers.dev/${originalKey}`;

      // Transcode directly from stream: 360p, max 12 seconds, muted, veryfast, crf 28, faststart
      const ffmpegCmd = `ffmpeg -y -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 2 -i "${gatewayUrl}" -t 12 -vf "scale=-2:360" -c:v libx264 -preset veryfast -crf 28 -an -movflags +faststart "${thumbTmp}" 2>/dev/null`;
      await execAsync(ffmpegCmd);

      if (!fs.existsSync(thumbTmp)) {
        throw new Error('FFmpeg failed to produce 360p output file');
      }

      const compressedStat = fs.statSync(thumbTmp);
      const compressedBuffer = fs.readFileSync(thumbTmp);

      if (compressedStat.size === 0) {
        throw new Error('FFmpeg produced 0-byte output file');
      }

      // Upload to Cloudflare R2
      await s3Client.send(
        new PutObjectCommand({
          Bucket: videoStorage.bucket,
          Key: targetKey,
          Body: compressedBuffer,
          ContentType: 'video/mp4',
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );

      // Register file record in database
      const newFileId = uuidv7();
      await sql`
        INSERT INTO file (file_id, photo_id, key, type, file_type, size)
        VALUES (${newFileId}, ${photoId}, ${targetKey}, 4, 'video/mp4', ${compressedStat.size})
        ON CONFLICT (key) DO UPDATE SET size = ${compressedStat.size}
      `;

      completed++;
      totalOrigBytes += origSize || 0;
      totalNewBytes += compressedStat.size;

      const dur = ((Date.now() - t0) / 1000).toFixed(1);
      const origMb = ((origSize || 0) / 1024 / 1024).toFixed(1);
      const newKb = (compressedStat.size / 1024).toFixed(0);
      const pct = origSize ? Math.round((1 - compressedStat.size / origSize) * 100) : 0;
      const overallProgress = ((completed / total) * 100).toFixed(1);

      console.log(`[${completed}/${total}] (${overallProgress}%) ${name}: ${origMb}MB -> ${newKb}KB (-${pct}%) in ${dur}s`);
    } catch (err) {
      failed++;
      console.error(`❌ [${itemNum}/${total}] Failed ${name}:`, err.message || err);
    } finally {
      try {
        if (fs.existsSync(thumbTmp)) fs.unlinkSync(thumbTmp);
      } catch {}
    }
  }

  // Work pool with concurrency
  const queue = [...pendingVideos];
  const workers = [];

  for (let w = 0; w < CONCURRENCY; w++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const video = queue.shift();
          if (!video) break;
          const idx = total - queue.length - 1;
          await processVideo(video, idx);
        }
      })()
    );
  }

  await Promise.all(workers);

  const totalTime = ((Date.now() - overallStart) / 1000).toFixed(1);
  const totalSavedMb = ((totalOrigBytes - totalNewBytes) / 1024 / 1024).toFixed(1);

  console.log('\n=========================================');
  console.log(`🎉 Transcoding Completed in ${totalTime}s`);
  console.log(`✅ Success: ${completed} videos`);
  if (failed > 0) console.log(`⚠️  Failed: ${failed} videos`);
  console.log(`💾 Bandwidth/Storage Reduction: -${totalSavedMb} MB`);
  console.log('=========================================\n');
}

main().catch((err) => {
  console.error('Fatal error during video preview generation:', err);
  process.exit(1);
});
