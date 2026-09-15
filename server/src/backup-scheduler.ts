import {
  getUserIdsWithWorkspaces,
  getWorkspaceSnapshot,
  getBackupConfig,
  listBackups,
  saveBackup,
} from './redis.js';
import { BackupRecord, BackupFrequency } from './types.js';

export const INTERVAL_DURATIONS_MS: Record<Exclude<BackupFrequency, 'disabled'>, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export class BackupScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private checkIntervalMs: number;

  constructor(checkIntervalMs: number = 60 * 1000) {
    this.checkIntervalMs = checkIntervalMs;
  }

  public start(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(() => {
      this.runPeriodicCheck().catch((err) => {
        console.error('[BackupScheduler Check Error]', err);
      });
    }, this.checkIntervalMs);

    // Unref timer so it doesn't block Node process exit if needed
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async runPeriodicCheck(): Promise<number> {
    if (this.isRunning) return 0;
    this.isRunning = true;
    let backupsCreated = 0;

    try {
      const userIds = await getUserIdsWithWorkspaces();

      for (const userId of userIds) {
        const snapshot = await getWorkspaceSnapshot(userId);
        if (!snapshot || !snapshot.workspaces || snapshot.workspaces.length === 0) {
          continue;
        }

        const backupConfig = await getBackupConfig(userId);
        if (backupConfig.interval === 'disabled') {
          continue;
        }

        const requiredMs = INTERVAL_DURATIONS_MS[backupConfig.interval];
        if (!requiredMs) {
          continue;
        }

        const pastBackups = await listBackups(userId);
        const lastBackupTime = pastBackups.length > 0 ? pastBackups[0].timestamp : 0;
        const elapsed = Date.now() - lastBackupTime;

        if (elapsed >= requiredMs) {
          const backupId = `bk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const totalTabs = snapshot.workspaces.reduce(
            (acc, ws) => acc + (ws.tabs ? ws.tabs.length : 0),
            0
          );

          const record: BackupRecord = {
            id: backupId,
            timestamp: Date.now(),
            reason: 'scheduled',
            workspaces_count: snapshot.workspaces.length,
            tabs_count: totalTabs,
            client_id: snapshot.client_id,
            snapshot,
          };

          await saveBackup(userId, record, backupConfig.retentionCopies);
          backupsCreated++;
          console.log(`[BackupScheduler] Created scheduled backup ${backupId} for user ${userId}`);
        }
      }
    } catch (err: any) {
      console.error('[BackupScheduler Execution Error]', err.message);
    } finally {
      this.isRunning = false;
    }

    return backupsCreated;
  }
}
