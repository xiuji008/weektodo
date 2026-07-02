const STORAGE_PREFIX = "moodTracker";

/**
 * 每日心情数据仓库 —— 按日期（YYYYMMDD）存储 emoji 数组（支持一天多个心情）。
 * 存储位置：localStorage，key 形如 `moodTracker_20260702`，value 为 JSON 数组字符串。
 * 兼容旧版单 emoji 字符串数据：load 时自动包装成数组。
 * 与 weeklySummaryRepository 保持一致的 loadAll / restoreAll 模式，便于 S3 同步。
 */
export default {
  getKey(dateId) {
    return `${STORAGE_PREFIX}_${dateId}`;
  },

  /**
   * 读取某天的心情数组，返回 emoji 字符串数组（如 ["😄", "😌"]），无数据返回 []
   */
  load(dateId) {
    const raw = localStorage.getItem(this.getKey(dateId));
    if (!raw) return [];
    // 兼容旧版：单个 emoji 字符串（非 JSON）
    if (raw.startsWith("[")) {
      try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter((e) => typeof e === "string" && e) : [];
      } catch {
        return [];
      }
    }
    // 旧版单 emoji
    return [raw];
  },

  /**
   * 保存某天的心情数组；空数组则删除该条目
   */
  save(dateId, emojis) {
    const key = this.getKey(dateId);
    const arr = Array.isArray(emojis) ? emojis.filter((e) => e) : [];
    if (arr.length > 0) {
      localStorage.setItem(key, JSON.stringify(arr));
    } else {
      localStorage.removeItem(key);
    }
  },

  /**
   * 收集所有心情记录，返回 { "20260701": ["😄"], "20260702": ["😭","😰"] }
   */
  loadAll() {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX + "_")) {
        const dateId = key.slice(STORAGE_PREFIX.length + 1);
        result[dateId] = this.load(dateId);
      }
    }
    return result;
  },

  /**
   * 批量恢复心情数据，不会清除已有但不在备份中的条目
   */
  restoreAll(moods) {
    if (!moods || typeof moods !== "object") return;
    Object.entries(moods).forEach(([dateId, emojis]) => {
      // 兼容旧版单 emoji 字符串
      const arr = Array.isArray(emojis) ? emojis : (emojis ? [emojis] : []);
      this.save(dateId, arr);
    });
  },
};
