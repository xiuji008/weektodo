<template>
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
    <div
      class="weekly-summary-body"
      @dblclick="openEditModal"
    >
      <div v-if="hasContent" class="summary-excerpt" @click="openPreviewDrawer">
        <span class="summary-excerpt-text">{{ excerpt }}</span>
        <span class="summary-excerpt-more">{{ $t("ui.clickToPreview") }}</span>
      </div>
      <div v-else class="summary-empty">
        <i class="bi-pencil me-1"></i>
        {{ $t("ui.clickToAddSummary") }}
      </div>
    </div>

    <!-- ========== 编辑弹框（Bootstrap Modal） ========== -->
    <div
      class="modal fade"
      :id="modalId"
      tabindex="-1"
      aria-hidden="true"
      data-bs-backdrop="static"
    >
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              {{ $t("ui.week") }} {{ weekNumber }} {{ $t("ui.summary") }}
            </h5>
            <i class="bi-x close-modal" data-bs-dismiss="modal"></i>
          </div>
          <div class="modal-body p-0">
            <textarea
              class="summary-modal-textarea"
              v-model="editContent"
              :placeholder="$t('todoDetails.notes')"
              ref="modalTextarea"
            ></textarea>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-sm py-1 px-3 border"
              @click="generateWithAi"
              :disabled="aiGenerating || !aiReady"
              :title="!aiReady ? $t('ui.aiNotConfiguredHint') : ''"
            >
              <i v-if="aiGenerating" class="bi-arrow-repeat me-1 spinning"></i>
              <i v-else class="bi-stars me-1"></i>
              {{ aiGenerating ? $t("ui.aiGenerating") : $t("ui.aiGenerate") }}
            </button>
            <button
              type="button"
              class="btn btn-sm py-1 px-3 border"
              data-bs-dismiss="modal"
            >
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
          class="preview-drawer-body markdown-body"
          v-html="renderedContent"
        ></div>
      </div>
    </teleport>
  </div>
</template>

<script>
import MarkdownIt from "markdown-it";
import moment from "moment";
import markdownTargetBlankLinks from "../helpers/markdownTargetBlankLinks";
import weeklySummaryRepository from "../repositories/weeklySummaryRepository";
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
      aiGenerating: false,
      md: new MarkdownIt(),
    };
  },
  computed: {
    darkTheme() {
      return this.$store.getters.config.darkTheme;
    },
    modalId() {
      return `weeklySummaryModal_${this.weekLabel.replace(/\W/g, "_")}`;
    },
    hasContent() {
      return this.content && this.content.trim().length > 0;
    },
    excerpt() {
      if (!this.hasContent) return "";
      const text = this.content.replace(/[[\]*_`\n\r()>|~\-\\]/g, " ").replace(/\s+/g, " ").trim();
      return text.length > 80 ? text.slice(0, 80) + "…" : text;
    },
    renderedContent() {
      return this.md.render(this.content);
    },
    aiReady() {
      return aiConfigRepository.isConfigured();
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
    loadContent() {
      this.content = weeklySummaryRepository.load(this.weekLabel);
    },
    openEditModal() {
      this.editContent = this.content;
      this.$nextTick(() => {
        const el = document.getElementById(this.modalId);
        if (el) {
          const modal = new Modal(el);
          modal.show();
          setTimeout(() => {
            const ta = this.$refs.modalTextarea;
            if (ta) {
              ta.style.height = "auto";
              ta.style.height = Math.max(300, ta.scrollHeight) + "px";
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
    generateWithAi() {
      if (this.aiGenerating) return;
      this.aiGenerating = true;

      // 从 weekLabel (2026_W27) 解析年份和周号，获取本周的日期范围
      const parts = this.weekLabel.match(/(\d+)_W(\d+)/);
      if (!parts) { this.aiGenerating = false; return; }
      const weekMonday = moment().isoWeekYear(parseInt(parts[1])).isoWeek(parseInt(parts[2])).startOf("isoWeek");

      const weekDates = [];
      for (let i = 0; i < 7; i++) {
        weekDates.push(weekMonday.clone().add(i, "d").format("YYYYMMDD"));
      }

      // 从 store 中收集本周所有待办任务
      const allLists = this.$store.getters.todoLists || {};
      let taskText = "";
      weekDates.forEach((dateId) => {
        const tasks = allLists[dateId];
        if (tasks && tasks.length > 0) {
          const dateLabel = weekMonday.clone().add(weekDates.indexOf(dateId), "d").format("dddd MM/DD");
          taskText += `\n### ${dateLabel}\n`;
          tasks.forEach((t) => {
            const status = t.checked || t.status === "done" ? "[x]" : "[ ]";
            let line = `- ${status} ${t.text}`;
            if (t.time) line += ` (${t.time})`;
            if (t.color && t.color !== "none") line += ` [标签]`;
            taskText += line + "\n";
          });
        } else {
          const dateLabel = weekMonday.clone().add(weekDates.indexOf(dateId), "d").format("dddd MM/DD");
          taskText += `\n### ${dateLabel}\n- (无任务)\n`;
        }
      });

      const userMessage = `请根据以下本周待办清单，生成一份详细的周报总结：\n\n${taskText}`;

      aiService.chat({ userMessage }).then((result) => {
        this.aiGenerating = false;
        if (result.ok) {
          this.editContent = result.content;
          this.$nextTick(() => {
            const ta = this.$refs.modalTextarea;
            if (ta) {
              ta.style.height = "auto";
              ta.style.height = Math.max(300, ta.scrollHeight) + "px";
            }
          });
        } else {
          alert("AI 生成失败：" + (result.error || "未知错误"));
        }
      });
    },
  },
};
</script>

<style scoped>
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

.dark-theme .summary-title {
  color: #8b949e;
}

.summary-actions {
  display: flex;
  gap: 6px;
}

.summary-action-icon {
  font-size: 0.9rem;
  color: #aaa;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: 0.2s;
}

.summary-action-icon:hover {
  color: #333;
  background: #eaecef;
}

.dark-theme .summary-action-icon:hover {
  color: #c9d1d9;
  background: #21262d;
}

/* 内容摘要 */
.weekly-summary-body {
  margin-top: 2px;
  cursor: pointer;
}

.summary-excerpt {
  font-size: 0.78rem;
  line-height: 1.5;
  color: #555;
  padding: 2px 0;
}

.dark-theme .summary-excerpt {
  color: #8b949e;
}

.summary-excerpt-text {
  word-break: break-all;
}

.summary-excerpt-more {
  color: #0969da;
  margin-left: 4px;
  white-space: nowrap;
}

.dark-theme .summary-excerpt-more {
  color: #58a6ff;
}

.summary-empty {
  font-size: 0.78rem;
  color: #aaa;
  padding: 2px 0;
  cursor: pointer;
}

.summary-empty:hover {
  color: #666;
}

.dark-theme .summary-empty {
  color: #555;
}

.dark-theme .summary-empty:hover {
  color: #8b949e;
}

/* 编辑弹框 textarea */
:deep(.summary-modal-textarea) {
  width: 100%;
  min-height: 300px;
  font-size: 0.85rem;
  line-height: 1.6;
  padding: 16px;
  border: none;
  resize: vertical;
  background: #fff;
  color: #24292f;
  outline: none;
  font-family: inherit;
}

.dark-theme :deep(.summary-modal-textarea) {
  background: #0d1117;
  color: #c9d1d9;
}

:deep(.modal-lg) {
  max-width: 720px;
}

/* 预览抽屉 */
.preview-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 1055;
  background: rgba(0, 0, 0, 0.3);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.25s ease, visibility 0.25s ease;
}

.preview-drawer-overlay.visible {
  opacity: 1;
  visibility: visible;
}

.preview-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 480px;
  max-width: 90vw;
  height: 100%;
  z-index: 1056;
  background: #fff;
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.12);
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.2, 1, 0.1, 1);
  display: flex;
  flex-direction: column;
}

.preview-drawer.open {
  transform: translateX(0);
}

.preview-drawer.dark-theme {
  background: #13171d;
}

.preview-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid #eaecef;
  flex-shrink: 0;
}

.dark-theme .preview-drawer-header {
  border-bottom-color: #30363d;
}

.preview-drawer-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #333;
}

.dark-theme .preview-drawer-title {
  color: #c9d1d9;
}

.preview-drawer-close {
  font-size: 1.3rem;
  color: #888;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: 0.2s;
}

.preview-drawer-close:hover {
  color: #333;
  background: #eaecef;
}

.dark-theme .preview-drawer-close:hover {
  color: #c9d1d9;
  background: #21262d;
}

.preview-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
  font-size: 0.85rem;
  line-height: 1.7;
  word-wrap: break-word;
  user-select: auto;
}

.preview-drawer-body :deep(h1),
.preview-drawer-body :deep(h2),
.preview-drawer-body :deep(h3),
.preview-drawer-body :deep(h4) {
  margin: 16px 0 8px;
}

.preview-drawer-body :deep(h1) { font-size: 1.4rem; }
.preview-drawer-body :deep(h2) { font-size: 1.2rem; }
.preview-drawer-body :deep(h3) { font-size: 1.05rem; }

.preview-drawer-body :deep(p) {
  margin: 6px 0;
}

.preview-drawer-body :deep(ul),
.preview-drawer-body :deep(ol) {
  padding-left: 22px;
  margin: 6px 0;
}

.preview-drawer-body :deep(blockquote) {
  border-left: 3px solid #d0d7de;
  margin: 8px 0;
  padding: 4px 12px;
  color: #656d76;
  background: #f6f8fa;
  border-radius: 0 4px 4px 0;
}

.dark-theme .preview-drawer-body :deep(blockquote) {
  border-left-color: #30363d;
  color: #8b949e;
  background: #0d1117;
}

.preview-drawer-body :deep(code) {
  background: #eaecef;
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 0.8rem;
}

.dark-theme .preview-drawer-body :deep(code) {
  background: #21262d;
  color: #c9d1d9;
}

.preview-drawer-body :deep(pre) {
  background: #f6f8fa;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  border: 1px solid #eaecef;
}

.dark-theme .preview-drawer-body :deep(pre) {
  background: #0d1117;
  border-color: #30363d;
}

.preview-drawer-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
}

.preview-drawer-body :deep(th),
.preview-drawer-body :deep(td) {
  border: 1px solid #d0d7de;
  padding: 6px 10px;
  text-align: left;
}

.dark-theme .preview-drawer-body :deep(th),
.dark-theme .preview-drawer-body :deep(td) {
  border-color: #30363d;
}

.preview-drawer-body :deep(img) {
  max-width: 100%;
  border-radius: 4px;
}

.preview-drawer-body :deep(hr) {
  border: none;
  border-top: 1px solid #eaecef;
  margin: 12px 0;
}

.dark-theme .preview-drawer-body :deep(hr) {
  border-top-color: #30363d;
}

/* AI 生成按钮旋转动画 */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.spinning {
  display: inline-block;
  animation: spin 1s linear infinite;
}
</style>
