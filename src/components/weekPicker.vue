<template>
  <div class="week-picker-wrapper" ref="wrapper">
    <!-- 触发按钮 -->
    <span class="week-number-label" @click.stop="togglePicker" style="cursor:pointer">
      {{ weekDisplay }}
      <i class="bi-calendar3 ms-1" style="font-size:0.7rem;opacity:0.6"></i>
    </span>

    <!-- 下拉面板 -->
    <div v-if="visible" class="week-picker-panel" ref="panel">
      <!-- 顶部操作栏 -->
      <div class="picker-header">
        <button class="month-btn" @click="prevMonth" :disabled="atStart"><i class="bi-chevron-left"></i></button>
        <span class="month-label">{{ currentMonthLabel }}</span>
        <button class="month-btn" @click="nextMonth" :disabled="atEnd"><i class="bi-chevron-right"></i></button>
        <button class="today-btn" @click="goToCurrentWeek">
          <i class="bi-house-door"></i>
        </button>
      </div>

      <!-- 月份快速跳转 -->
      <div class="month-grid">
        <span v-for="m in months" :key="m.value"
          class="month-chip"
          :class="{ active: m.value === currentMonth }"
          @click="currentMonth = m.value">
          {{ m.label }}
        </span>
      </div>

      <div class="divider"></div>

      <!-- 周列表 -->
      <div class="week-list">
        <div v-for="week in filteredWeeks" :key="week.monday"
          class="week-item"
          :class="{
            selected: week.monday === selectedDate,
            'is-current': week.isCurrent,
          }"
          @click="selectWeek(week)">
          <span class="week-num">W{{ week.weekNum }}</span>
          <span class="week-range">{{ week.range }}</span>
          <span v-if="week.isCurrent" class="current-badge">{{ $t("ui.currentWeek") }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import moment from "moment";

export default {
  name: "weekPicker",
  props: {
    selectedDate: { type: String, required: true },
  },
  data() {
    return {
      visible: false,
      currentMonth: null,
    };
  },
  computed: {
    /** 当前周的显示文本：第 27 周 (2026) */
    weekDisplay: function () {
      if (!this.selectedDate) return "";
      const weekNum = moment(this.selectedDate).isoWeek();
      const year = moment(this.selectedDate).isoWeekYear();
      return `${this.$t("ui.week")} ${weekNum} (${year})`;
    },
    /** 当前选中周的年份 */
    selectedYear: function () {
      return moment(this.selectedDate).isoWeekYear();
    },
    /** 当前选中周的月份（1-12） */
    selectedMonth: function () {
      return moment(this.selectedDate).month() + 1;
    },
    /** 今天所在的月份 */
    currentRealMonth: function () {
      return moment().month() + 1;
    },
    /** 今天所在的 ISO 周编号 */
    currentWeekNum: function () {
      return moment().isoWeek();
    },
    /** 当前周的周一日期 YYYYMMDD */
    currentMonday: function () {
      return moment().startOf("isoWeek").format("YYYYMMDD");
    },
    /** 一年所有的月份列表 */
    months: function () {
      const lang = this.$i18n ? this.$i18n.locale : "en";
      const result = [];
      for (let i = 1; i <= 12; i++) {
        const m = moment().month(i - 1);
        let label;
        if (lang === "zh_cn" || lang === "zh-CN" || lang === "zh_tw" || lang === "zh-TW") {
          label = i + "月";
        } else {
          label = m.format("MMM");
        }
        result.push({ value: i, label });
      }
      return result;
    },
    /** 当前月份的中文/英文标签 */
    currentMonthLabel: function () {
      const lang = this.$i18n ? this.$i18n.locale : "en";
      const m = moment().month(this.currentMonth - 1);
      if (lang === "zh_cn" || lang === "zh-CN" || lang === "zh_tw" || lang === "zh-TW") {
        return this.selectedYear + "年" + this.currentMonth + "月";
      }
      return m.format("MMMM YYYY");
    },
    /** 当前月下的所有周 */
    filteredWeeks: function () {
      const allWeeks = this.buildYearWeeks(this.selectedYear);
      const month = this.currentMonth;
      return allWeeks.filter(function (w) {
        // 该周的周一落在当前月
        const mon = moment(w.monday, "YYYYMMDD");
        return mon.month() + 1 === month;
      });
    },
    /** 是否到达最左侧月份 */
    atStart: function () {
      const year = this.selectedYear;
      const curYear = moment().isoWeekYear();
      // 如果选中年份早于当前年，或同一年且月份为1月
      if (year < curYear) return this.currentMonth === 1;
      if (year > curYear) return false;
      return this.currentMonth === 1;
    },
    /** 是否到达最右侧月份 */
    atEnd: function () {
      const year = this.selectedYear;
      const curYear = moment().isoWeekYear();
      if (year > curYear) return this.currentMonth === 12;
      if (year < curYear) return false;
      return this.currentMonth === 12;
    },
  },
  watch: {
    visible: function (val) {
      if (val) {
        // 打开时，定位到选中周所在的月份
        this.currentMonth = this.selectedMonth;
        this.$nextTick(function () {
          this.scrollToSelected();
        });
      }
    },
    selectedDate: function () {
      if (this.visible) {
        this.currentMonth = this.selectedMonth;
      }
    },
  },
  mounted: function () {
    document.addEventListener("click", this.onClickOutside);
  },
  beforeUnmount: function () {
    document.removeEventListener("click", this.onClickOutside);
  },
  methods: {
    togglePicker: function () {
      this.visible = !this.visible;
    },
    closePicker: function () {
      this.visible = false;
    },
    onClickOutside: function (e) {
      const el = this.$refs.wrapper;
      if (el && !el.contains(e.target)) {
        this.visible = false;
      }
    },
    /** 构建一整年（含跨年周）的周数据，按月份分组 */
    buildYearWeeks: function (year) {
      const weeks = [];
      // 从该年第一周开始
      const firstMonday = moment().isoWeekYear(year).startOf("isoWeek").startOf("isoWeek");
      // 最多53周
      for (let w = 1; w <= 53; w++) {
        const mon = moment(firstMonday).isoWeek(w);
        // 如果跨年了（该周不在 targetYear 内）则跳过
        const weekYear = mon.isoWeekYear();
        if (weekYear !== year) continue;
        const monStr = mon.format("YYYYMMDD");
        const weekNum = mon.isoWeek();
        const sun = mon.clone().add(6, "d");
        const range = mon.format("M/D") + " - " + sun.format("M/D");
        const isCurrent = monStr === this.currentMonday;
        weeks.push({
          weekNum: weekNum,
          monday: monStr,
          range: range,
          isCurrent: isCurrent,
          year: year,
        });
      }
      return weeks;
    },
    selectWeek: function (week) {
      this.$emit("select-week", week.monday);
      this.closePicker();
    },
    goToCurrentWeek: function () {
      this.$emit("select-week", this.currentMonday);
      // 切换到当前月份
      this.currentMonth = this.currentRealMonth;
      this.closePicker();
    },
    prevMonth: function () {
      if (this.currentMonth > 1) {
        this.currentMonth--;
      }
    },
    nextMonth: function () {
      if (this.currentMonth < 12) {
        this.currentMonth++;
      }
    },
    scrollToSelected: function () {
      this.$nextTick(function () {
        const panel = this.$refs.panel;
        if (!panel) return;
        const selected = panel.querySelector(".week-item.selected");
        if (selected) {
          selected.scrollIntoView({ block: "center", behavior: "auto" });
        }
      });
    },
  },
};
</script>

<style scoped lang="scss">
@import "../assets/style/globalVars";

.week-picker-wrapper {
  position: relative;
  display: inline-block;
}

.week-picker-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  width: 280px;
  max-height: 380px;
  background: #fff;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(140, 149, 159, 0.2);
  z-index: 1050;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .dark-theme & {
    background: #21262d;
    border-color: #30363d;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }
}

/* 顶栏：月份切换 + 回到今天 */
.picker-header {
  display: flex;
  align-items: center;
  padding: 10px 12px 6px;
  gap: 4px;
}

.month-label {
  flex: 1;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 600;
  color: #24292f;

  .dark-theme & {
    color: #c9d1d9;
  }
}

.month-btn {
  background: none;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  padding: 2px 6px;
  cursor: pointer;
  font-size: 0.8rem;
  color: #57606a;

  .dark-theme & {
    border-color: #30363d;
    color: #8b949e;
  }

  &:hover:not(:disabled) {
    background: #f6f8fa;

    .dark-theme & {
      background: #30363d;
    }
  }

  &:disabled {
    opacity: 0.3;
    cursor: default;
  }
}

.today-btn {
  background: none;
  border: 1px solid $check-color;
  border-radius: 6px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 0.8rem;
  color: $check-color;
  margin-left: 4px;

  .dark-theme & {
    border-color: $dt-check-color;
    color: $dt-check-color;
  }

  &:hover {
    background: $check-color;
    color: #fff;

    .dark-theme & {
      background: $dt-check-color;
      color: #fff;
    }
  }
}

/* 月份快速跳转 */
.month-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
  padding: 6px 12px;
}

.month-chip {
  font-size: 0.7rem;
  text-align: center;
  padding: 3px 2px;
  border-radius: 4px;
  cursor: pointer;
  color: #57606a;

  .dark-theme & {
    color: #8b949e;
  }

  &:hover {
    background: #f6f8fa;

    .dark-theme & {
      background: #30363d;
    }
  }

  &.active {
    background: $check-color;
    color: #fff;
    font-weight: 600;

    .dark-theme & {
      background: $dt-check-color;
    }
  }
}

.divider {
  height: 1px;
  background: #d0d7de;
  margin: 4px 12px;

  .dark-theme & {
    background: #30363d;
  }
}

/* 周列表 */
.week-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 8px;
}

.week-item {
  display: flex;
  align-items: center;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  gap: 8px;
  transition: background 0.15s;

  &:hover {
    background: #f6f8fa;

    .dark-theme & {
      background: #30363d;
    }
  }

  &.selected {
    background: #ddf4ff;

    .dark-theme & {
      background: #1f3a5f;
    }

    .week-num {
      color: $check-color;

      .dark-theme & {
        color: $dt-check-color;
      }
    }
  }

  &.is-current .week-num {
    font-weight: 700;
  }
}

.week-num {
  font-size: 0.8rem;
  font-weight: 600;
  color: #24292f;
  min-width: 32px;

  .dark-theme & {
    color: #c9d1d9;
  }
}

.week-range {
  font-size: 0.75rem;
  color: #656d76;

  .dark-theme & {
    color: #8b949e;
  }
}

.current-badge {
  font-size: 0.65rem;
  background: #ddf4ff;
  color: #0969da;
  padding: 1px 6px;
  border-radius: 8px;
  margin-left: auto;

  .dark-theme & {
    background: #1f3a5f;
    color: #58a6ff;
  }
}

/* 滚动条 */
.week-list::-webkit-scrollbar {
  width: 4px;
}

.week-list::-webkit-scrollbar-thumb {
  background: #d0d7de;
  border-radius: 4px;

  .dark-theme & {
    background: #30363d;
  }
}
</style>
