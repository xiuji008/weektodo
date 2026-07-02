/**
 * S3 sync helper — collects ONLY business data (IndexedDB todo lists,
 * repeating events) and syncs to/from S3-compatible storage.
 *
 * Config data (LocalStorage) is NOT synced — it stays local per device.
 * This avoids resetting UI preferences when restoring from cloud.
 */
import dbRepository from "../repositories/dbRepository";
import s3Client from "./s3Client";
import s3ConfigRepository from "../repositories/s3ConfigRepository";
import customToDoListIdsRepository from "../repositories/customToDoListIdsRepository";
import weeklySummaryRepository from "../repositories/weeklySummaryRepository";
import moodRepository from "../repositories/moodRepository";

const SYNC_VERSION = 1;

/**
 * Read all records from an IndexedDB object store as a plain object.
 */
function selectAllAsObject(db, table) {
  return new Promise((resolve, reject) => {
    const result = {};
    const request = dbRepository.selectAll(db, table);
    request.onsuccess = function () {
      const cursor = request.result;
      if (cursor) {
        result[cursor.key] = cursor.value;
        cursor.continue();
      } else {
        resolve(result);
      }
    };
    request.onerror = function () {
      reject(request.error);
    };
  });
}

/**
 * Open the database and return the db handle.
 */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = dbRepository.open();
    req.onsuccess = function (event) {
      resolve(event.target.result);
    };
    req.onerror = function () {
      reject(req.error);
    };
  });
}

/**
 * Clear a store and bulk-import records from a plain object.
 */
function importStoreRecords(db, table, data) {
  return new Promise((resolve, reject) => {
    const clearReq = dbRepository.clear(db, table);
    clearReq.onsuccess = function () {
      const keys = Object.keys(data);
      if (keys.length === 0) {
        resolve();
        return;
      }
      let completed = 0;
      let lastReq;
      keys.forEach((key) => {
        lastReq = dbRepository.add(db, table, key, data[key]);
        lastReq.onsuccess = function () {
          completed++;
          if (completed === keys.length) resolve();
        };
        lastReq.onerror = function () {
          reject(lastReq.error);
        };
      });
    };
    clearReq.onerror = function () {
      reject(clearReq.error);
    };
  });
}

export default {
  /**
   * Collect ONLY business data (IndexedDB stores) into a JSON object.
   * LocalStorage config is intentionally excluded.
   */
  async collectBusinessData() {
    const data = {
      _syncVersion: SYNC_VERSION,
      _type: "weektodo-business-sync",
      _createdAt: new Date().toISOString(),
      todoLists: {},
      repeating_events: {},
      repeating_events_by_date: {},
      customTodoListIds: [],
      weeklySummaries: {},
      moods: {},
    };

    const db = await openDb();
    data.todoLists = await selectAllAsObject(db, "todo_lists");
    data.repeating_events = await selectAllAsObject(db, "repeating_events");
    data.repeating_events_by_date = await selectAllAsObject(
      db,
      "repeating_events_by_date"
    );
    db.close();

    // 收集自定义列表元数据（存储在 localStorage 中）
    data.customTodoListIds = customToDoListIdsRepository.load();

    // 收集周总结数据（存储在 localStorage 中）
    data.weeklySummaries = weeklySummaryRepository.loadAll();

    // 收集每日心情数据（存储在 localStorage 中）
    data.moods = moodRepository.loadAll();

    return data;
  },

  /**
   * Upload business data to S3-compatible storage.
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async syncToS3() {
    if (!s3ConfigRepository.isConfigured()) {
      return { ok: false, error: "S3_NOT_CONFIGURED" };
    }

    try {
      const data = await this.collectBusinessData();
      const config = s3ConfigRepository.load();
      const result = await s3Client.putObject(config, data);

      if (result.ok) {
        s3ConfigRepository.update({ lastSyncAt: new Date().toISOString() });
        return { ok: true };
      }
      return { ok: false, error: result.error || `HTTP ${result.status}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  /**
   * Download business data from S3 and restore it into IndexedDB.
   * Does NOT touch LocalStorage config — UI settings stay local.
   * @returns {Promise<{ok: boolean, error?: string, reloaded?: boolean}>}
   */
  async restoreFromS3() {
    if (!s3ConfigRepository.isConfigured()) {
      return { ok: false, error: "S3_NOT_CONFIGURED" };
    }

    try {
      const config = s3ConfigRepository.load();
      const result = await s3Client.getObject(config);

      if (!result.ok) {
        return { ok: false, error: result.error || `HTTP ${result.status}` };
      }

      const data = JSON.parse(result.data);

      // Support both new business-only format and old full-backup format
      const hasBusinessData =
        data.todoLists || data.repeating_events || data.repeating_events_by_date;
      if (!hasBusinessData) {
        return { ok: false, error: "INVALID_BACKUP_FORMAT" };
      }

      // Only restore IndexedDB stores — config stays local
      const db = await openDb();
      if (data.todoLists) {
        await importStoreRecords(db, "todo_lists", data.todoLists);
      }
      if (data.repeating_events) {
        await importStoreRecords(db, "repeating_events", data.repeating_events);
      }
      if (data.repeating_events_by_date) {
        await importStoreRecords(
          db,
          "repeating_events_by_date",
          data.repeating_events_by_date
        );
      }
      db.close();

      // 恢复自定义列表元数据（存储在 localStorage 中）
      if (data.customTodoListIds && data.customTodoListIds.length > 0) {
        customToDoListIdsRepository.update(data.customTodoListIds);
      }

      // 恢复周总结数据（存储在 localStorage 中）
      if (data.weeklySummaries) {
        weeklySummaryRepository.restoreAll(data.weeklySummaries);
      }

      // 恢复每日心情数据（存储在 localStorage 中）
      if (data.moods) {
        moodRepository.restoreAll(data.moods);
      }

      return { ok: true, reloaded: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  /**
   * Test S3 connection.
   */
  async testConnection() {
    if (!s3ConfigRepository.isConfigured()) {
      return { ok: false, error: "S3_NOT_CONFIGURED" };
    }
    return s3Client.testConnection(s3ConfigRepository.load());
  },

  /**
   * Auto-sync: pull from cloud on app start (if enabled & configured).
   * Silently fails — errors are logged but not shown to user.
   * @returns {Promise<boolean>} true if data was restored
   */
  async autoSyncOnStart() {
    const config = s3ConfigRepository.load();
    if (!config.autoSync || !s3ConfigRepository.isConfigured()) {
      return false;
    }
    const result = await this.restoreFromS3();
    return result.ok;
  },

  /**
   * Auto-sync: push to cloud after data changes (debounced by caller).
   * Silently fails.
   */
  async autoSyncPush() {
    const config = s3ConfigRepository.load();
    if (!config.autoSync || !s3ConfigRepository.isConfigured()) {
      return false;
    }
    const result = await this.syncToS3();
    return result.ok;
  },
};
