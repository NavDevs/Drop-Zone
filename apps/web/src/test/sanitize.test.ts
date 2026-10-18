import { describe, it, expect } from 'vitest';
import {
  sanitizeFileName,
  isDangerousExtension,
  deduplicateFileName,
} from '../lib/transfer/sanitize.js';

describe('sanitizeFileName', () => {
  it('strips forward and backslashes', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('etc_passwd');
    expect(sanitizeFileName('folder\\sub\\file.txt')).toBe('folder_sub_file.txt');
  });

  it('collapses multiple dots and directory traversal', () => {
    expect(sanitizeFileName('..test..file...txt')).toBe('test.file.txt');
  });

  it('strips non-printable ASCII control characters', () => {
    expect(sanitizeFileName('bad\x00\x08\x1Fname.pdf')).toBe('badname.pdf');
  });

  it('neutralizes Windows reserved device names', () => {
    expect(sanitizeFileName('CON.txt')).toBe('_CON.txt');
    expect(sanitizeFileName('prn.pdf')).toBe('_prn.pdf');
    expect(sanitizeFileName('aux')).toBe('_aux');
    expect(sanitizeFileName('NUL.tar.gz')).toBe('_NUL.tar.gz');
    expect(sanitizeFileName('com1.exe')).toBe('_com1.exe');
    expect(sanitizeFileName('lpt9.log')).toBe('_lpt9.log');
  });

  it('handles empty or blank names with fallback', () => {
    expect(sanitizeFileName('')).toBe('unnamed_file');
    expect(sanitizeFileName('   ')).toBe('unnamed_file');
    expect(sanitizeFileName('....')).toBe('unnamed_file');
  });

  it('trims excessively long names to 255 bytes while preserving extension', () => {
    const longBase = 'a'.repeat(300);
    const result = sanitizeFileName(`${longBase}.zip`);
    const encoder = new TextEncoder();
    expect(encoder.encode(result).length).toBeLessThanOrEqual(255);
    expect(result.endsWith('.zip')).toBe(true);
  });
});

describe('isDangerousExtension', () => {
  it('identifies executable extensions as dangerous', () => {
    expect(isDangerousExtension('setup.exe')).toBe(true);
    expect(isDangerousExtension('script.bat')).toBe(true);
    expect(isDangerousExtension('RUN.CMD')).toBe(true);
    expect(isDangerousExtension('payload.sh')).toBe(true);
    expect(isDangerousExtension('installer.msi')).toBe(true);
    expect(isDangerousExtension('app.apk')).toBe(true);
    expect(isDangerousExtension('image.dmg')).toBe(true);
  });

  it('identifies safe extensions as not dangerous', () => {
    expect(isDangerousExtension('photo.png')).toBe(false);
    expect(isDangerousExtension('doc.pdf')).toBe(false);
    expect(isDangerousExtension('archive.zip')).toBe(false);
    expect(isDangerousExtension('video.mp4')).toBe(false);
  });
});

describe('deduplicateFileName', () => {
  it('leaves unique names unchanged', () => {
    const existing = new Set(['doc1.pdf']);
    expect(deduplicateFileName('doc2.pdf', existing)).toBe('doc2.pdf');
  });

  it('increments counter when collisions occur', () => {
    const existing = new Set(['notes.txt', 'notes (1).txt']);
    expect(deduplicateFileName('notes.txt', existing)).toBe('notes (2).txt');
  });
});
