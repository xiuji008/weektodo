<template>
  <div>
    <div class="modal fade" id="s3HistoryModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi-clock-history me-2"></i>{{ $t("settings.s3History") }}
            </h5>
            <i class="bi-x close-modal" data-bs-dismiss="modal"></i>
          </div>
          <div class="modal-body">
            <!-- 操作按钮 -->
            <div class="d-flex gap-2 mb-3">
              <button type="button" class="btn btn-sm py-1 px-3 border"
                @click="saveSnapshot" :disabled="busy">
                <i class="bi-cloud-plus me-1"></i>{{ $t("settings.s3HistorySave") }}
              </button>
              <button type="button" class="btn btn-sm py-1 px-3 border"
                @click="refreshVersions" :disabled="busy">
                <i class="bi-arrow-clockwise me-1"></i>{{ $t("settings.s3HistoryRefresh") }}
              </button>
            </div>

            <!-- 状态信息 -->
            <div v-if="statusMessage" class="alert py-2 px-3 mb-2 small" :class="statusClass" role="alert">
              {{ statusMessage }}
            </div>

            <!-- 加载中 -->
            <div v-if="loading" class="text-center py-4">
              <div class="spinner-border spinner-border-sm me-2" role="status"></div>
              {{ $t("settings.s3HistoryLoading") }}
            </div>

            <!-- 空状态 -->
            <div v-else-if="versions.length === 0" class="text-center text-muted py-4">
              <i class="bi-inbox" style="font-size: 2rem; display: block; margin-bottom: 8px;"></i>
              {{ $t("settings.s3HistoryEmpty") }}
            </div>

            <!-- 版本列表 -->
            <div v-else class="history-list">
              <div v-for="(ver, index) in versions" :key="index"
                class="history-item d-flex align-items-center justify-content-between px-3 py-2 mb-1">
                <div class="d-flex align-items-center gap-2">
                  <i class="bi-file-earmark-text text-muted"></i>
                  <span class="small">{{ ver.label || ver.createdAt }}</span>
                </div>
                <div class="d-flex gap-2">
                  <button type="button" class="btn btn-sm py-0 px-2 btn-outline-primary"
                    @click="confirmRestore(ver)" :disabled="busy">
                    <i class="bi-cloud-download me-1"></i>{{ $t("settings.s3HistoryRestore") }}
                  </button>
                  <button type="button" class="btn btn-sm py-0 px-2 btn-outline-danger"
                    @click="confirmDelete(ver)" :disabled="busy">
                    <i class="bi-trash me-1"></i>{{ $t("settings.s3HistoryDelete") }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 恢复确认弹窗 -->
    <comfirm-modal
      id="s3HistoryRestoreConfirm"
      :title="$t('settings.s3HistoryRestore')"
      :text="$t('settings.s3HistoryRestoreConfirm')"
      :ico="'bi-cloud-download'"
      :okText="$t('settings.s3HistoryRestore')"
      @on-ok="doRestore"
    ></comfirm-modal>

    <!-- 删除确认弹窗 -->
    <comfirm-modal
      id="s3HistoryDeleteConfirm"
      :title="$t('settings.s3HistoryDelete')"
      :text="$t('settings.s3HistoryDeleteConfirm')"
      :ico="'bi-trash'"
      :okText="$t('settings.s3HistoryDelete')"
      @on-ok="doDelete"
    ></comfirm-modal>

    <!-- Toast -->
    <div class="position-fixed bottom-0 end-0 p-3" style="z-index: 1056">
      <toast-message ref="s3HistoryToast" id="s3HistoryToast" :text="toastText"></toast-message>
    </div>
  </div>
</template>

<script>
import s3SyncHistory from "../helpers/s3SyncHistory";
import comfirmModal from "../components/comfirmModal.vue";
import toastMessage from "../components/toastMessage.vue";
import { Modal, Toast } from "bootstrap";

export default {
  name: "s3HistoryModal",
  components: { comfirmModal, toastMessage },
  data() {
    return {
      versions: [],
      loading: false,
      busy: false,
      statusMessage: "",
      statusClass: "",
      toastText: "",
      pendingVersion: null,
    };
  },
  mounted() {
    const modalEl = document.getElementById("s3HistoryModal");
    if (modalEl) {
      modalEl.addEventListener("shown.bs.modal", this.refreshVersions);
    }
  },
  beforeUnmount() {
    const modalEl = document.getElementById("s3HistoryModal");
    if (modalEl) {
      modalEl.removeEventListener("shown.bs.modal", this.refreshVersions);
    }
  },
  methods: {
    open: function () {
      const modalEl = document.getElementById("s3HistoryModal");
      if (modalEl) {
        let modal = Modal.getInstance(modalEl);
        if (!modal) modal = new Modal(modalEl);
        modal.show();
      }
      this.refreshVersions();
    },

    refreshVersions: async function () {
      this.loading = true;
      this.clearStatus();
      const result = await s3SyncHistory.listVersions();
      this.loading = false;
      if (result.ok) {
        this.versions = result.versions || [];
      } else {
        this.setStatus(this.$t("settings.s3HistoryLoadFailed"), "alert-danger");
        this.versions = [];
      }
    },

    saveSnapshot: async function () {
      this.busy = true;
      this.clearStatus();
      this.setStatus(this.$t("settings.s3HistorySaving"), "alert-info");
      const result = await s3SyncHistory.saveSnapshot();
      this.busy = false;
      if (result.ok) {
        this.setStatus(this.$t("settings.s3HistorySaveSuccess"), "alert-success");
        this.showToast(this.$t("settings.s3HistorySaveSuccess"));
        await this.refreshVersions();
      } else {
        this.setStatus(this.$t("settings.s3HistorySaveFailed") + ": " + (result.error || ""), "alert-danger");
        this.showToast(this.$t("settings.s3HistorySaveFailed"));
      }
    },

    confirmRestore: function (ver) {
      this.pendingVersion = ver;
      const modalEl = document.getElementById("s3HistoryRestoreConfirm");
      if (modalEl) {
        const modal = new Modal(modalEl);
        modal.show();
      }
    },

    doRestore: async function () {
      if (!this.pendingVersion) return;
      this.busy = true;
      this.clearStatus();
      this.setStatus(this.$t("settings.s3HistoryRestoring"), "alert-info");
      const result = await s3SyncHistory.restoreFromVersion(this.pendingVersion.key);
      this.busy = false;
      this.pendingVersion = null;
      if (result.ok) {
        this.setStatus(this.$t("settings.s3HistoryRestoreSuccess"), "alert-success");
        this.showToast(this.$t("settings.s3HistoryRestoreSuccess"));
        // 恢复成功后刷新页面
        setTimeout(function () { location.reload(); }, 1500);
      } else {
        this.setStatus(this.$t("settings.s3HistoryRestoreFailed") + ": " + (result.error || ""), "alert-danger");
        this.showToast(this.$t("settings.s3HistoryRestoreFailed"));
      }
    },

    confirmDelete: function (ver) {
      this.pendingVersion = ver;
      const modalEl = document.getElementById("s3HistoryDeleteConfirm");
      if (modalEl) {
        const modal = new Modal(modalEl);
        modal.show();
      }
    },

    doDelete: async function () {
      if (!this.pendingVersion) return;
      this.busy = true;
      this.clearStatus();
      const result = await s3SyncHistory.deleteVersion(this.pendingVersion.key);
      this.busy = false;
      this.pendingVersion = null;
      if (result.ok) {
        this.setStatus(this.$t("settings.s3HistoryDeleteSuccess"), "alert-success");
        this.showToast(this.$t("settings.s3HistoryDeleteSuccess"));
        await this.refreshVersions();
      } else {
        this.setStatus(this.$t("settings.s3HistoryDeleteFailed") + ": " + (result.error || ""), "alert-danger");
        this.showToast(this.$t("settings.s3HistoryDeleteFailed"));
      }
    },

    setStatus: function (message, alertClass) {
      this.statusMessage = message;
      this.statusClass = alertClass;
    },

    clearStatus: function () {
      this.statusMessage = "";
      this.statusClass = "";
    },

    showToast: function (text) {
      this.toastText = text;
      this.$nextTick(function () {
        const toastEl = document.getElementById("s3HistoryToast");
        if (toastEl) {
          const toast = new Toast(toastEl);
          toast.show();
        }
      });
    },
  },
};
</script>

<style scoped lang="scss">
@import "../assets/style/globalVars";

.history-list {
  max-height: 300px;
  overflow-y: auto;
}

.history-item {
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.02);

  .dark-theme & {
    background: rgba(255, 255, 255, 0.03);
  }

  &:hover {
    background: rgba(0, 0, 0, 0.04);

    .dark-theme & {
      background: rgba(255, 255, 255, 0.06);
    }
  }
}

.btn-outline-primary {
  color: $check-color;
  border-color: $check-color;

  &:hover {
    color: #fff;
    background: $check-color;
    border-color: $check-color;
  }

  .dark-theme & {
    color: $dt-check-color;
    border-color: $dt-check-color;

    &:hover {
      color: #fff;
      background: $dt-check-color;
      border-color: $dt-check-color;
    }
  }
}

.btn-outline-danger {
  .dark-theme & {
    color: #f85149;
    border-color: #f85149;

    &:hover {
      color: #fff;
      background: #f85149;
      border-color: #f85149;
    }
  }
}
</style>
