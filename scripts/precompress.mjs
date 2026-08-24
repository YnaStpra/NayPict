import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

// Compress a single static asset to .gz and .br
async function compressFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.js', '.css', '.svg', '.json', '.html', '.txt'].includes(ext)) {
    return;
  }

  try {
    const content = await fs.promises.readFile(filePath);
    if (content.length < 512) {
      return; // Skip tiny files
    }

    // 1. Generate Gzip pre-compressed asset
    const gz = await gzip(content, { level: 9 });
    await fs.promises.writeFile(`${filePath}.gz`, gz);

    // 2. Generate Brotli (Level 11) pre-compressed asset
    const br = await brotli(content, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
      },
    });
    await fs.promises.writeFile(`${filePath}.br`, br);
  } catch {
    // Ignore individual file compression failures
  }
}

// Recursively traverse directory to pre-compress static assets
async function walkAndCompress(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkAndCompress(fullPath);
    } else if (entry.isFile() && !entry.name.endsWith('.gz') && !entry.name.endsWith('.br')) {
      await compressFile(fullPath);
    }
  }
}

async function run() {
  const staticDir = path.resolve(process.cwd(), '.next/static');
  const publicDir = path.resolve(process.cwd(), 'public');

  await Promise.all([
    walkAndCompress(staticDir),
    walkAndCompress(publicDir),
  ]);
}

run().catch((err) => {
  console.warn('Pre-compression notice:', err.message);
});
