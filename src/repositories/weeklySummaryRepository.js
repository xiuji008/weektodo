const STORAGE_PREFIX = "weeklySummary";

export default {
  getKey(weekLabel) {
    return `${STORAGE_PREFIX}_${weekLabel}`;
  },

  load(weekLabel) {
    const key = this.getKey(weekLabel);
    const data = localStorage.getItem(key);
    if (data) {
      try {
        return JSON.parse(data);
      } catch {
        return "";
      }
    }
    return "";
  },

  save(weekLabel, content) {
    const key = this.getKey(weekLabel);
    localStorage.setItem(key, JSON.stringify(content));
  },

  /**
   * 收集所有周总结数据，返回 { "2026_W27": "...", "2026_W26": "..." }
   */
  loadAll() {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX + "_")) {
        const weekLabel = key.slice(STORAGE_PREFIX.length + 1);
        const data = localStorage.getItem(key);
        if (data) {
          try {
            result[weekLabel] = JSON.parse(data);
          } catch {
            result[weekLabel] = data;
          }
        }
      }
    }
    return result;
  },

  /**
   * 批量恢复周总结数据，不会清除已有但不在备份中的条目
   */
  restoreAll(summaries) {
    if (!summaries || typeof summaries !== "object") return;
    Object.entries(summaries).forEach(([weekLabel, content]) => {
      this.save(weekLabel, content);
    });
  },
};

