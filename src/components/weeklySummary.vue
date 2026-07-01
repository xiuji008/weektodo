<template>
  <div class="weekly-summary-wrapper">
    <div class="weekly-summary-container" :class="{ 'dark-theme': darkTheme }">
    <!-- 标题栏 -->
    <div class="weekly-summary-header" @dblclick="openEditModal">
      <span class="summary-title">
        {{ $t("ui.week") }} {{ weekNumber }} {{ $t("ui.summary") }}
      </span>
      <div class="summary-actions">
        <i
          class="summary-action-icon bi-pencil"
          @click="openEditModal"
          :title="$t('todoDetails.edit')"
        ></i>
        <i
          v-show="hasContent"
          class="summary-action-icon bi-eye"
          @click="openPreviewDrawer"
          :title="$t('ui.preview')"
        ></i>
      </div>
    </div>

    <!-- 内容摘要 -->
    <div class="weekly-summary-body" @dblclick="openEditModal">
      <div v-if="hasContent" class="summary-excerpt" @click="openPreviewDrawer">
        <span class="summary-excerpt-text">{{ excerpt }}</span>
        <span class="summary-excerpt-more">{{ $t("ui.clickToPreview") }}</span>
      </div>
      <div v-else class="summary-empty">
        <i class="bi-pencil me-1"></i>
        {{ $t("ui.clickToAddSummary") }}
      </div>
    </div>

    <!-- ========== 周总结编辑弹框 ========== -->
    <div
      class="modal fade"
      :id="modalId"
      tabindex="-1"
      aria-hidden="true"
      data-bs-backdrop="static"
    >
      <div class="modal-dialog modal-dialog-centered modal-xl">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              {{ $t("ui.week") }} {{ weekNumber }} {{ $t("ui.summary") }}
            </h5>
            <i class="bi-x close-modal" data-bs-dismiss="modal"></i>
          </div>

          <!-- 左右分栏主体 -->
          <div class="modal-body p-0 split-body">
            <!-- 左侧：编辑区 -->
            <div class="split-left">
              <div class="split-panel-header">
                <span class="split-panel-title">{{ $t("todoDetails.notes") }}</span>
              </div>
              <textarea
                class="summary-modal-textarea"
                v-model="editContent"
                :placeholder="$t('todoDetails.notes')"
                ref="modalTextarea"
              ></textarea>
            </div>

            <!-- 右侧：AI 周总结面板 -->
            <div class="split-right ai-summary-panel" :class="{ 'dark-theme': darkTheme }">
              <!-- 初始状态 -->
              <div v-if="!aiContent && !aiStreaming" class="ai-empty-state">
                <i class="bi-stars ai-empty-icon"></i>
                <p class="ai-empty-text">{{ $t("ui.clickToAddSummary") }}</p>
                <button
                  type="button"
                  class="btn btn-sm ai-generate-btn"
                  :class="darkTheme ? 'btn-light' : 'btn-dark'"
                  @click="generateWithAi"
                  :disabled="!aiReady"
                  :title="!aiReady ? $t('ui.aiNotConfiguredHint') : ''"
                >
                  <i class="bi-stars me-1"></i>
                  {{ $t("ui.aiGenerate") }}
                </button>
              </div>

              <!-- 流式生成中 -->
              <div v-if="aiStreaming" class="ai-streaming-area">
                <div class="ai-streaming-indicator">
                  <i class="bi-arrow-repeat spinning me-2"></i>
                  <span>{{ $t("ui.aiGenerating") }}</span>
                </div>
                <div
                  v-if="aiContent"
                  class="ai-streaming-content markdown-body"
                  v-html="renderMarkdown(aiContent)"
                ></div>
                <div v-else class="ai-thinking">
                  <i class="bi-three-dots ai-dot-pulse"></i>
                  <span>{{ $t("ui.aiStreamInitializing") }}</span>
                </div>
              </div>

              <!-- 生成完成 -->
              <div v-if="!aiStreaming && aiContent" class="ai-done-area">
                <div class="ai-done-content markdown-body" v-html="renderMarkdown(aiContent)"></div>
                <div class="ai-done-actions">
                  <button type="button" class="btn btn-sm btn-success" @click="useAiContent">
                    <i class="bi-check-lg me-1"></i>
                    {{ $t("ui.aiUse") }}
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm"
                    :class="darkTheme ? 'btn-outline-light' : 'btn-outline-secondary'"
                    @click="regenerateAiSummary"
                  >
                    <i class="bi-arrow-repeat me-1"></i>
                    {{ $t("ui.aiRegenerate") }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-sm py-1 px-3 border" data-bs-dismiss="modal">
              {{ $t("ui.cancel") }}
            </button>
            <button
              type="button"
              class="btn btn-sm py-1 px-3"
              :class="darkTheme ? 'btn-light' : 'btn-dark'"
              @click="saveAndClose"
            >
              {{ $t("ui.save") }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== AI 周待办独立弹框 ========== -->
    <div
      class="modal fade"
      :id="aiTodoModalId"
      tabindex="-1"
      aria-hidden="true"
      data-bs-backdrop="static"
    >
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi-stars me-1"></i>
              {{ $t("ui.week") }} {{ weekNumber }} {{ $t("ui.aiTodoTab") }}
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
                <span>{{ $t('ui.aiTodoPreview', { count: totalAiTodos }) }}</span>
              </div>
              <div class="ai-todo-result-list">
                <div v-for="day in aiTodos" :key="day.dateId" class="ai-todo-day-group">
                  <div class="ai-todo-day-label">
                    <span class="ai-todo-day-name">{{ day.dayOfWeek }}</span>
                    <span class="ai-todo-day-date">{{ day.displayDate }}</span>
                    <span class="ai-todo-day-count">{{ day.tasks.length }} 项</span>
                  </div>
                  <div class="ai-todo-items">
                    <div v-for="(task, ti) in day.tasks" :key="ti" class="ai-todo-item">
                      <span v-if="task.emoji" class="ai-todo-item-emoji">{{ task.emoji }}</span>
                      <span class="ai-todo-item-text">{{ task.text }}</span>
                      <span v-if="task.time" class="ai-todo-item-time">{{ task.time }}</span>
                      <span v-if="task.color && task.color !== 'none'" class="ai-todo-item-color" :style="{ background: task.color }"></span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="ai-todo-done-actions">
                <button type="button" class="btn btn-sm btn-success" @click="applyAiTodos" :disabled="applying">
                  <i v-if="applying" class="bi-arrow-repeat spinning me-1"></i>
                  <i v-else class="bi-calendar-check me-1"></i>
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

    <!-- ========== 预览抽屉（右侧滑入） ========== -->
    <teleport to="body">
      <div
        class="preview-drawer-overlay"
        :class="{ visible: drawerOpen }"
        @click="closePreviewDrawer"
      ></div>
      <div
        class="preview-drawer"
        :class="{ open: drawerOpen, 'dark-theme': darkTheme }"
      >
        <div class="preview-drawer-header">
          <span class="preview-drawer-title">
            {{ $t("ui.week") }} {{ weekNumber }} {{ $t("ui.summary") }}
          </span>
          <i class="bi-x preview-drawer-close" @click="closePreviewDrawer"></i>
        </div>
        <div
          class="preview-drawer-content"
          v-html="previewContent"
        ></div>
      </div>
    </teleport>
    </div>
  </div>
</template>

<script>
import MarkdownIt from "markdown-it";
import moment from "moment";
import markdownTargetBlankLinks from "../helpers/markdownTargetBlankLinks";
import weeklySummaryRepository from "../repositories/weeklySummaryRepository";
import toDoListRepository from "../repositories/toDoListRepository";
import dbRepository from "../repositories/dbRepository";
import aiService from "../helpers/aiService";
import aiConfigRepository from "../repositories/aiConfigRepository";
import { Modal } from "bootstrap";

export default {
  name: "WeeklySummary",
  props: {
    weekLabel: { required: true, type: String },
    weekNumber: { required: true, type: Number },
  },
  data() {
    return {
      editContent: "",
      content: "",
      drawerOpen: false,
      md: new MarkdownIt(),
      // AI 周总结
      aiStreaming: false,
      aiContent: "",
      // AI 周待办
      aiTodoInput: "",
      aiTodoGenerating: false,
      aiTodoRaw: "",
      aiTodos: [],
      applying: false,
    };
  },
  computed: {
    darkTheme() {
      return this.$store.getters.config.darkTheme;
    },
    modalId() {
      return `weeklySummaryModal_${this.weekLabel.replace(/\W/g, "_")}`;
    },
    aiTodoModalId() {
      return `aiTodoModal_${this.weekLabel.replace(/\W/g, "_")}`;
    },
    hasContent() {
      return this.content && this.content.trim().length > 0;
    },
    excerpt() {
      if (!this.hasContent) return "";
      const text = this.content.replace(/[[\]*_`\n\r()>|~\-\\]/g, " ").replace(/\s+/g, " ").trim();
      return text.length > 80 ? text.slice(0, 80) + "…" : text;
    },
    aiReady() {
      return aiConfigRepository.isConfigured();
    },
    previewContent() {
      if (!this.content) return "";
      return this.md.render(this.content);
    },
    totalAiTodos() {
      return this.aiTodos.reduce((s, d) => s + d.tasks.length, 0);
    },
  },
  mounted() {
    markdownTargetBlankLinks.renderBlankLinks(this.md);
    this.loadContent();
  },
  watch: {
    weekLabel() {
      this.loadContent();
      this.drawerOpen = false;
    },
  },
  methods: {
    renderMarkdown(content) {
      return this.md.render(content || "");
    },
    loadContent() {
      this.content = weeklySummaryRepository.load(this.weekLabel);
    },

    // ========== 弹框控制 ==========
    openEditModal() {
      this.editContent = this.content;
      this.aiStreaming = false;
      this.aiContent = "";
      this.$nextTick(() => {
        const el = document.getElementById(this.modalId);
        if (el) {
          const modal = new Modal(el);
          modal.show();
          setTimeout(() => {
            const ta = this.$refs.modalTextarea;
            if (ta) {
              ta.style.height = "auto";
              ta.style.height = Math.max(200, ta.scrollHeight) + "px";
              ta.focus();
            }
          }, 200);
        }
      });
    },
    saveAndClose() {
      this.content = this.editContent;
      weeklySummaryRepository.save(this.weekLabel, this.editContent);
      const el = document.getElementById(this.modalId);
      if (el) {
        const modal = Modal.getInstance(el);
        if (modal) modal.hide();
      }
    },
    openPreviewDrawer() {
      this.drawerOpen = true;
    },
    closePreviewDrawer() {
      this.drawerOpen = false;
    },

    // ========== AI 周待办 ==========
    openAiTodoModal() {
      this.resetAiTodo();
      this.$nextTick(() => {
        const el = document.getElementById(this.aiTodoModalId);
        if (el) {
          const modal = new Modal(el);
          modal.show();
        }
      });
    },

    getWeekDateRange() {
      const parts = this.weekLabel.match(/(\d+)_W(\d+)/);
      if (!parts) return null;
      const weekMonday = moment().isoWeekYear(parseInt(parts[1])).isoWeek(parseInt(parts[2])).startOf("isoWeek");
      const days = [];
      for (let i = 0; i < 7; i++) {
        const m = weekMonday.clone().add(i, "d");
        days.push({
          dateId: m.format("YYYYMMDD"),
          dayOfWeek: ["周日","周一","周二","周三","周四","周五","周六"][m.day()],
          displayDate: m.format("MM/DD"),
          isoStr: m.format("YYYY-MM-DD"),
        });
      }
      return { weekMonday, days };
    },

    generateAiTodos() {
      if (!this.aiTodoInput.trim() || this.aiTodoGenerating) return;
      const range = this.getWeekDateRange();
      if (!range) return;

      this.aiTodoGenerating = true;
      this.aiTodoRaw = "";
      this.aiTodos = [];

      const dateListStr = range.days
        .map((d) => `  - ${d.dayOfWeek} (${d.isoStr}) → dateId: ${d.dateId}`)
        .join("\n");

      const todoSchema = `{
  "dateId": "20260701",      // 必填，YYYYMMDD，必须是上面给出的 dateId
  "text": "任务标题",         // 必填
  "time": "14:00",           // 可选
  "color": "#77e785",        // 可选
  "priority": 1,             // 可选，0=低 1=中 2=高
  "emoji": "📝",             // 可选
  "desc": "备注"             // 可选
}`;

      const userMessage = [
        "你是一个智能周待办规划助手。用户将描述本周想做的事，请根据描述生成结构化的待办事项。",
        "",
        `## 本周日期范围（共 7 天）`,
        dateListStr,
        "",
        "## 每个待办事项的 JSON 格式",
        "```json",
        todoSchema,
        "```",
        "",
        "## 输出要求",
        "1. 输出纯 JSON 数组，不要包含 markdown 包裹标记",
        "2. dateId 必须从上方的 dateId 中选择",
        "3. 用户未指定日期的任务，智能分配到合适的日期",
        "4. 学习类任务分散到多个工作日",
        "5. 使用中文任务标题",
        "",
        "## 用户需求",
        this.aiTodoInput.trim(),
      ].join("\n");

      aiService.chatStream({
        userMessage,
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

    parseAiTodos(raw) {
      try {
        let json = raw.trim();
        const jsonMatch = json.match(/\[[\s\S]*\]/);
        if (jsonMatch) json = jsonMatch[0];
        const parsed = JSON.parse(json);
        if (!Array.isArray(parsed)) throw new Error("not array");
        const range = this.getWeekDateRange();
        if (!range) return;
        const dayMap = {};
        range.days.forEach((d) => { dayMap[d.dateId] = { ...d, tasks: [] }; });
        parsed.forEach((item) => {
          if (!item.dateId || !item.text) return;
          const dateId = String(item.dateId);
          if (!dayMap[dateId]) return;
          dayMap[dateId].tasks.push({
            text: String(item.text).trim(),
            time: item.time || "",
            color: item.color && item.color !== "none" ? item.color : "none",
            priority: typeof item.priority === "number" ? item.priority : 0,
            emoji: item.emoji || "",
            desc: item.desc || "",
          });
        });
        this.aiTodos = range.days.map((d) => dayMap[d.dateId]).filter((d) => d.tasks.length > 0);
      } catch (e) {
        console.error("解析 AI 待办失败:", e);
      }
    },

    resetAiTodo() {
      this.aiTodoGenerating = false;
      this.aiTodoRaw = "";
      this.aiTodos = [];
      this.aiTodoInput = "";
      this.applying = false;
    },

    applyAiTodos() {
      if (this.applying || !this.aiTodos.length) return;
      this.applying = true;

      const allLists = this.$store.getters.todoLists || {};
      const datesToPersist = new Set();
      let totalAdded = 0;

      this.aiTodos.forEach((day) => {
        if (!allLists[day.dateId]) {
          this.$store.commit("loadTodoLists", { todoListId: day.dateId, todoList: [] });
          const dbReq = dbRepository.open();
          dbReq.onsuccess = (event) => {
            dbRepository.add(event.target.result, "todo_lists", day.dateId, []);
          };
        }
        day.tasks.forEach((task) => {
          const todo = {
            text: task.text, checked: false, listId: day.dateId,
            desc: task.desc || "", subTaskList: [],
            color: task.color || "none", priority: task.priority || 0,
            tags: [], time: task.time || null, alarm: false,
            repeatingEvent: null, emoji: task.emoji || "", status: "pending",
          };
          this.$store.commit("addTodo", todo);
          totalAdded++;
        });
        datesToPersist.add(day.dateId);
      });

      datesToPersist.forEach((dateId) => {
        const list = this.$store.getters.todoLists[dateId];
        if (list) toDoListRepository.update(dateId, list);
      });

      this.applying = false;
      alert(`✅ 已成功添加 ${totalAdded} 项待办到日历！`);

      // 关闭弹框
      const el = document.getElementById(this.aiTodoModalId);
      if (el) {
        const modal = Modal.getInstance(el);
        if (modal) modal.hide();
      }
    },

    // ========== AI 周总结 ==========
    collectWeekTasks() {
      const range = this.getWeekDateRange();
      if (!range) return null;
      const allLists = this.$store.getters.todoLists || {};
      const days = [];
      let taskText = "";
      range.days.forEach((d, i) => {
        const dateMoment = range.weekMonday.clone().add(i, "d");
        const tasks = allLists[d.dateId] || [];
        taskText += `\n### ${dateMoment.format("dddd MM/DD")}\n`;
        if (tasks.length === 0) { taskText += "- (无任务)\n"; }
        tasks.forEach((t) => {
          const status = t.checked || t.status === "done" ? "[x]" : "[ ]";
          let line = `- ${status} ${t.text}`;
          if (t.time) line += ` (${t.time})`;
          if (t.color && t.color !== "none") line += ` [标签]`;
          taskText += line + "\n";
        });
        days.push({
          date: d.dateId, dayOfWeek: d.dayOfWeek, dateLabel: dateMoment.format("dddd MM/DD"),
          tasks: tasks.map((t) => ({
            text: t.text, checked: !!(t.checked || t.status === "done"),
            time: t.time || "", color: t.color || "", emoji: t.emoji || "", notes: t.notes || "",
          })),
        });
      });
      return {
        days, textSummary: taskText,
        json: JSON.stringify({ days }, null, 2),
      };
    },

    generateWithAi() {
      if (this.aiStreaming) return;
      const weekData = this.collectWeekTasks();
      if (!weekData) return;
      this.aiStreaming = true;
      this.aiContent = "";
      const totalTasks = weekData.days.reduce((s, d) => s + d.tasks.length, 0);
      const activeDays = weekData.days.filter((d) => d.tasks.length > 0).length;
      const userMessage = [
        "你是一个专业的周报生成助手。请根据以下本周任务数据，生成一份高质量的周报总结。",
        "",
        `## 本周数据（共 ${activeDays} 天 ${totalTasks} 项任务）`,
        "```json",
        weekData.json,
        "```",
        "",
        "## 输出要求",
        "请生成 Markdown 格式的周报，需包含以下 4 个部分：",
        "",
        "### 1. 📋 本周完成",
        "- 按重要程度或类别归纳已完成的任务",
        "- 突出关键成果，用具体数据说话",
        "",
        "### 2. ⏳ 未完成 / 推迟",
        "- 列出遗留任务并简要说明原因",
        "- 给出下周处理建议",
        "",
        "### 3. ✨ 本周亮点",
        "- 提炼 1-3 条最有价值的成果或进步",
        "- 用简短有力的语言描述",
        "",
        "### 4. 💡 改进建议",
        "- 基于任务执行情况，提出 1-2 条可操作的改进建议",
        "- 聚焦时间管理、优先级排序、工作方法等",
        "",
        "## 格式规范",
        "- 使用中文，语言专业简洁",
        "- 每个部分用二级标题 (##)",
        "- 列表项用短句，避免长段落",
        "- 结尾附一句正向鼓励语",
        "- 整体长度控制在 300-600 字",
      ].join("\n");
      aiService.chatStream({
        userMessage,
        onChunk: (fullContent) => { this.aiContent = fullContent; },
        onDone: (fullContent) => { this.aiStreaming = false; this.aiContent = fullContent; },
        onError: (error) => { this.aiStreaming = false; this.aiContent = ""; alert("AI 生成失败：" + error); },
      });
    },

    regenerateAiSummary() {
      this.aiContent = "";
      this.generateWithAi();
    },

    useAiContent() {
      if (!this.aiContent) return;
      this.editContent = this.aiContent;
      this.$nextTick(() => {
        const ta = this.$refs.modalTextarea;
        if (ta) {
          ta.style.height = "auto";
          ta.style.height = Math.max(200, ta.scrollHeight) + "px";
        }
      });
    },
  },
};
</script>

<style scoped>
.weekly-summary-wrapper {
  /* v-show 容器，不干扰内部弹框 */
}
.weekly-summary-container {
  border-top: 1px solid #eaecef;
  padding: 6px 16px;
  background: #fafbfc;
  flex-shrink: 0;
}
.weekly-summary-container.dark-theme {
  border-top: 1px solid #30363d;
  background: #161b22;
}
.weekly-summary-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: default;
  user-select: none;
}
.summary-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: #888;
  letter-spacing: 0.5px;
}
.dark-theme .summary-title { color: #8b949e; }
.summary-actions { display: flex; gap: 6px; }
.summary-action-icon {
  font-size: 0.9rem;
  color: #aaa;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: 0.2s;
}
.summary-action-icon:hover { color: #333; background: #eaecef; }
.dark-theme .summary-action-icon:hover { color: #c9d1d9; background: #21262d; }

/* 内容摘要 */
.weekly-summary-body { margin-top: 2px; cursor: pointer; }
.summary-excerpt {
  font-size: 0.78rem; line-height: 1.5;
  color: #555; padding: 2px 0;
}
.dark-theme .summary-excerpt { color: #8b949e; }
.summary-excerpt-text { word-break: break-all; }
.summary-excerpt-more { color: #0969da; margin-left: 4px; white-space: nowrap; }
.dark-theme .summary-excerpt-more { color: #58a6ff; }
.summary-empty {
  font-size: 0.78rem; color: #aaa; padding: 2px 0; cursor: pointer;
}
.summary-empty:hover { color: #666; }
.dark-theme .summary-empty { color: #555; }
.dark-theme .summary-empty:hover { color: #8b949e; }

/* ========== 左右分栏布局（总结弹框） ========== */
:deep(.modal-xl) { max-width: 960px; }
.split-body {
  display: flex; flex-direction: row; min-height: 420px;
}
.split-left {
  width: 50%; flex: none;
  display: flex; flex-direction: column;
  border-right: 1px solid #eaecef;
}
.dark-theme .split-left { border-right-color: #30363d; }
.split-right {
  width: 50%; flex: none;
  display: flex; flex-direction: column;
  background: #f8f9fa;
}
.dark-theme .split-right { background: #0d1117; }

/* AI 总结面板右侧标记，无 Tab */
.ai-summary-panel .split-panel-header {
  display: none;
}

.split-panel-header {
  padding: 10px 14px;
  border-bottom: 1px solid #eaecef;
  flex-shrink: 0;
  font-size: 0.78rem; font-weight: 600;
  color: #888; letter-spacing: 0.3px;
  text-transform: uppercase; user-select: none;
}
.dark-theme .split-panel-header { border-bottom-color: #30363d; color: #8b949e; }

/* 编辑区 textarea */
.summary-modal-textarea {
  flex: 1; width: 100%; min-height: 200px;
  font-size: 0.85rem; line-height: 1.6;
  padding: 14px; border: none; resize: vertical;
  background: #fff; color: #24292f;
  outline: none; font-family: inherit;
}
.dark-theme .summary-modal-textarea { background: #0d1117; color: #c9d1d9; }

/* ========== AI 面板通用 ========== */
.ai-panel-body {
  flex: 1; display: flex; flex-direction: column; overflow-y: auto;
}
.ai-empty-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; color: #aaa; padding: 20px;
}
.dark-theme .ai-empty-state { color: #555; }
.ai-empty-icon { font-size: 2.5rem; opacity: 0.5; }
.ai-empty-text { font-size: 0.85rem; margin: 0; }
.ai-generate-btn { margin-top: 4px; }

.ai-streaming-area {
  flex: 1; display: flex; flex-direction: column; overflow-y: auto;
}
.ai-streaming-indicator {
  display: flex; align-items: center;
  padding: 10px 14px; font-size: 0.82rem;
  color: #0969da; border-bottom: 1px solid #ddf4ff; flex-shrink: 0;
}
.dark-theme .ai-streaming-indicator { color: #58a6ff; border-bottom-color: #1f3a5f; }
.ai-streaming-content {
  flex: 1; padding: 14px; font-size: 0.85rem; line-height: 1.7;
  word-wrap: break-word; overflow-y: auto; user-select: auto;
}
.ai-thinking {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px;
  color: #888; font-size: 0.85rem; padding: 20px;
}

.ai-done-area {
  flex: 1; display: flex; flex-direction: column; overflow-y: auto;
}
.ai-done-content {
  flex: 1; padding: 14px; font-size: 0.85rem; line-height: 1.7;
  word-wrap: break-word; overflow-y: auto; user-select: auto;
}
.ai-done-actions {
  display: flex; gap: 8px; padding: 10px 14px;
  border-top: 1px solid #eaecef; flex-shrink: 0; justify-content: center;
}
.dark-theme .ai-done-actions { border-top-color: #30363d; }

/* ========== AI 周待办弹框 ========== */
:deep(.modal-lg) { max-width: 820px; }

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
  background: #0d1117; color: #c9d1d9; border-color: #30363d;
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

/* 流式 JSON 预览 */
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
.dark-theme .ai-json-stream { color: #8b949e; }

/* 待办结果 */
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
.dark-theme .ai-todo-result-header { color: #c9d1d9; border-bottom-color: #30363d; }

.ai-todo-result-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.ai-todo-day-group { margin-bottom: 14px; }

.ai-todo-day-label {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  background: #eef1f5;
  border-radius: 6px;
  font-size: 0.82rem;
  margin-bottom: 6px;
}
.dark-theme .ai-todo-day-label { background: #1c2128; }

.ai-todo-day-name { font-weight: 600; color: #333; }
.dark-theme .ai-todo-day-name { color: #c9d1d9; }
.ai-todo-day-date { color: #888; font-size: 0.78rem; }
.ai-todo-day-count { margin-left: auto; color: #888; font-size: 0.76rem; }

.ai-todo-items { display: flex; flex-direction: column; gap: 4px; }

.ai-todo-item {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 0.82rem;
  background: #fff;
  border: 1px solid #eaecef;
}
.dark-theme .ai-todo-item { background: #0d1117; border-color: #30363d; }

.ai-todo-item-emoji { font-size: 0.9rem; flex-shrink: 0; }
.ai-todo-item-text {
  flex: 1;
  min-width: 0;
  color: #24292f;
  word-break: break-word;
}
.dark-theme .ai-todo-item-text { color: #c9d1d9; }
.ai-todo-item-time {
  font-size: 0.76rem; color: #888; flex-shrink: 0;
  background: #eef1f5; padding: 1px 6px; border-radius: 3px;
}
.dark-theme .ai-todo-item-time { background: #1c2128; color: #8b949e; }
.ai-todo-item-color { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

.ai-todo-done-actions {
  display: flex; gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #eaecef;
  flex-shrink: 0;
  justify-content: center;
}
.dark-theme .ai-todo-done-actions { border-top-color: #30363d; }

/* ========== Markdown 内容样式 ========== */
:deep(.markdown-body) h1, :deep(.markdown-body) h2, :deep(.markdown-body) h3, :deep(.markdown-body) h4 { margin: 14px 0 6px; }
:deep(.markdown-body) h1 { font-size: 1.3rem; }
:deep(.markdown-body) h2 { font-size: 1.15rem; }
:deep(.markdown-body) h3 { font-size: 1rem; }
:deep(.markdown-body) p { margin: 4px 0; }
:deep(.markdown-body) ul, :deep(.markdown-body) ol { padding-left: 20px; margin: 4px 0; }
:deep(.markdown-body) blockquote {
  border-left: 3px solid #d0d7de; margin: 6px 0; padding: 2px 10px;
  color: #656d76; background: #f6f8fa; border-radius: 0 4px 4px 0;
}
.dark-theme :deep(.markdown-body) blockquote { border-left-color: #30363d; color: #8b949e; background: #0d1117; }
:deep(.markdown-body) code { background: #eaecef; padding: 2px 5px; border-radius: 3px; font-size: 0.8rem; }
.dark-theme :deep(.markdown-body) code { background: #21262d; color: #c9d1d9; }
:deep(.markdown-body) pre { background: #f6f8fa; padding: 10px; border-radius: 6px; overflow-x: auto; border: 1px solid #eaecef; font-size: 0.8rem; }
.dark-theme :deep(.markdown-body) pre { background: #0d1117; border-color: #30363d; }
:deep(.markdown-body) table { border-collapse: collapse; width: 100%; margin: 6px 0; font-size: 0.82rem; }
:deep(.markdown-body) th, :deep(.markdown-body) td { border: 1px solid #d0d7de; padding: 4px 8px; text-align: left; }
.dark-theme :deep(.markdown-body) th, .dark-theme :deep(.markdown-body) td { border-color: #30363d; }

/* ========== 预览抽屉 ========== */
.preview-drawer-overlay {
  position: fixed; inset: 0; z-index: 1055;
  background: rgba(0,0,0,0.3); opacity: 0; visibility: hidden;
  transition: opacity .25s ease, visibility .25s ease;
}
.preview-drawer-overlay.visible { opacity: 1; visibility: visible; }
.preview-drawer {
  position: fixed; top: 0; right: 0; width: 480px; max-width: 90vw; height: 100%;
  z-index: 1056; background: #fff;
  box-shadow: -4px 0 16px rgba(0,0,0,.12);
  transform: translateX(100%);
  transition: transform .3s cubic-bezier(.2,1,.1,1);
  display: flex; flex-direction: column;
}
.preview-drawer.open { transform: translateX(0); }
.preview-drawer.dark-theme { background: #13171d; }
.preview-drawer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 18px; border-bottom: 1px solid #eaecef; flex-shrink: 0;
}
.dark-theme .preview-drawer-header { border-bottom-color: #30363d; }
.preview-drawer-title { font-size: .9rem; font-weight: 600; color: #333; }
.dark-theme .preview-drawer-title { color: #c9d1d9; }
.preview-drawer-close { font-size: 1.3rem; color: #888; cursor: pointer; padding: 4px; border-radius: 4px; transition: .2s; }
.preview-drawer-close:hover { color: #333; background: #eaecef; }
.dark-theme .preview-drawer-close:hover { color: #c9d1d9; background: #21262d; }
.preview-drawer-body { flex: 1; overflow-y: auto; padding: 18px; font-size: .85rem; line-height: 1.7; word-wrap: break-word; user-select: auto; }

/* 动画 */
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.spinning { display: inline-block; animation: spin 1s linear infinite; }
@keyframes dotPulse { 0%,80%,100% { opacity: 0; } 40% { opacity: 1; } }
.ai-dot-pulse { font-size: 1.5rem; animation: dotPulse 1.4s infinite both; }
</style>

<style>
/* 与待办描述区 (.todo-description) 完全一致的渲染方式 */
.preview-drawer-content {
  word-wrap: break-word;
  zoom: 89%;
  user-select: auto;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 21px;
}
.preview-drawer-content h1 { font-size: 1.5em; font-weight: bold; margin: 0.5em 0; }
.preview-drawer-content h2 { font-size: 1.3em; font-weight: bold; margin: 0.5em 0; }
.preview-drawer-content h3 { font-size: 1.15em; font-weight: bold; margin: 0.4em 0; }
.preview-drawer-content p { margin: 0.3em 0; }
.preview-drawer-content ul,
.preview-drawer-content ol { padding-left: 1.5em; margin: 0.3em 0; }
</style>
