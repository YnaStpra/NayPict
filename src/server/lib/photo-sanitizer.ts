// This module provides deep image sanitization, anti-polyglot inspection, and executable payload detection for photo uploads.

import BizError from '@/server/error/biz-error';

// Signatures of known dangerous script tags and webshell payloads commonly injected into polyglot images
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

// Scan binary buffer for malicious polyglot payloads and embedded executable scripts.
export function scanPhotoBufferForPolyglot(buffer: Buffer, fileName: string = 'upload'): void {
  if (!buffer || buffer.length === 0) {
    throw new BizError('photo.emptyFile');
  }

  // Reject SVG files outright for photo galleries to prevent stored XSS via XML/SVG DOM scripting
  if (
    buffer.slice(0, 100).toString('ascii').toLowerCase().includes('<svg') ||
    fileName.toLowerCase().endsWith('.svg')
  ) {
    console.warn(`[SECURITY ALERT] SVG image upload rejected for potential XSS vector: ${fileName}`);
    throw new BizError('photo.invalidFileType');
  }

  // Scan for suspicious binary patterns across the entire buffer
  for (const pattern of SUSPICIOUS_BINARY_PATTERNS) {
    const foundIndex = buffer.indexOf(pattern);
    if (foundIndex !== -1) {
      console.warn(
        `[SECURITY ALERT] Malicious polyglot payload signature detected in ${fileName} at byte offset ${foundIndex}: ${pattern.toString('ascii')}`
      );
      throw new BizError('photo.maliciousFileDetected');
    }
  }
}

// Sanitize filename to prevent directory traversal and null byte injections.
export function sanitizeFileName(name: string): string {
  if (!name) return 'photo.jpg';

  // Strip path traversal characters, control characters, and null bytes
  return name
    .replace(/[\0\r\n\t]/g, '')
    .replace(/^.*[\\\/]/, '')
    .replace(/[^a-zA-Z0-9._\- ()]/g, '_')
    .slice(0, 255);
}
