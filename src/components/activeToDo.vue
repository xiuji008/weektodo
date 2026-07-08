<template>
  <div id="todo-item-active" class="todo-item" ref="currentTodo" draggable="true"
    @dragstart="startDrag($event, activeTodo.toDo, activeTodo.index)" @dragend="endDrag()" @wheel="movingWheel"
    :class="{ 'dragging': todoDragging }" @mouseleave="hideToDoItem">
    <div class="d-flex align-items-center">
      <!-- 状态圆点（颜色表示状态，点击切换） -->
      <span class="status-dot" :class="'status-dot-' + todoStatus" :title="statusText" @click.stop="cycleStatus"></span>

      <span class="noselect item-text" :class="{ 'checked-todo': activeTodo.toDo.checked }" style="flex-grow: 1"
        @click.middle="showToDoDetails" @dblclick.stop="editTodoItem">
        <span v-html="todoText"></span>
        <span class="priority-badge-popup" :class="'priority-' + activePriorityLevel" v-if="activePriorityLevel">{{ activePriorityLabel }}</span>
        <span class="time-details"> {{ timeFormat(activeTodo.toDo.time) }}
          <div class="alarm-indicator"
            :class="{ 'show-alarm-indicator': notificationIndicator && activeTodo.toDo.alarm }"></div>
        </span>
      </span>

      <!-- 状态切换按钮（下拉选择） -->
      <div class="status-dropdown" @mouseleave="onStatusDropdownLeave">
        <button class="status-btn" :class="'status-btn-' + todoStatus"
          @click.stop="toggleStatusMenu" @mouseenter="onStatusBtnHover" :title="statusText">
          <span class="status-btn-dot"></span>
          <span class="status-text">{{ statusText }}</span>
          <i class="bi-chevron-down status-btn-arrow"></i>
        </button>
        <div v-if="showStatusMenu" class="status-menu" @click.stop @mouseenter="onStatusMenuHover" @mouseleave="onStatusMenuLeave">
          <button class="status-menu-item" @click="setStatus('pending')">
            <span class="status-menu-dot status-dot-pending"></span>未完成
          </button>
          <button class="status-menu-item" @click="setStatus('in_progress')">
            <span class="status-menu-dot status-dot-in_progress"></span>进行中
          </button>
          <button class="status-menu-item" @click="setStatus('done')">
            <span class="status-menu-dot status-dot-done"></span>完成
          </button>
          <button class="status-menu-item" @click="setStatus('cancelled')">
            <span class="status-menu-dot status-dot-cancelled"></span>取消
          </button>
        </div>
        <!-- 桥接区域：消除按钮和下拉菜单之间的间隙，鼠标移动时不会丢失 -->
        <div v-if="showStatusMenu" class="status-menu-bridge" @mouseenter="onStatusMenuHover"></div>
      </div>

      <i class="bi-three-dots todo-item-menu" type="button" @click="showToDoDetails"></i>
      <i class="bi-x todo-item-remove" @click="removeTodo"></i>
    </div>

    <!-- 注释/备注 -->
    <div v-if="activeTodo.toDo.desc" class="todo-item-desc">
      <span class="todo-desc-text">{{ descText }}</span>
    </div>

    <div v-if="activeTodo.toDo.subTaskList && activeTodo.toDo.subTaskList.length > 0" class="todo-item-sub-tasks">
      <ul class="sub-tasks">
        <li v-for="(subTask, index) in activeTodo.toDo.subTaskList" :key="index" class="sub-task">
          <div class="d-flex flex-row mt-1" :class="{ 'checked-sub-task': subTask.checked }">
            <input class="form-check-input" type="checkbox" v-model="subTask.checked"
              @change="checkSubTask(subTask, index, $event)" />
            <label class="form-check-label" @click="checkSubTask(subTask, index, $event)">
              <span v-html="linkifyText(subTask.text)"></span>
            </label>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
import toDoListRepository from "../repositories/toDoListRepository";
import { Modal, Toast } from "bootstrap";
import moment from "moment";
import notifications from "../helpers/notifications";
import linkifyStr from 'linkify-string';
import tasksHelper from "../helpers/tasksHelper";

export default {
  components: {},
  props: {
    activeTodo: { required: true, type: Object }
  },
  data() {
    return {
      editing: false,
      todoDragHover: false,
      todoDragging: false,
      options: { target: '_blank', defaultProtocol: 'https' },
      scrollingTimeOut: null,
      showStatusMenu: false,
    };
  },
  methods: {
    removeTodo: function () {
      this.$store.commit("setUndoElement", { type: 'task', todo: this.activeTodo.toDo, index: this.activeTodo.index });
      this.$store.commit("removeTodo", { toDoListId: this.activeTodo.toDoListId, index: this.activeTodo.index, });
      notifications.refreshDayNotifications(this, this.activeTodo.toDoListId);
      toDoListRepository.update(this.activeTodo.toDoListId, this.$store.getters.todoLists[this.activeTodo.toDoListId]);
      let toast = new Toast(document.getElementById("taskRemoved"));
      toast.show();
      this.hideToDoItem();
    },
    editTodoItem: function () {
      if (typeof this.activeTodo.edit === 'function') {
        this.activeTodo.edit();
      }
    },
    showToDoDetails: function () {
      this.$store.commit("actionsSelectedTodoIdUpdate", {
        toDo: this.activeTodo.toDo,
        index: this.activeTodo.index,
      });

      let modal = new Modal(document.getElementById("toDoModal"), { keyboard: false });
      modal.show();
    },
    toggleStatus: function () {
      this.$store.commit("checkTodo", { toDoListId: this.activeTodo.toDoListId, index: this.activeTodo.index, });
      var id = this.activeTodo.toDoListId;
      var index = this.activeTodo.index;
      if (this.$store.getters.todoLists[id][index].checked && this.$store.getters.config.moveCompletedTaskToBottom) {
        this.$refs.currentTodo.style.display = `none`;
        this.$store.commit("moveTodoToEnd", { toDoListId: id, index: index, });
      }
      if (this.$store.getters.config.autoReorderTasks) {
        this.$refs.currentTodo.style.display = `none`;
        toDoListRepository.update(id, tasksHelper.reorderTasksList(this.$store.getters.todoLists[id]));
      } else {
        toDoListRepository.update(id, this.$store.getters.todoLists[id]);
      }
      notifications.refreshDayNotifications(this, this.activeTodo.toDoListId);
    },
    cycleStatus: function () {
      // 循环切换：未完成 -> 进行中 -> 完成 -> 取消 -> 未完成
      const order = ["pending", "in_progress", "done", "cancelled"];
      const current = this.todoStatus;
      const nextIndex = (order.indexOf(current) + 1) % order.length;
      this.setStatus(order[nextIndex]);
    },
    toggleStatusMenu: function () {
      this.showStatusMenu = !this.showStatusMenu;
      if (this.showStatusMenu) {
        this.showEmojiPicker = false;
        setTimeout(() => {
          document.addEventListener('click', this.closeStatusMenuOnOutside);
        }, 0);
      } else {
        document.removeEventListener('click', this.closeStatusMenuOnOutside);
      }
    },
    closeStatusMenuOnOutside: function (e) {
      const dropdown = this.$el.querySelector('.status-dropdown');
      if (dropdown && dropdown.contains(e.target)) return;
      this.showStatusMenu = false;
      document.removeEventListener('click', this.closeStatusMenuOnOutside);
    },
    onStatusBtnHover: function () {
      // 悬停在按钮上时保持菜单打开
      if (this.showStatusMenu) this._statusHovering = true;
    },
    onStatusMenuHover: function () {
      this._statusHovering = true;
    },
    onStatusMenuLeave: function () {
      this._statusHovering = false;
      // 短暂延迟后关闭，给鼠标移回按钮的时间
      setTimeout(() => {
        if (!this._statusHovering) {
          this.showStatusMenu = false;
          document.removeEventListener('click', this.closeStatusMenuOnOutside);
        }
      }, 200);
    },
    onStatusDropdownLeave: function () {
      this._statusHovering = false;
      setTimeout(() => {
        if (!this._statusHovering) {
          this.showStatusMenu = false;
          document.removeEventListener('click', this.closeStatusMenuOnOutside);
        }
      }, 200);
    },
    setStatus: function (status) {
      this.$store.commit("updateTodoStatus", {
        toDoListId: this.activeTodo.toDoListId,
        index: this.activeTodo.index,
        status: status,
      });
      const id = this.activeTodo.toDoListId;
      // 完成时移动到底部
      if (status === "done" && this.$store.getters.config.moveCompletedTaskToBottom) {
        this.$refs.currentTodo.style.display = `none`;
        this.$store.commit("moveTodoToEnd", { toDoListId: id, index: this.activeTodo.index, });
      }
      if (this.$store.getters.config.autoReorderTasks) {
        this.$refs.currentTodo.style.display = `none`;
        toDoListRepository.update(id, tasksHelper.reorderTasksList(this.$store.getters.todoLists[id]));
      } else {
        toDoListRepository.update(id, this.$store.getters.todoLists[id]);
      }
      notifications.refreshDayNotifications(this, this.activeTodo.toDoListId);
      // 关闭菜单并清理监听
      this.showStatusMenu = false;
      this._statusHovering = false;
      document.removeEventListener('click', this.closeStatusMenuOnOutside);
    },
    startDrag: function (event, item, index) {
      event.dataTransfer.dropEffect = "move";
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("item", JSON.stringify(item));
      event.dataTransfer.setData("index", index);
      event.dataTransfer.setDragImage(this.activeTodo.container, 0, 0);
      setTimeout(() => {
        this.$refs.currentTodo.style.display = `none`;
        this.todoDragging = true;
      }, 40);
      document.getElementById("app-container").classList.add("dragging-item");
    },
    endDrag: function () {
      this.todoDragging = false;
      document.getElementById("app-container").classList.remove("dragging-item");
    },
    onDragenter: function () {
      this.todoDragHover = true;
    },
    onDragleave: function () {
      this.todoDragHover = false;
    },
    checkSubTask: function (subTask, index, e) {
      if (e.target.href) return;

      if (!e.target.value) subTask.checked = !subTask.checked;
      var todoList = this.activeTodo.toDo.subTaskList;
      if (subTask.checked && this.moveSubtaskToBotttom) { todoList.push(todoList.splice(index, 1)[0]); }
      toDoListRepository.update(this.activeTodo.toDoListId, this.$store.getters.todoLists[this.activeTodo.toDoListId]);
    },
    timeFormat: function (date) {
      if (date) {
        return moment(date, "HH:mm").format("HH:mm");
      }
    },

    linkifyText: function (text) {
      return linkifyStr(text, this.options);
    },
    hideToDoItem: function () {
      this.$refs.currentTodo.style.display = `none`;
    },
    movingWheel() {
      this.$refs.currentTodo.style.display = `none`;
      this.$refs.currentTodo.classList.add("scrolling");
      document.getElementById("app-container").classList.add("scrolling");
      if (this.scrollingTimeOut != null) return;

      this.scrollingTimeOut = setTimeout(() => {
        this.scrollingTimeOut = null;
        document.onmousemove = function () {
          document.onmousemove = null;
          document.getElementById("todo-item-active").classList.remove("scrolling");
          document.getElementById("app-container").classList.remove("scrolling");
        }
      }, 400);
    }
  },
  unmounted() {
    document.removeEventListener('click', this.closeStatusMenuOnOutside);
  },
  computed: {
    todoText: function () {
      return linkifyStr(this.activeTodo.toDo.text, this.options);
    },
    descText: function () {
      const desc = this.activeTodo.toDo.desc;
      if (!desc) return "";
      // 截取前 120 字符作为预览
      const trimmed = desc.replace(/[#*_`>[\]-]/g, "").replace(/\s+/g, " ").trim();
      return trimmed.length > 120 ? trimmed.slice(0, 120) + "…" : trimmed;
    },
    notificationIndicator: function () {
      return this.$store.getters.config.notificationIndicator;
    },
    moveSubtaskToBotttom: function () {
      return this.$store.getters.config.moveCompletedSubTaskToBottom;
    },
    todoStatus: function () {
      const todo = this.activeTodo.toDo;
      if (todo.status) return todo.status;
      // 兼容旧数据：根据 checked 推断
      return todo.checked ? "done" : "pending";
    },
    firstChar: function () {
      const text = (this.activeTodo.toDo.text || "").trim();
      if (!text) return "?";
      return text.charAt(0).toUpperCase();
    },
    activePriorityLevel: function () {
      return this.activeTodo.toDo.priorityLevel || "L3";
    },
    activePriorityLabel: function () {
      const labels = { L1: "紧急", L2: "重要", L3: "常规", L4: "宽松", L5: "待定" };
      return labels[this.activePriorityLevel] || "";
    },
    statusText: function () {
      const map = {
        pending: "未完成",
        in_progress: "进行中",
        done: "完成",
        cancelled: "取消",
      };
      return map[this.todoStatus] || "未完成";
    },
  }
};
</script>

<style scoped lang="scss">
.todo-item {
  background-color: #ffffff;
  color: #1e1e1e;
  border-radius: 7px;
  position: relative;
  box-shadow: 0px 2px 13px 0px rgba(0, 0, 0, 0.15);
  z-index: 6;
  position: absolute;
  display: none;

  &:hover {
    display: block;
  }

  * {
    transition: all 0.4s cubic-bezier(0.2, 1, 0.1, 1) 0s;
    pointer-events: all;
  }

  .dark-theme & {
    box-shadow: 0 0px 0 1px #4c4c4c;
    background-color: #21262d;
    color: #f7f7f7;
    box-shadow: 0px 2px 5px 0px rgba(0, 0, 0, 0.1);
  }

  .item-text {
    white-space: unset;
    word-break: normal;
    height: unset;
    overflow-wrap: break-word;
    word-wrap: break-word;
    z-index: 1;
  }
}

.todo-item.scrolling {
  display: none !important;
}

.item-text {
  transition: width 2s, height 2s, transform 2s;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  width: 1rem;
  height: 1.2rem;
  line-height: 1.3rem;
  font-size: 0.865rem;
  margin: 2px 0px 2px 0px;
  padding: 0 3px 0 7px;
}

.item-time {
  transition: width 2s, height 2s, transform 2s;
  height: 1.2rem;
  line-height: 1.3rem;
  font-size: 0.865rem;
  margin: 2px 0px 2px 0px;
  padding: 0 7px 0 0px;
  opacity: 0.6;
}

.item-time.checked-todo {
  opacity: unset;
}

.time-details {
  opacity: 0.6;
  display: inline;
  margin-left: 5px;
}

.todo-item.checked-todo .time-details {
  opacity: unset;
}

.checked-todo {
  color: #acacac;
  text-decoration: line-through;

  .dark-theme & {
    color: #636363;
  }
}

.checked-sub-task {
  color: #c4c4c4;
  text-decoration: line-through;

  .dark-theme & {
    color: #3a3a40;
  }

  input {
    opacity: 0.5;
  }
}

.todo-item-remove {
  font-size: 1.3rem;
  cursor: pointer;
  margin-top: 1px;
  margin-left: 5px;
  margin-right: 5px;
  color: grey;
  height: 1.3rem;
  flex-grow: 0;
}

.todo-item-menu {
  font-size: 1rem;
  cursor: pointer;
  margin-top: 3px;
  margin-left: 5px;
  margin-right: 0px;
  color: grey;
  height: 1.1rem;
  flex-grow: 0;
}

.todo-item-remove:hover,
.todo-item-menu:hover {
  color: black;
}

.dark-theme .todo-item-remove,
.dark-theme .todo-item-menu {
  color: #c9d1d9;
}

.dark-theme .todo-item-remove:hover,
.dark-theme .todo-item-menu:hover {
  color: white;
}

.drag-hover {
  color: rgba(157, 157, 157, 0.43);
  box-shadow: rgb(244, 243, 243) 0px 0px 4px 1px inset;
  background-color: rgb(250, 249, 249);
}

.dark-theme .drag-hover {
  color: rgb(69, 69, 69);
  box-shadow: #0b0d12 0px 0px 4px 1px inset;
  background-color: #0c0d14;
}

.dragging.todo-item {
  display: none;
}

/* 注释/备注预览 */
.todo-item-desc {
  margin: 2px 10px 4px;
  padding: 4px 8px;
  background: #f6f8fa;
  border-radius: 4px;
  font-size: 0.78rem;
  line-height: 1.5;
  color: #656d76;
}
.dark-theme .todo-item-desc {
  background: #161b22;
  color: #8b949e;
}
.todo-desc-text {
  word-wrap: break-word;
}

.sub-tasks {
  list-style: none;
  padding: 0px;
  font-size: 0.865rem;

  li {
    margin: 0px 10px 0px 10px;
  }

  li:last-child {
    margin: 0px 10px 10px 10px;
  }

  input {
    min-width: 14px;
    width: 14px;
    min-height: 14px;
    height: 14px;
    margin-right: 8px;
  }

  label {
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
}

.cicle-icon {
  font-size: 10px;
  margin-right: 5px;
}

/* 优先级徽章（悬浮面板） */
.priority-badge-popup {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 600;
  padding: 0 6px;
  margin-left: 6px;
  border-radius: 3px;
  line-height: 1.5;
  vertical-align: middle;
}

.bi-check-circle-fill,
.bi-check-circle {
  opacity: 0.7;
}

/* 状态圆点（纯色，无文字） */
.status-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  min-width: 12px;
  border-radius: 50%;
  margin-left: 6px;
  margin-right: 4px;
  flex-shrink: 0;
  cursor: pointer;
}
.status-dot-pending { background-color: #dc3545; }
.status-dot-in_progress { background-color: #0d6efd; }
.status-dot-done { background-color: #28a745; }
.status-dot-cancelled { background-color: #fd7e14; }

/* 优先级徽章颜色 */
.priority-L1 { background: #dc3545; color: #fff; }
.priority-L2 { background: #fd7e14; color: #fff; }
.priority-L3 { background: #0d6efd; color: #fff; }
.priority-L4 { background: #28a745; color: #fff; }
.priority-L5 { background: #6c757d; color: #fff; }
.dark-theme .priority-L1 { background: #e35d6b; }
.dark-theme .priority-L2 { background: #ff9f43; }
.dark-theme .priority-L3 { background: #4d9bff; }
.dark-theme .priority-L4 { background: #51cf66; }
.dark-theme .priority-L5 { background: #868e96; }

/* 状态切换按钮（中文 + 颜色） */
.status-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  padding: 2px 10px;
  margin: 0 4px;
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  flex-grow: 0;
  white-space: nowrap;
  background: transparent;

  .status-btn-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-text {
    font-weight: 500;
  }
}

/* 未完成 - 红色 */
.status-btn-pending {
  color: #dc3545;
  border-color: #dc3545;
  .status-btn-dot { background-color: #dc3545; }
  &:hover { background-color: #dc3545; color: #fff; }
}
/* 进行中 - 蓝色 */
.status-btn-in_progress {
  color: #fff;
  background-color: #0d6efd;
  border-color: #0d6efd;
  .status-btn-dot { background-color: #fff; }
  &:hover { background-color: #0b5ed7; border-color: #0a58ca; }
}
/* 完成 - 绿色 */
.status-btn-done {
  color: #fff;
  background-color: #28a745;
  border-color: #28a745;
  .status-btn-dot { background-color: #fff; }
  &:hover { background-color: #218838; border-color: #1e7e34; }
}
/* 取消 - 橘色 */
.status-btn-cancelled {
  color: #fff;
  background-color: #fd7e14;
  border-color: #fd7e14;
  .status-btn-dot { background-color: #fff; }
  &:hover { background-color: #e8710a; border-color: #ca6510; }
}

.status-btn-arrow {
  font-size: 0.65rem;
  margin-left: 2px;
}

/* 状态下拉菜单 */
.status-dropdown {
  position: relative;
  flex-grow: 0;
}

.status-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: #fff;
  border: 1px solid #eaecef;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 10;
  min-width: 110px;
  overflow: hidden;
  padding: 4px 0;

  .dark-theme & {
    background: #21262d;
    border-color: #30363d;
  }
}

/* 桥接区域：覆盖按钮和菜单之间的间隙，防止鼠标移动时丢失 */
.status-menu-bridge {
  position: absolute;
  top: 100%;
  right: 0;
  width: 100%;
  height: 6px;
  z-index: 9;
}

.status-menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: transparent;
  font-size: 0.78rem;
  color: #1e1e1e;
  cursor: pointer;
  text-align: left;

  &:hover {
    background-color: #f8f9fa;
  }

  .dark-theme & {
    color: #c9d1d9;

    &:hover {
      background-color: #30363d;
    }
  }
}

.status-menu-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
