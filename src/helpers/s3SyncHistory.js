/**
 * S3 sync history helper — save, list, restore, and delete historical
 * snapshots of business data to/from S3-compatible storage.
 *
 * Snapshots are stored under the "history/" prefix in the same bucket and
 * use a manifest file (history/manifest.json) to track version metadata.
 */

import dbRepository from "../repositories/dbRepository";
import s3Client from "./s3Client";
import s3ConfigRepository from "../repositories/s3ConfigRepository";
import customToDoListIdsRepository from "../repositories/customToDoListIdsRepository";
import weeklySummaryRepository from "../repositories/weeklySummaryRepository";

const SYNC_VERSION = 1;
const HISTORY_PREFIX = "history/";
const MANIFEST_KEY = "history/manifest.json";

/** Helpers to read all records from an IndexedDB object store. */
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

function getSnapshotKey() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const timestamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${HISTORY_PREFIX}${timestamp}.json`;
}

function getBaseKey(config) {
  // 从 objectKey 提取路径前缀（如 "weektodo/"），用于决定 history 的存储前缀
  const key = config.objectKey || "weektodobackup.wtdb";
  const parts = key.split("/");
  // 取最后一个有效目录作为基本路径，如 "weektodo/"
  if (parts.length > 1) {
    return parts.slice(0, -1).join("/") + "/";
  }
  return "weektodo/";
}

export default {
  /**
   * Collect ALL business data (IndexedDB stores + localStorage metadata)
   * into a single JSON snapshot object.
   */
  async collectBusinessData() {
    const data = {
      _syncVersion: SYNC_VERSION,
      _type: "weektodo-history-snapshot",
      _createdAt: new Date().toISOString(),
      todoLists: {},
      repeating_events: {},
      repeating_events_by_date: {},
      customTodoListIds: [],
      weeklySummaries: {},
    };

    const db = await openDb();
    data.todoLists = await selectAllAsObject(db, "todo_lists");
    data.repeating_events = await selectAllAsObject(db, "repeating_events");
    data.repeating_events_by_date = await selectAllAsObject(
      db,
      "repeating_events_by_date"
    );
    db.close();

    data.customTodoListIds = customToDoListIdsRepository.load();
    data.weeklySummaries = weeklySummaryRepository.loadAll();

    return data;
  },

  /**
   * Save a snapshot of the current business data as a new history version.
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async saveSnapshot() {
    if (!s3ConfigRepository.isConfigured()) {
      return { ok: false, error: "S3_NOT_CONFIGURED" };
    }

    try {
      const config = s3ConfigRepository.load();
      const data = await this.collectBusinessData();
      const snapshotKey = getSnapshotKey(config);

      // 上传快照
      const uploadResult = await s3Client.putObjectWithKey(
        config,
        data,
        snapshotKey
      );
      if (!uploadResult.ok) {
        return {
          ok: false,
          error: uploadResult.error || `HTTP ${uploadResult.status}`,
        };
      }

      // 更新 manifest
      const manifestResult = await this._loadManifest(config);
      let manifest =
        manifestResult.ok && manifestResult.data
          ? manifestResult.data
          : { versions: [] };

      manifest.versions.push({
        key: snapshotKey,
        createdAt: data._createdAt,
        label: new Date().toLocaleString(),
      });

      await s3Client.putObjectWithKey(config, manifest, MANIFEST_KEY);

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  /**
   * List all available history versions.
   * Falls back to listing objects if manifest is missing.
   * @returns {Promise<{ok: boolean, versions?: Array, error?: string}>}
   */
  async listVersions() {
    if (!s3ConfigRepository.isConfigured()) {
      return { ok: false, error: "S3_NOT_CONFIGURED" };
    }

    try {
      const config = s3ConfigRepository.load();

      // 优先读取 manifest
      const manifestResult = await this._loadManifest(config);
      if (manifestResult.ok && manifestResult.data && manifestResult.data.versions && manifestResult.data.versions.length > 0) {
        // 按创建时间降序
        manifestResult.data.versions.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
        return { ok: true, versions: manifestResult.data.versions };
      }

      // 降级：通过 listObjects 枚举 history/ 下的所有版本
      const base = getBaseKey(config);
      const prefix = base + HISTORY_PREFIX;
      const listResult = await s3Client.listObjects(config, prefix);

      if (!listResult.ok) {
        return { ok: false, error: listResult.error };
      }

      const versions = listResult.objects
        .filter((obj) => obj.key.endsWith(".json") && !obj.key.endsWith("manifest.json"))
        .map((obj) => {
          // 从 key 中提取时间戳信息
          const keyName = obj.key.split("/").pop() || "";
          const tsPart = keyName.replace(".json", "");
          let createdAt = obj.lastModified;
          let label = obj.lastModified;
          return { key: obj.key, createdAt, label };
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return { ok: true, versions };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  /**
   * Restore business data from a specific history version.
   * @param {string} key - The S3 object key of the snapshot
   * @returns {Promise<{ok: boolean, error?: string, reloaded?: boolean}>}
   */
  async restoreFromVersion(key) {
    if (!s3ConfigRepository.isConfigured()) {
      return { ok: false, error: "S3_NOT_CONFIGURED" };
    }

    try {
      const config = s3ConfigRepository.load();
      const result = await s3Client.getObjectWithKey(config, key);

      if (!result.ok) {
        return { ok: false, error: result.error || `HTTP ${result.status}` };
      }

      const data = JSON.parse(result.data);

      const hasBusinessData =
        data.todoLists ||
        data.repeating_events ||
        data.repeating_events_by_date;
      if (!hasBusinessData) {
        return { ok: false, error: "INVALID_BACKUP_FORMAT" };
      }

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

      if (data.customTodoListIds && data.customTodoListIds.length > 0) {
        customToDoListIdsRepository.update(data.customTodoListIds);
      }

      if (data.weeklySummaries) {
        weeklySummaryRepository.restoreAll(data.weeklySummaries);
      }

      return { ok: true, reloaded: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  /**
   * Delete a specific history version from S3.
   * @param {string} key - The S3 object key of the snapshot
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async deleteVersion(key) {
    if (!s3ConfigRepository.isConfigured()) {
      return { ok: false, error: "S3_NOT_CONFIGURED" };
    }

    try {
      const config = s3ConfigRepository.load();

      // 删除快照对象
      const deleteResult = await s3Client.deleteObject(config, key);
      if (!deleteResult.ok) {
        return {
          ok: false,
          error: deleteResult.error || `HTTP ${deleteResult.status}`,
        };
      }

      // 更新 manifest（移除该版本）
      const manifestResult = await this._loadManifest(config);
      if (manifestResult.ok && manifestResult.data) {
        const manifest = manifestResult.data;
        manifest.versions = manifest.versions.filter((v) => v.key !== key);
        await s3Client.putObjectWithKey(config, manifest, MANIFEST_KEY);
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  /** Internal: load the manifest file from S3. */
  async _loadManifest(config) {
    try {
      const result = await s3Client.getObjectWithKey(config, MANIFEST_KEY);
      if (result.ok && result.data) {
        return { ok: true, data: JSON.parse(result.data) };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  },
};
