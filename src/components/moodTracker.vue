<template>
  <div class="mood-tracker-wrapper">
    <div class="mood-tracker-container" :class="{ 'dark-theme': darkTheme }">
      <!-- 左侧占位：与日历滑块按钮对齐 -->
      <i class="bi-chevron-left mood-side-spacer"></i>

      <!-- 7 个心情单元格，与上方 7 列日期对齐 -->
      <div class="mood-cells-row">
        <div
          v-for="(date, idx) in dates_array"
          :key="date"
          class="mood-cell"
          :class="{
            'is-today': isToday(date),
            'is-weekend': isWeekend(date),
            'edge-left': idx === 0,
            'edge-right': idx === dates_array.length - 1,
          }"
        >
          <div
            class="mood-display"
            :class="{ 'has-moods': moodMap[date] && moodMap[date].length }"
            @click.stop="togglePicker(date)"
            :title="moodTitle(date)"
          >
            <template v-if="moodMap[date] && moodMap[date].length">
              <span class="mood-emojis">
                <span
                  v-for="(emo, ei) in moodMap[date]"
                  :key="ei"
                  class="mood-emoji"
                  :title="$t('ui.moodRemoveHint')"
                  @click.stop="togglePicker(date)"
                  @contextmenu.prevent.stop="removeMoodAt(date, ei)"
                >{{ emo }}</span>
              </span>
            </template>
            <span v-else class="mood-add-icon">＋</span>
          </div>

          <transition name="mood-pop">
            <div
              v-if="activePicker === date"
              class="mood-picker-popover"
              @click.stop
              @mouseleave="hoverKey = ''"
            >
              <!-- 悬停文字提示区 -->
              <div class="mood-picker-label">
                <span v-if="hoverKey">{{ $t("ui.mood_" + hoverKey) }}</span>
                <span v-else class="mood-picker-label-placeholder">{{ $t("ui.moodPickerHint") }}</span>
              </div>

              <div class="mood-picker-grid">
                <span
                  v-for="mood in moods"
                  :key="mood.key"
                  class="mood-option"
                  @click.stop="addMood(date, mood.emoji)"
                  @contextmenu.prevent.stop="removeMood(date, mood.emoji)"
                  @mouseenter="hoverKey = mood.key"
                >{{ mood.emoji }}</span>
              </div>

              <div class="mood-picker-footer">
                <template v-if="moodMap[date] && moodMap[date].length">
                  <span class="mood-clear-btn" @click.stop="undoMood(date)">
                    <i class="bi-arrow-counterclockwise"></i> {{ $t("ui.moodUndo") }}
                  </span>
                  <span class="mood-clear-btn mood-clear-all" @click.stop="clearMood(date)">
                    <i class="bi-trash3"></i> {{ $t("ui.moodClear") }}
                  </span>
                </template>
                <span v-else class="mood-picker-hint">{{ $t("ui.moodMultiHint") }}</span>
              </div>
            </div>
          </transition>
        </div>
      </div>

      <!-- 右侧占位：与日历滑块按钮对齐 -->
      <i class="bi-chevron-right mood-side-spacer"></i>
    </div>
  </div>
</template>

<script>
import moodRepository from "../repositories/moodRepository";
import moment from "moment";

/**
 * 精选情绪 emoji 集合（10 种），覆盖正负情绪光谱。
 * 顺序：正向 → 中性 → 负向，便于在选板中按情绪强度浏览。
 */
const MOODS = [
  { emoji: "😄", key: "happy" },
  { emoji: "🤩", key: "excited" },
  { emoji: "😌", key: "calm" },
  { emoji: "😐", key: "indifferent" },
  { emoji: "😕", key: "lost" },
  { emoji: "😢", key: "sad" },
  { emoji: "😭", key: "crying" },
  { emoji: "😠", key: "angry" },
  { emoji: "😰", key: "anxious" },
  { emoji: "🥱", key: "tired" },
];

export default {
  name: "MoodTracker",
  props: {
    dates_array: { type: Array, default: () => [] },
  },
  data() {
    return {
      moods: MOODS,
      moodMap: {},
      activePicker: null,
      hoverKey: "",
    };
  },
  computed: {
    darkTheme() {
      return this.$store.getters.config.darkTheme;
    },
  },
  watch: {
    dates_array: {
      immediate: true,
      handler(arr) {
        const map = {};
        (arr || []).forEach((d) => {
          map[d] = moodRepository.load(d);
        });
        this.moodMap = map;
        this.activePicker = null;
        this.hoverKey = "";
      },
    },
  },
  mounted() {
    document.addEventListener("click", this.onDocumentClick);
  },
  beforeUnmount() {
    document.removeEventListener("click", this.onDocumentClick);
  },
  methods: {
    isToday(dateId) {
      return moment().format("YYYYMMDD") === dateId;
    },
    isWeekend(dateId) {
      const dow = moment(dateId).day();
      return dow === 0 || dow === 6;
    },
    isSelected(dateId, emoji) {
      const arr = this.moodMap[dateId] || [];
      return arr.includes(emoji);
    },
    /**
     * 按选择顺序返回当天情绪文字标签数组，如 ["开心","失落","开心"]
     */
    moodLabels(dateId) {
      const arr = this.moodMap[dateId] || [];
      return arr
        .map((emo) => {
          const mood = this.moods.find((m) => m.emoji === emo);
          return mood ? this.$t("ui.mood_" + mood.key) : "";
        })
        .filter(Boolean);
    },
    moodTitle(dateId) {
      const labels = this.moodLabels(dateId);
      if (labels.length) return this.$t("ui.moodRecorded", [labels.join(" → ")]);
      return this.$t("ui.moodAddHint");
    },
    togglePicker(dateId) {
      this.activePicker = this.activePicker === dateId ? null : dateId;
      this.hoverKey = "";
    },
    addMood(dateId, emoji) {
      const arr = (this.moodMap[dateId] || []).slice();
      arr.push(emoji);
      moodRepository.save(dateId, arr);
      this.moodMap = { ...this.moodMap, [dateId]: arr };
      this.$emit("mood-changed", { dateId, emojis: arr });
    },
    removeMood(dateId, emoji) {
      const arr = (this.moodMap[dateId] || []).slice();
      const i = arr.lastIndexOf(emoji);
      if (i >= 0) arr.splice(i, 1);
      moodRepository.save(dateId, arr);
      this.moodMap = { ...this.moodMap, [dateId]: arr };
      this.$emit("mood-changed", { dateId, emojis: arr });
    },
    /**
     * 按索引移除当天第 index 个 emoji（右键单个删除）
     */
    removeMoodAt(dateId, index) {
      const arr = (this.moodMap[dateId] || []).slice();
      if (index < 0 || index >= arr.length) return;
      arr.splice(index, 1);
      moodRepository.save(dateId, arr);
      this.moodMap = { ...this.moodMap, [dateId]: arr };
      this.$emit("mood-changed", { dateId, emojis: arr });
    },
    undoMood(dateId) {
      const arr = (this.moodMap[dateId] || []).slice();
      if (!arr.length) return;
      arr.pop();
      moodRepository.save(dateId, arr);
      this.moodMap = { ...this.moodMap, [dateId]: arr };
      this.$emit("mood-changed", { dateId, emojis: arr });
    },
    clearMood(dateId) {
      moodRepository.save(dateId, []);
      this.moodMap = { ...this.moodMap, [dateId]: [] };
      this.$emit("mood-changed", { dateId, emojis: [] });
    },
    onDocumentClick() {
      this.activePicker = null;
      this.hoverKey = "";
    },
  },
};
</script>

<style scoped>
.mood-tracker-wrapper {
  flex-shrink: 0;
}

.mood-tracker-container {
  display: flex;
  align-items: center;
  padding: 5px 0;
  border-top: 1px solid #eaecef;
  background: #fafbfc;
}

.mood-tracker-container.dark-theme {
  border-top-color: #30363d;
  background: #161b22;
}

/* 占位符：复用滑块按钮的尺寸，使心情格与日期列完美对齐 */
.mood-side-spacer {
  padding: 3px;
  font-size: 2rem;
  margin-left: 6px;
  margin-right: 6px;
  visibility: hidden;
  flex-shrink: 0;
  line-height: 1;
}

.mood-cells-row {
  flex-grow: 1;
  display: flex;
  min-height: 30px;
}

.mood-cell {
  flex: 1 1 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 2px;
}

.mood-display {
  min-width: 28px;
  min-height: 28px;
  max-width: 100%;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 1px;
  padding: 2px 4px;
  cursor: pointer;
  border: 1px dashed #d0d7de;
  background: #fff;
  transition: all 0.15s ease;
  user-select: none;
}

.mood-display:hover {
  border-color: #0969da;
  border-style: solid;
  background: #ddf4ff;
}

.dark-theme .mood-display {
  border-color: #30363d;
  background: #0d1117;
}

.dark-theme .mood-display:hover {
  border-color: #58a6ff;
  background: #1f3a5f;
}

.mood-display.has-moods {
  border-style: solid;
  border-color: #d0d7de;
}

.dark-theme .mood-display.has-moods {
  border-color: #30363d;
}

.mood-cell.is-today .mood-display {
  border-color: #0969da;
  border-style: solid;
  background: rgba(9, 105, 218, 0.08);
}

.dark-theme .mood-cell.is-today .mood-display {
  border-color: #58a6ff;
  background: rgba(88, 166, 255, 0.12);
}

.mood-emojis {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 1px;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.mood-emoji {
  font-size: 0.95rem;
  line-height: 1;
  padding: 1px 2px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s ease;
}

.mood-emoji:hover {
  background: rgba(215, 58, 73, 0.12);
}

.dark-theme .mood-emoji:hover {
  background: rgba(248, 81, 73, 0.18);
}

.mood-add-icon {
  font-size: 0.9rem;
  color: #aaa;
  font-weight: 300;
}

.dark-theme .mood-add-icon {
  color: #555;
}

/* ========== 心情选板弹出层 ========== */
.mood-picker-popover {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: #fff;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 8px;
  z-index: 20;
  width: 190px;
}

.dark-theme .mood-picker-popover {
  background: #1c2128;
  border-color: #30363d;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

/* 边缘单元格：避免选板溢出屏幕 */
.mood-cell.edge-left .mood-picker-popover {
  left: 0;
  transform: none;
}

.mood-cell.edge-right .mood-picker-popover {
  left: auto;
  right: 0;
  transform: none;
}

/* 悬停文字提示区 */
.mood-picker-label {
  text-align: center;
  font-size: 0.78rem;
  font-weight: 600;
  color: #0969da;
  padding: 2px 0 6px;
  min-height: 1.4em;
  line-height: 1.2;
}

.dark-theme .mood-picker-label {
  color: #58a6ff;
}

.mood-picker-label-placeholder {
  font-weight: 400;
  color: #888;
}

.dark-theme .mood-picker-label-placeholder {
  color: #8b949e;
}

.mood-picker-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
}

.mood-option {
  font-size: 1.2rem;
  text-align: center;
  padding: 4px 0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.12s ease;
  line-height: 1;
}

.mood-option:hover {
  background: #eaecef;
  transform: scale(1.15);
}

.dark-theme .mood-option:hover {
  background: #30363d;
}

.mood-option.active {
  background: #ddf4ff;
  box-shadow: 0 0 0 2px #0969da;
}

.dark-theme .mood-option.active {
  background: #1f3a5f;
  box-shadow: 0 0 0 2px #58a6ff;
}

.mood-picker-footer {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #eaecef;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 0.72rem;
}

.dark-theme .mood-picker-footer {
  border-top-color: #30363d;
}

.mood-clear-btn {
  color: #0969da;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.dark-theme .mood-clear-btn {
  color: #58a6ff;
}

.mood-clear-btn.mood-clear-all {
  color: #d73a49;
  margin-left: 10px;
}

.mood-clear-btn:hover {
  text-decoration: underline;
}

.mood-picker-hint {
  color: #888;
}

.dark-theme .mood-picker-hint {
  color: #8b949e;
}

/* 弹出/收起过渡（仅透明度，避免与边缘定位 transform 冲突） */
.mood-pop-enter-active,
.mood-pop-leave-active {
  transition: opacity 0.15s ease;
}

.mood-pop-enter-from,
.mood-pop-leave-to {
  opacity: 0;
}
</style>
