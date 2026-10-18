import { DANGEROUS_EXTENSIONS } from '@dropzone/protocol';

/** Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9). */
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

/**
 * Sanitize an incoming file name per TRD §13 & FR-44:
 * - strip path traversal (../ and ..\)
 * - strip path separators (/ and \)
 * - collapse directory traversal (..)
 * - strip control characters
 * - trim to 255 bytes (UTF-8)
 * - neutralize Windows reserved device names
 * - fallback to 'unnamed_file' if result is empty
 */
export function sanitizeFileName(raw: string): string {
  if (!raw || typeof raw !== 'string') return 'unnamed_file';

  // Strip path traversal sequences first
  let clean = raw.replace(/\.{2,}[/\\]/g, '');

  // Strip path separators and replace with underscores
  clean = clean.replace(/[/\\]+/g, '_');

  // Collapse directory traversal dots
  clean = clean.replace(/\.{2,}/g, '.');

  // Strip non-printable / control characters (ASCII 0-31 and 127)
  clean = Array.from(clean)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');

  // Strip leading/trailing spaces, underscores, and dots
  clean = clean.trim().replace(/^[_.\s]+|[_.\s]+$/g, '');

  if (clean.length === 0) clean = 'unnamed_file';

  // Check for Windows reserved names
  if (WINDOWS_RESERVED.test(clean)) {
    clean = `_${clean}`;
  }

  // Trim to 255 bytes UTF-8 while preserving extension
  const encoder = new TextEncoder();
  if (encoder.encode(clean).length > 255) {
    const extIndex = clean.lastIndexOf('.');
    const ext = extIndex > 0 ? clean.slice(extIndex) : '';
    const base = extIndex > 0 ? clean.slice(0, extIndex) : clean;

    let trimmedBase = base;
    while (encoder.encode(trimmedBase + ext).length > 255 && trimmedBase.length > 0) {
      trimmedBase = trimmedBase.slice(0, -1);
    }
    clean = (trimmedBase || 'file') + ext;
  }

  return clean || 'unnamed_file';
}

/** Check if the file extension is a potentially dangerous executable (TRD §13). */
export function isDangerousExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return DANGEROUS_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Deduplicate file name against existing names by adding (1), (2), etc. */
export function deduplicateFileName(name: string, existingNames: Set<string>): string {
  if (!existingNames.has(name)) return name;

  const extIndex = name.lastIndexOf('.');
  const base = extIndex > 0 ? name.slice(0, extIndex) : name;
  const ext = extIndex > 0 ? name.slice(extIndex) : '';

  let counter = 1;
  let candidate = `${base} (${counter})${ext}`;
  while (existingNames.has(candidate)) {
    counter++;
    candidate = `${base} (${counter})${ext}`;
  }
  return candidate;
}
