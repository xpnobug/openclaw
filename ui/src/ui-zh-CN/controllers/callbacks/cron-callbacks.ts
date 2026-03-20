import type { AgentsConfigProps } from "../../views/agents/types.js";
import {
  addCronJob,
  updateCronJob,
  toggleCronJob,
  runCronJob,
  removeCronJob,
  loadCronRuns,
  populateCronFormFromJob,
  DEFAULT_CRON_FORM,
} from "../cron-config.js";
/**
 * 定时任务 回调
 */
import type { CallbackContext } from "./types.js";

type Pick_ = Pick<
  AgentsConfigProps,
  | "onCronFormChange"
  | "onCronRefresh"
  | "onCronAdd"
  | "onCronUpdate"
  | "onCronToggle"
  | "onCronRun"
  | "onCronRemove"
  | "onCronLoadRuns"
  | "onCronExpandJob"
  | "onCronDeleteConfirm"
  | "onCronShowCreateModal"
  | "onCronEdit"
>;

export function createCronCallbacks(ctx: CallbackContext, extra: { loadCron: () => void }): Pick_ {
  const { s, update } = ctx;

  return {
    onCronFormChange: (patch) => {
      s.cronForm = { ...s.cronForm, ...patch };
      update();
    },
    onCronRefresh: () => extra.loadCron(),
    onCronAdd: async () => {
      await addCronJob(s);
      update();
    },
    onCronUpdate: async () => {
      await updateCronJob(s);
      update();
    },
    onCronToggle: async (job, enabled) => {
      await toggleCronJob(s, job, enabled);
      update();
    },
    onCronRun: async (job) => {
      await runCronJob(s, job);
      update();
    },
    onCronRemove: async (job) => {
      await removeCronJob(s, job);
      update();
    },
    onCronLoadRuns: async (jobId) => {
      await loadCronRuns(s, jobId);
      update();
    },
    onCronExpandJob: (jobId) => {
      s.cronExpandedJobId = jobId;
      update();
    },
    onCronDeleteConfirm: (jobId) => {
      s.cronDeleteConfirmJobId = jobId;
      update();
    },
    onCronShowCreateModal: (show) => {
      s.cronShowCreateModal = show;
      if (show) {
        s.cronEditJobId = null;
        s.cronForm = { ...DEFAULT_CRON_FORM, agentId: s.selectedAgentId ?? "" };
      }
      update();
    },
    onCronEdit: (job) => {
      populateCronFormFromJob(s, job);
      update();
    },
  };
}
