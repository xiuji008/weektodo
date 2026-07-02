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
</template>

<script>
import moment from "moment";
import toDoListRepository from "../repositories/toDoListRepository";
import customToDoListIdsRepository from "../repositories/customToDoListIdsRepository";
import notifications from "../helpers/notifications";
import tasksHelper from "../helpers/tasksHelper";
import { Solar, HolidayUtil } from 'lunar-javascript';
import { Toast } from 'bootstrap';

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
    }
  },
  computed: {
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
</style>