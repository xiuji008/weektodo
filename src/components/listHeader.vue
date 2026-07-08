<template>
  <div class="weekly-to-do-header d-flex">
    <i v-show="!editing" class="bi-info header-menu-icons align-self-center dropdown-toggle-split "
      style="visibility: hidden"></i>
    <div style="flex-grow: 1" class="noselect">
      <div v-if="!customTodoList" :class="dateClass">
        <h4 :class="{ 'today-date': is_today }">
          {{ moments(id).locale(language).format("dddd") }}
        </h4>
        <span class="weekly-to-do-subheader">
          {{ moments(id).locale(language).format("LL") }}
        </span>
        <div class="weekly-to-do-lunar" v-if="lunarDate">
          {{ lunarDate }}<span v-if="holidayName" class="holiday-tag"> {{ holidayName }}</span>
        </div>
      </div>
      <div v-else>
        <h4 v-show="!editing" @dblclick="editToDoListName"> {{ todo_list_name }} </h4>
        <input class="custom-todo-input" v-show="editing" type="text" v-model="name" ref="cTodoInput" @blur="doneEdit()"
          @keyup.enter="doneEdit()" @keyup.esc="cancelEdit()" />
      </div>
    </div>
    <i v-show="!editing" class="bi-three-dots-vertical header-menu-icons dropdown-toggle-split align-self-center"
      type="button" data-bs-toggle="dropdown"></i>
    <ul class="dropdown-menu" aria-labelledby="btnTaskOptionMenu">
      <li>
        <button class="dropdown-item" type="button" @click="newTask">
          <i class="bi-plus-lg"></i> <span>{{ $t('ui.newTask') }}</span>
        </button>
      </li>
      <li v-show="!allTodoChecked()">
        <button class="dropdown-item" type="button" @click="check_all_items">
          <i class="bi-check2-all"></i> <span>{{ $t('ui.completeAll') }}</span>
        </button>
      </li>
      <li>
        <button class="dropdown-item" type="button" @click="sortItems">
          <i class="bi-sort-down"></i> <span>{{ $t('ui.reorder') }}</span>
        </button>
      </li>
      <li v-show="!customTodoList && !allTodoChecked()">
        <button class="dropdown-item" type="button" @click="moveUndoneItems">
          <i class="bi-reply-all"></i> <span>{{ $t('ui.postpone') }}</span>
        </button>
      </li>
      <li v-show="customTodoList">
        <button class="dropdown-item" type="button" @click="openCustomAiTodoModal">
          <i class="bi-stars"></i> <span>{{ $t('ui.aiTodoGenerate') }}</span>
        </button>
      </li>
      <li>
        <button class="dropdown-item" type="button" @click="copyListTasksToClipboard">
          <i class="bi-clipboard"></i> <span>{{ $t('ui.copyTasks') }}</span>
        </button>
      </li>
      <li>
        <hr class="dropdown-divider" />
      </li>
      <li>
        <button class="dropdown-item" type="button" @click="clearList" data-bs-toggle="modal"
          data-bs-target="#clearListModal">
          <i class="bi-trash"></i> <span>{{ $t('ui.clearList') }}</span>
        </button>
      </li>
      <li v-show="customTodoList">
        <button class="dropdown-item" type="button" data-bs-dismiss="modal" @click="removeList" data-bs-toggle="modal"
          data-bs-target="#customListRemoveModal">
          <i class="bi-x-circle"></i> <span>{{ $t('ui.removeList') }}</span>
        </button>
      </li>
    </ul>
  </div>

  <!-- ========== AI 自定义列表待办生成弹框 ========== -->
  <div
    class="modal fade"
    :id="aiCustomModalId"
    tabindex="-1"
    aria-hidden="true"
    data-bs-backdrop="static"
  >
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi-stars me-1"></i>
            AI 生成待办 — {{ todoListName || $t('ui.newList') }}
          </h5>
          <i class="bi-x close-modal" data-bs-dismiss="modal"></i>
        </div>

        <div class="modal-body p-0 ai-todo-modal-body">
          <!-- 步骤1：输入描述 -->
          <div v-if="!aiTodos.length && !aiTodoGenerating" class="ai-todo-step">
            <div class="ai-todo-step-content">
              <p class="ai-todo-desc-hint">{{ $t("ui.aiTodoEmpty") }}</p>
              <textarea
                class="ai-todo-textarea"
                v-model="aiTodoInput"
                :placeholder="$t('ui.aiTodoPlaceholder')"
                rows="5"
              ></textarea>
              <div class="ai-todo-actions-top">
                <button
                  type="button"
                  class="btn btn-sm"
                  :class="darkTheme ? 'btn-light' : 'btn-dark'"
                  @click="generateAiTodos"
                  :disabled="!aiTodoInput.trim() || !aiReady || aiTodoGenerating"
                  :title="!aiReady ? $t('ui.aiNotConfiguredHint') : ''"
                >
                  <i class="bi-stars me-1"></i>
                  {{ $t("ui.aiTodoGenerate") }}
                </button>
              </div>
            </div>
          </div>

          <!-- 步骤2：生成中 -->
          <div v-if="aiTodoGenerating" class="ai-todo-step ai-todo-step-stream">
            <div class="ai-streaming-indicator">
              <i class="bi-arrow-repeat spinning me-2"></i>
              <span>{{ $t("ui.aiGenerating") }}</span>
            </div>
            <div class="ai-todo-stream-body">
              <pre class="ai-json-stream">{{ aiTodoRaw || $t('ui.aiStreamInitializing') }}</pre>
            </div>
          </div>

          <!-- 步骤3：生成完成 - 展示待办卡片 -->
          <div v-if="!aiTodoGenerating && aiTodos.length" class="ai-todo-step ai-todo-step-done">
            <div class="ai-todo-result-header">
              <span>{{ $t('ui.aiTodoPreview', { count: aiTodos.length }) }}</span>
            </div>
            <div class="ai-todo-result-list">
              <div class="ai-todo-items">
                <div v-for="(task, ti) in aiTodos" :key="ti" class="ai-todo-item">
                  <span class="ai-todo-item-text">{{ task.text }}</span>
                  <span v-if="task.priorityLevel" class="ai-todo-item-priority" :class="'ai-pri-' + task.priorityLevel">{{ task.priorityLevel }}</span>
                  <span v-if="task.time" class="ai-todo-item-time">{{ task.time }}</span>
                  <span
                    v-if="task.color && task.color !== 'none'"
                    class="ai-todo-item-color"
                    :style="{ background: task.color }"
                  ></span>
                </div>
              </div>
            </div>
            <div class="ai-todo-done-actions">
              <button
                type="button"
                class="btn btn-sm btn-success"
                @click="applyAiTodos"
                :disabled="applying"
              >
                <i v-if="applying" class="bi-arrow-repeat spinning me-1"></i>
                <i v-else class="bi-list-check me-1"></i>
                {{ $t("ui.aiTodoUse") }}
              </button>
              <button
                type="button"
                class="btn btn-sm"
                :class="darkTheme ? 'btn-outline-light' : 'btn-outline-secondary'"
                @click="resetAiTodo"
              >
                <i class="bi-arrow-repeat me-1"></i>
                {{ $t("ui.aiRegenerate") }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import moment from "moment";
import toDoListRepository from "../repositories/toDoListRepository";
import customToDoListIdsRepository from "../repositories/customToDoListIdsRepository";
import notifications from "../helpers/notifications";
import tasksHelper from "../helpers/tasksHelper";
import { Solar, HolidayUtil } from 'lunar-javascript';
import { Toast, Modal } from 'bootstrap';
import aiService from "../helpers/aiService";
import aiConfigRepository from "../repositories/aiConfigRepository";

export default {
  components: {},
  props: {
    id: { required: false, type: String },
    customTodoList: { required: false, default: false, type: Boolean },
    cTodoListIndex: { required: false, type: Number },
    toDoList: { required: false, type: Array },
  },
  data() {
    return {
      editing: false,
      name: "",
      // AI 生成待办
      aiTodoInput: "",
      aiTodoGenerating: false,
      aiTodoRaw: "",
      aiTodos: [],
      applying: false,
    };
  },
  mounted() {
    if (this.customTodoList) {
      if (this.$store.getters.actions.cListCreated) {
        this.$store.commit("actionsCListCreatedUpdate", false);
        this.editing = true;
        this.$nextTick(function () {
          this.$refs.cTodoInput.focus();
          this.$refs.cTodoInput.select();
        });
      }
    }
  },
  methods: {
    check_all_items: function () {
      this.$store.commit("checkAllItems", this.id);
      this.updateTodoList(this.id, this.$store.getters.todoLists[this.id]);
    },
    moveUndoneItems: function () {
      let towmorrow_id = this.moments(this.id).add(1, "d").format("YYYYMMDD");
      this.$store.commit("moveUndoneItems", {
        origenId: this.id,
        destinyId: towmorrow_id,
      });
      this.updateTodoList(this.id, this.$store.getters.todoLists[this.id]);

      if (this.$store.getters.config.autoReorderTasks) {
        this.updateTodoList(towmorrow_id, tasksHelper.reorderTasksList(this.$store.getters.todoLists[towmorrow_id]));
      } else {
        this.updateTodoList(towmorrow_id, this.$store.getters.todoLists[towmorrow_id]);
      }

    },
    moments: function (date) {
      return moment(date);
    },
    updateTodoList: function (todoListId, TodoList) {
      notifications.refreshDayNotifications(this, todoListId);
      toDoListRepository.update(todoListId, TodoList);
    },
    allTodoChecked: function () {
      if (!this.toDoList || this.toDoList.length === 0) return true;
      let allChecked = true;
      this.toDoList.forEach(function (todo) {
        if (!todo.checked) {
          allChecked = false;
          return;
        }
      });
      return allChecked;
    },
    editToDoListName: function () {
      this.name = this.$store.getters.cTodoListIds[this.cTodoListIndex].listName;
      this.editing = true;
      this.$nextTick(function () {
        this.$refs.cTodoInput.focus();
        this.$refs.cTodoInput.select();
      });
    },
    doneEdit: function () {
      this.editing = false;
      this.$store.commit("updateCustomTodoList", {
        index: this.cTodoListIndex, name: this.name,
      });
      customToDoListIdsRepository.update(this.$store.getters.cTodoListIds);
    },
    cancelEdit: function () {
      this.name = this.$store.getters.cTodoListIds[this.cTodoListIndex].listName || "";
      this.editing = false;
    },
    removeList: function () {
      this.$store.commit("actionsCListToRmvUpdate", {
        id: this.id,
        index: this.cTodoListIndex,
        name: this.$store.getters.cTodoListIds[this.cTodoListIndex].listName,
      });
    },
    sortItems: function () {
      if (!this.toDoList) return;
      toDoListRepository.update(this.id, tasksHelper.reorderTasksList(this.toDoList));
    },
    clearList: function () {
      this.$store.commit("setListToClear", this.id);
    },
    copyListTasksToClipboard: async function () {
      await navigator.clipboard.writeText(this.todoListToString());
      let toast = new Toast(document.getElementById("copiedTaskToClipboard"));
      toast.show();
    },
    todoListToString: function () {
      if (!this.toDoList) return "";
      return this.toDoList.map((x) => {
        let task = `- ${x.text}`;
        if (x.time) task += ` [${x.time}]`;
        return task;
      }).join('\n')
    },
    newTask: function () {
      this.$nextTick(function () {
        document
          .getElementById("list" + this.id)
          .getElementsByClassName("new-todo-input")[0]
          .focus();
      });
    },

    // ========== AI 自定义列表待办生成 ==========
    openCustomAiTodoModal: function () {
      this.resetAiTodo();
      this.$nextTick(() => {
        const el = document.getElementById(this.aiCustomModalId);
        if (el) {
          const modal = new Modal(el);
          modal.show();
        }
      });
    },

    generateAiTodos: function () {
      if (!this.aiTodoInput.trim() || this.aiTodoGenerating) return;

      this.aiTodoGenerating = true;
      this.aiTodoRaw = "";
      this.aiTodos = [];

      const todoSchema = `{
  "text": "任务标题",         // 必填
  "time": "14:00",           // 可选
  "color": "#77e785",        // 可选
  "priorityLevel": "L3",     // 可选，L1=今日必保 L2=今日主攻 L3=本周排期(默认) L4=有空再做 L5=未来待定
  "desc": "备注"             // 可选
}`;

      const priorityDesc = [
        "## 优先级定义（请根据任务性质和紧急程度智能分配）",
        "",
        "| 等级 | 标签 | 处理时效 | 颜色 |",
        "|------|------|---------|------|",
        "| **L1** | 今日必保 | 今天必须完成 | 🔴 红色 |",
        "| **L2** | 今日主攻 | 今天优先推进 | 🟠 橙色 |",
        "| **L3** | 本周排期 | 本周内完成即可 | 🔵 蓝色 |",
        "| **L4** | 有空再做 | 本月内考虑 | 🟢 绿色 |",
        "| **L5** | 未来待定 | 不承诺本月完成 | ⚪ 灰色 |",
        "",
        "分配指导：",
        "- **L1**：有明确截止日且是最后一天；涉及他人等待；有违约/失信/经济损失风险",
        "- **L2**：对长期目标有显著推动；虽无硬截止日但拖过今天会影响下周节奏",
        "- **L3**：日常例行事务；有截止日但在周末之后；不紧急的自我提升（默认）",
        "- **L4**：做了有加分、不做无影响；需要大块时间但当前无法安排",
        "- **L5**：探索性想法；暂时不具备条件的事项",
      ].join("\n");

      const listName = this.todoListName || "自定义列表";

      const userMessage = [
        "你是一个智能待办规划助手。用户将描述想做的事情，请根据描述生成结构化的待办事项列表。",
        "",
        "## 每个待办事项的 JSON 格式",
        "```json",
        todoSchema,
        "```",
        "",
        priorityDesc,
        "",
        `## 目标列表：${listName}`,
        "",
        "## 输出要求",
        "1. 输出纯 JSON 数组，不要包含 markdown 包裹标记",
        "2. 不需要 dateId 字段",
        "3. 使用中文任务标题，简洁明确",
        "4. 尽量完整覆盖用户描述，不要遗漏重要事项",
        "",
        "## 用户需求",
        this.aiTodoInput.trim(),
      ].join("\n");

      aiService.chatStream({
        userMessage,
        systemPrompt: aiConfigRepository.load().listTodoSystemPrompt,
        onChunk: (fullContent) => {
          this.aiTodoRaw = fullContent;
        },
        onDone: (fullContent) => {
          this.aiTodoGenerating = false;
          this.aiTodoRaw = fullContent;
          this.parseAiTodos(fullContent);
        },
        onError: (error) => {
          this.aiTodoGenerating = false;
          this.aiTodoRaw = "";
          alert("AI 生成失败：" + error);
        },
      });
    },

    parseAiTodos: function (raw) {
      try {
        let json = raw.trim();
        const jsonMatch = json.match(/\[[\s\S]*\]/);
        if (jsonMatch) json = jsonMatch[0];
        const parsed = JSON.parse(json);
        if (!Array.isArray(parsed)) throw new Error("not array");
        this.aiTodos = parsed
          .filter((item) => item.text)
          .map((item) => {
            let pl = item.priorityLevel || "L3";
            if (typeof item.priority === "number") {
              const legacyMap = { 2: "L1", 1: "L2", 0: "L3" };
              pl = legacyMap[item.priority] || pl;
            }
            return {
              text: String(item.text).trim(),
              time: item.time || "",
              color: item.color && item.color !== "none" ? item.color : "none",
            priorityLevel: pl,
            desc: item.desc || "",
            };
          });
        if (this.aiTodos.length === 0) {
          alert("AI 返回了有效数据但没有生成任何待办事项，请重新描述");
        }
      } catch (e) {
        console.error("解析 AI 待办失败:", e);
        alert("AI 返回格式有误，无法解析待办事项，请重试或调整描述。错误：" + e.message);
      }
    },

    resetAiTodo: function () {
      this.aiTodoGenerating = false;
      this.aiTodoRaw = "";
      this.aiTodos = [];
      this.aiTodoInput = "";
      this.applying = false;
    },

    applyAiTodos: function () {
      if (this.applying || !this.aiTodos.length) return;
      this.applying = true;

      let totalAdded = 0;

      this.aiTodos.forEach((task) => {
        const todo = {
          text: task.text,
          checked: false,
          listId: this.id,
          desc: task.desc || "",
          subTaskList: [],
          color: task.color || "none",
          priority: 0,
          priorityLevel: task.priorityLevel || "L3",
          tags: [],
          time: task.time || null,
          alarm: false,
        repeatingEvent: null,
        status: "pending",
        };
        this.$store.commit("addTodo", todo);
        totalAdded++;
      });

      this.updateTodoList(this.id, this.$store.getters.todoLists[this.id]);
      this.applying = false;
      alert(`✅ 已成功添加 ${totalAdded} 项待办到「${this.todoListName}」！`);

      // 关闭弹框
      const el = document.getElementById(this.aiCustomModalId);
      if (el) {
        const modal = Modal.getInstance(el);
        if (modal) modal.hide();
      }
    },
  },
  computed: {
    aiCustomModalId: function () {
      return `aiCustomTodoModal_${this.id}`;
    },
    aiReady: function () {
      return aiConfigRepository.isConfigured();
    },
    todoListName: function () {
      if (!this.customTodoList || this.cTodoListIndex === undefined) return '';
      const ids = this.$store.getters.cTodoListIds;
      return ids[this.cTodoListIndex] ? ids[this.cTodoListIndex].listName : '';
    },
    darkTheme: function () {
      return this.$store.getters.config.darkTheme;
    },
    is_today: function () {
      return moment().format("YYYYMMDD") == this.id;
    },
    todo_list_name: function () {
      return this.$store.getters.cTodoListIds[this.cTodoListIndex].listName;
    },
    language: function () {
      return this.$store.getters.config.language;
    },
    // 阴历日期
    lunarDate: function () {
      if (this.customTodoList || !this.id) return '';
      try {
        const m = moment(this.id);
        const solar = Solar.fromYmd(m.year(), m.month() + 1, m.date());
        const lunar = solar.getLunar();
        return lunar.getMonthInChinese() + '月' + lunar.getDayInChinese();
      } catch (e) {
        return '';
      }
    },
    // 是否为周末
    isWeekend: function () {
      if (this.customTodoList || !this.id) return false;
      const dow = moment(this.id).day();
      return dow === 0 || dow === 6;
    },
    // 是否为节假日
    isHoliday: function () {
      if (this.customTodoList || !this.id) return false;
      try {
        const m = moment(this.id);
        const h = HolidayUtil.getHoliday(m.year(), m.month() + 1, m.date());
        return h !== null;
      } catch (e) {
        return false;
      }
    },
    // 节假日名称
    holidayName: function () {
      if (this.customTodoList || !this.id) return '';
      try {
        const m = moment(this.id);
        const h = HolidayUtil.getHoliday(m.year(), m.month() + 1, m.date());
        return h ? h.getName() : '';
      } catch (e) {
        return '';
      }
    },
    // 日期容器 CSS 类
    dateClass: function () {
      return {
        'weekend-date': this.isWeekend || this.isHoliday,
        'holiday-date': this.isHoliday,
      };
    },
  },
};
</script>

<style scoped lang="scss">
.weekly-to-do-header {
  text-align: center;
  margin-bottom: 23px;
  margin-top: 10px;
  display: flex;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.today-date {
  text-decoration: underline;
  text-decoration-color: #0969da;
  text-underline-offset: 4px;
  text-decoration-thickness: 2px;
  color: #0969da !important;
}

.dark-theme .today-date {
  color: #58a6ff !important;
  text-decoration-color: #58a6ff;
}

/* 当天文字 + 一个小圆点指示器 */
.today-date::after {
  content: "";
  display: block;
  width: 6px;
  height: 6px;
  background: #0969da;
  border-radius: 50%;
  margin: 2px auto 0;
}

.dark-theme .today-date::after {
  background: #58a6ff;
}

.weekly-to-do-header h4 {
  margin-bottom: 4px;
  font-size: 21px;
  text-transform: capitalize;
  min-height: 25px;
}

.weekly-to-do-subheader {
  margin-top: 0px;
  font-size: 12px;
  color: grey;
}

/* 阴历日期 */
.weekly-to-do-lunar {
  font-size: 11px;
  color: #888;
  margin-top: 2px;
}

.holiday-tag {
  color: #2980b9;
  font-weight: 600;
}

/* 周末颜色（浅绿色）*/
.weekend-date h4 {
  color: #27ae60 !important;
}

.weekend-date .weekly-to-do-subheader {
  color: #27ae60 !important;
}

.weekend-date .weekly-to-do-lunar {
  color: #27ae60 !important;
}

.dark-theme .weekend-date h4,
.dark-theme .weekend-date .weekly-to-do-subheader,
.dark-theme .weekend-date .weekly-to-do-lunar {
  color: #4ade80 !important;
}

/* 节假日特殊标记（浅蓝色）*/
.holiday-date h4 {
  color: #2980b9 !important;
}

.holiday-date .weekly-to-do-subheader {
  color: #2980b9 !important;
}

.holiday-date .weekly-to-do-lunar {
  color: #2980b9 !important;
}

.dark-theme .holiday-date h4,
.dark-theme .holiday-date .weekly-to-do-subheader,
.dark-theme .holiday-date .weekly-to-do-lunar {
  color: #60a5fa !important;
}

.weekly-to-do-header .header-menu-icons {
  color: grey;
}

.dark-theme .weekly-to-do-header .header-menu-icons {
  color: #c9d1d9;
}

.weekly-to-do-header .header-menu-icons:hover {
  color: black;
}

.dark-theme .weekly-to-do-header .header-menu-icons:hover {
  color: white;
}

.weekly-to-do-header .header-menu-icons {
  font-size: 20px;
  flex-grow: 0;
  align-self: start;
  cursor: pointer;
  visibility: hidden;
  opacity: 0;
  transition: 0.4s cubic-bezier(0.2, 1, 0.1, 1);
}

.custom-todo-input {
  font-size: 1.25rem;
  width: 100%;
}

.custom-todo-input:focus {
  outline: black auto 1px;
}

.dark-theme .custom-todo-input:focus {
  color: white;
  outline: #13171d auto 1px;
}

.weekly-to-do-header:hover .header-menu-icons,
.header-menu-icons.show {
  visibility: visible;
  opacity: 1;
}

.dropdown-menu {
  font-size: 0.865rem;
  min-width: unset;
  border-radius: 8px;
  box-shadow: 0 2px 10px 0 rgba(0, 0, 0, .20);
  border: none;
  color: #3c3c3c;

  .dropdown-item {
    padding: .4rem 1.9rem .4rem .65rem;
  }

  .dropdown-divider {
    margin: .3rem;
  }

  i {
    font-size: 0.99rem;
    margin-right: 11px;
    display: inline-block;
  }
}

.dropdown-toggle-split {
  padding: 0px;
}

.bi-reply-all,
.bi-files {
  transform: scaleX(-1);
}

/* ========== AI 自定义列表待办弹框样式 ========== */
.modal-lg {
  max-width: 820px;
}

.ai-todo-modal-body {
  min-height: 380px;
  display: flex;
  flex-direction: column;
}

.ai-todo-step {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.ai-todo-step-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
}

.ai-todo-desc-hint {
  font-size: 0.85rem;
  color: #888;
  margin: 0 0 12px;
  line-height: 1.5;
}

.dark-theme .ai-todo-desc-hint {
  color: #8b949e;
}

.ai-todo-textarea {
  width: 100%;
  font-size: 0.85rem;
  line-height: 1.6;
  padding: 12px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #fff;
  color: #24292f;
  outline: none;
  font-family: inherit;
  resize: vertical;
  min-height: 120px;
}

.dark-theme .ai-todo-textarea {
  background: #0d1117;
  color: #c9d1d9;
  border-color: #30363d;
}

.ai-todo-textarea:focus {
  border-color: #0969da;
  box-shadow: 0 0 0 2px rgba(9, 105, 218, 0.15);
}

.dark-theme .ai-todo-textarea:focus {
  border-color: #58a6ff;
  box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.15);
}

.ai-todo-actions-top {
  display: flex;
  justify-content: center;
  padding: 14px 0 0;
  flex-shrink: 0;
}

.ai-todo-step-stream {
  overflow-y: auto;
}

.ai-todo-stream-body {
  flex: 1;
  padding: 14px;
  overflow-y: auto;
}

.ai-json-stream {
  font-size: 0.78rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: #555;
  margin: 0;
}

.dark-theme .ai-json-stream {
  color: #8b949e;
}

.ai-streaming-indicator {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  font-size: 0.82rem;
  color: #0969da;
  border-bottom: 1px solid #ddf4ff;
  flex-shrink: 0;
}

.dark-theme .ai-streaming-indicator {
  color: #58a6ff;
  border-bottom-color: #1f3a5f;
}

.ai-todo-step-done {
  overflow-y: auto;
}

.ai-todo-result-header {
  padding: 12px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #333;
  border-bottom: 1px solid #eaecef;
  flex-shrink: 0;
}

.dark-theme .ai-todo-result-header {
  color: #c9d1d9;
  border-bottom-color: #30363d;
}

.ai-todo-result-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.ai-todo-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-todo-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 0.82rem;
  background: #fff;
  border: 1px solid #eaecef;
}

.dark-theme .ai-todo-item {
  background: #0d1117;
  border-color: #30363d;
}

.ai-todo-item-text {
  flex: 1;
  min-width: 0;
  color: #24292f;
  word-break: break-word;
}

.dark-theme .ai-todo-item-text {
  color: #c9d1d9;
}

.ai-todo-item-time {
  font-size: 0.76rem;
  color: #888;
  flex-shrink: 0;
  background: #eef1f5;
  padding: 1px 6px;
  border-radius: 3px;
}

.dark-theme .ai-todo-item-time {
  background: #1c2128;
  color: #8b949e;
}

.ai-todo-item-color {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ai-todo-item-priority {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0 5px;
  border-radius: 3px;
  flex-shrink: 0;
  line-height: 1.5;
}
.ai-pri-L1 { background: #dc3545; color: #fff; }
.ai-pri-L2 { background: #fd7e14; color: #fff; }
.ai-pri-L3 { background: #0d6efd; color: #fff; }
.ai-pri-L4 { background: #28a745; color: #fff; }
.ai-pri-L5 { background: #6c757d; color: #fff; }
.dark-theme .ai-pri-L1 { background: #e35d6b; }
.dark-theme .ai-pri-L2 { background: #ff9f43; }
.dark-theme .ai-pri-L3 { background: #4d9bff; }
.dark-theme .ai-pri-L4 { background: #51cf66; }
.dark-theme .ai-pri-L5 { background: #868e96; }

.ai-todo-done-actions {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #eaecef;
  flex-shrink: 0;
  justify-content: center;
}

.dark-theme .ai-todo-done-actions {
  border-top-color: #30363d;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinning {
  display: inline-block;
  animation: spin 1s linear infinite;
}
</style>