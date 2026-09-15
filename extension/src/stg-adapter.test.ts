import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { importFromStgFormat, exportToStgFormat } from './stg-adapter.js';

describe('STG Adapter Unit Tests', () => {
  it('correctly imports manual STG backup file if present', () => {
    const backupPath = '/home/marco/Downloads/manual-stg-backup-2026-09-15@drive4ik.json';
    if (!existsSync(backupPath)) {
      console.warn('Backup file not found at:', backupPath);
      return;
    }

    const rawJson = JSON.parse(readFileSync(backupPath, 'utf-8'));
    const result = importFromStgFormat(rawJson);

    expect(result.version).toBe('5.3.2');
    expect(result.groupCount).toBe(9);
    expect(result.pinnedCount).toBe(2);
    expect(result.workspaces.length).toBe(9);
    expect(result.pinnedTabs.length).toBe(2);
    expect(result.tabCount).toBeGreaterThan(50);
  });
});
