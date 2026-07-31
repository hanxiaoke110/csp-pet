import { describe, it, expect } from 'vitest';
import {
  shouldIncludeKey, parseBackup, compareVersions, bytesToBase64, base64ToBytes,
  type BackupFile,
} from './backup';

function makeBackup(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    format: 'csp-pet-backup',
    version: 1,
    appVersion: '1.7.20',
    exportedAt: '2026-07-31T10:00:00.000Z',
    localStorage: { csp_pet_data: '{"coins":100}', dungeon_player: '{}' },
    sqlite: { pet_data: '{"coins":100}' },
    sprites: { 'ws-abc.png': 'AAAA' },
    ...overrides,
  };
}

describe('shouldIncludeKey', () => {
  it('includes csp_ and dungeon_ user data keys', () => {
    expect(shouldIncludeKey('csp_pet_data')).toBe(true);
    expect(shouldIncludeKey('dungeon_progress')).toBe(true);
    expect(shouldIncludeKey('csp_wish_tickets')).toBe(true);
  });

  it('excludes re-downloadable curriculum content', () => {
    expect(shouldIncludeKey('csp_quiz_bank')).toBe(false);
    expect(shouldIncludeKey('csp_quiz_bank_version')).toBe(false);
    expect(shouldIncludeKey('csp_reviewed_quiz_bank_version')).toBe(false);
    expect(shouldIncludeKey('csp_imported_lessons')).toBe(false);
    expect(shouldIncludeKey('csp_data_version')).toBe(false);
  });

  it('excludes unrelated keys', () => {
    expect(shouldIncludeKey('other_key')).toBe(false);
    expect(shouldIncludeKey('tauri')).toBe(false);
  });
});

describe('parseBackup', () => {
  it('accepts a valid backup', () => {
    const result = parseBackup(JSON.stringify(makeBackup()));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.localStorage.csp_pet_data).toBe('{"coins":100}');
      expect(result.data.sprites['ws-abc.png']).toBe('AAAA');
    }
  });

  it('rejects corrupted JSON', () => {
    const result = parseBackup('{not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('损坏');
  });

  it('rejects files that are not CSP backups', () => {
    const result = parseBackup(JSON.stringify({ hello: 'world' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('不是 CSP');
  });

  it('rejects backups from a newer format version', () => {
    const result = parseBackup(JSON.stringify(makeBackup({ version: 99 })));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('更新');
  });

  it('rejects backups missing the localStorage payload', () => {
    const bad = makeBackup();
    (bad as any).localStorage = null;
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
  });
});

describe('compareVersions', () => {
  it('orders semver-ish version strings', () => {
    expect(compareVersions('1.7.21', '1.7.20')).toBeGreaterThan(0);
    expect(compareVersions('1.7.20', '1.7.20')).toBe(0);
    expect(compareVersions('1.7.9', '1.7.20')).toBeLessThan(0);
    expect(compareVersions('1.8.0', '1.7.99')).toBeGreaterThan(0);
  });
});

describe('base64 roundtrip', () => {
  it('round-trips binary data including large payloads', () => {
    const bytes = new Uint8Array(70000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const encoded = bytesToBase64(bytes);
    const decoded = base64ToBytes(encoded);
    expect(decoded.length).toBe(bytes.length);
    expect(decoded[0]).toBe(0);
    expect(decoded[69999]).toBe(69999 % 256);
  });
});
