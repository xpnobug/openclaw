import type { AgentsConfigProps } from "../../views/agents/types.js";
import {
  loadAgentSessions,
  patchSessionModel,
  createSession,
  deleteSession,
} from "../model-config.js";
/**
 * 会话管理 回调
 */
import type { CallbackContext } from "./types.js";

type Pick_ = Pick<
  AgentsConfigProps,
  | "onAgentSessionsRefresh"
  | "onAgentSessionModelChange"
  | "onAgentSessionNavigate"
  | "onAgentSessionDelete"
  | "onAgentSessionCreateShow"
  | "onAgentSessionCreateNameChange"
  | "onAgentSessionCreateModelChange"
  | "onAgentSessionCreate"
>;

export function createSessionCallbacks(ctx: CallbackContext): Pick_ {
  const { s, update } = ctx;

  return {
    onAgentSessionsRefresh: () => {
      loadAgentSessions(s, s.selectedAgentId ?? undefined).then(update);
    },
    onAgentSessionModelChange: (sessionKey, model) => {
      patchSessionModel(s, sessionKey, model, s.selectedAgentId ?? undefined).then(update);
    },
    onAgentSessionNavigate: (sessionKey) => {
      const el = document.querySelector("openclaw-config-zh");
      el?.dispatchEvent(
        new CustomEvent("session-navigate", {
          detail: { sessionKey },
          bubbles: true,
          composed: true,
        }),
      );
    },
    onAgentSessionDelete: (sessionKey) => {
      deleteSession(s, sessionKey, s.selectedAgentId ?? undefined).then(update);
    },
    onAgentSessionCreateShow: (show) => {
      s.sessionCreateShow = show;
      if (show) {
        s.sessionCreateName = "";
        s.sessionCreateModel = null;
      }
      update();
    },
    onAgentSessionCreateNameChange: (name) => {
      s.sessionCreateName = name;
      update();
    },
    onAgentSessionCreateModelChange: (model) => {
      s.sessionCreateModel = model;
      update();
    },
    onAgentSessionCreate: async () => {
      if (!s.selectedAgentId || !s.sessionCreateName.trim()) {
        return;
      }
      s.sessionCreating = true;
      update();
      try {
        const result = await createSession(
          s,
          s.selectedAgentId,
          s.sessionCreateName,
          s.sessionCreateModel,
        );
        if (result.ok) {
          s.sessionCreateShow = false;
          s.sessionCreateName = "";
          s.sessionCreateModel = null;
        }
      } finally {
        s.sessionCreating = false;
        update();
      }
    },
  };
}
