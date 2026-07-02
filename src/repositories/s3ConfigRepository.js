/**
 * S3 sync configuration repository.
 * Stores S3-compatible storage connection settings in localStorage.
 * NOTE: Secret keys are stored in localStorage — this matches the app's
 * existing privacy model (all data stays on the user's device).
 */

const S3_CONFIG_KEY = "s3SyncConfig";

export default {
  load() {
    try {
      const raw = localStorage.getItem(S3_CONFIG_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error("Failed to load S3 config:", e);
    }
    return {
      endpoint: "",
      region: "us-east-1",
      bucket: "",
      objectKey: "weektodobackup.wtdb",
      accessKeyId: "",
      secretAccessKey: "",
      autoSync: false,
      lastSyncAt: null,
    };
  },

  save(config) {
    localStorage.setItem(S3_CONFIG_KEY, JSON.stringify(config));
  },

  update(partial) {
    const current = this.load();
    const updated = { ...current, ...partial };
    this.save(updated);
    return updated;
  },

  clear() {
    localStorage.removeItem(S3_CONFIG_KEY);
  },

  isConfigured() {
    const c = this.load();
    return !!(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);
  },
};
