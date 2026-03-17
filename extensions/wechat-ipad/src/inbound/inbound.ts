import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AgentMediaPayload,
  OpenClawConfig,
  PluginRuntime,
} from "openclaw/plugin-sdk/wechat-ipad";
import {
  buildAgentMediaPayload,
  detectMime,
  extensionForMime,
} from "openclaw/plugin-sdk/wechat-ipad";
import {
  downloadFileViaApi,
  downloadImageViaApi,
  downloadVideoViaApi,
  downloadVideoViaToolsApi,
  downloadVoiceViaApi,
  downloadVoiceViaToolsApi,
  fetchContactDetailViaApi,
  friendPassVerifyViaApi,
  parseCardXml,
  parseEmojiXml,
  parseFileXml,
  parseFriendVerifyXml,
  parseLocationXml,
  parseNewMemberXml,
  parsePatXml,
  parseRevokeMsgXml,
  parseImageXml,
  parseVideoXml,
  parseVoiceXml,
} from "../api/api.js";
import {
  getWechatIpadContact,
  getWechatIpadLoginSession,
  getWechatIpadMessageStore,
  isWechatIpadContactStale,
  setWechatIpadContact,
} from "../infra/runtime.js";
import { sendWechatIpadText } from "../outbound/send.js";
import type { WechatIpadInboundMessage } from "../types.js";

export type WechatIpadInboundContext = {
  cfg: OpenClawConfig;
  runtime: PluginRuntime;
  accountId: string;
  baseUrl: string;
  apiToken: string;
  robotId: string;
  wxid?: string;
  allowFrom?: string[];
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  groupPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  commandAllowFrom?: string[];
  safetyPrefix?: string;
  requireMention?: boolean;
  log?: (message: string) => void;
};

function emitWechatIpadLog(
  deps: Pick<WechatIpadInboundContext, "runtime" | "log">,
  message: string,
): void {
  if (typeof deps.log === "function") {
    deps.log(message);
    return;
  }
  const runtimeWithOptionalLog = deps.runtime as PluginRuntime & {
    log?: (message: string) => void;
  };
  runtimeWithOptionalLog.log?.(message);
}

function normalizeIdentity(entry: string): string {
  return entry
    .trim()
    .replace(/^(wechat-ipad|wechat|wx):/i, "")
    .toLowerCase();
}

function formatQuotedMessageFallbackPrefix(
  quotedMessage?: WechatIpadInboundMessage["quotedMessage"],
): string {
  if (!quotedMessage?.quotedBody?.trim()) {
    return "";
  }

  const sender =
    quotedMessage.quotedSender?.trim() || quotedMessage.quotedSenderWxid?.trim() || "原消息";
  const body = quotedMessage.quotedBody.trim();
  const preview = body.length > 120 ? `${body.slice(0, 120)}…` : body;
  return `【引用 ${sender}】\n${preview}\n\n`;
}

function buildLogPrefix(accountId: string): string {
  return `wechat-ipad[${accountId}]`;
}

/**
 * 将 wxid 解析为 `备注名(wxid)` 或 `昵称(wxid)` 或 `wxid` 格式。
 * 优先读缓存，缓存未命中或过期时触发一次 API 查询；查询失败不阻塞。
 */
async function resolveContactLabel(wxid: string, deps: WechatIpadInboundContext): Promise<string> {
  // 1. 查缓存
  const cached = getWechatIpadContact(deps.accountId, wxid);
  if (cached && !isWechatIpadContactStale(cached)) {
    const label = cached.remark || cached.nickname;
    return label ? `${label}(${wxid})` : wxid;
  }

  // 2. 异步获取（失败返回 wxid）
  try {
    const resolvedWxid =
      deps.wxid?.trim() || getWechatIpadLoginSession(deps.accountId)?.wxid?.trim() || deps.robotId;
    const chatRoom = wxid.endsWith("@chatroom") ? wxid : undefined;
    const contacts = await fetchContactDetailViaApi({
      options: { baseUrl: deps.baseUrl, apiToken: deps.apiToken, robotId: deps.robotId },
      wxid: resolvedWxid,
      targetWxids: [wxid],
      chatRoom,
    });
    if (contacts.length > 0) {
      setWechatIpadContact(deps.accountId, contacts[0]!);
      const label = contacts[0]!.remark || contacts[0]!.nickname;
      return label ? `${label}(${wxid})` : wxid;
    }
  } catch {
    // 查询失败不阻塞
  }
  return wxid;
}

function formatChatTypeLabel(chatType: WechatIpadInboundMessage["chatType"]): string {
  return chatType === "group" ? "群聊" : "私聊";
}

function formatSenderLabel(msg: WechatIpadInboundMessage, senderId: string): string {
  const senderName = msg.senderName?.trim();
  return senderName ? `${senderName}(${senderId})` : senderId;
}

function formatMessagePreview(body: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return "空消息";
  }
  return collapsed.length > 60 ? `${collapsed.slice(0, 60)}…` : collapsed;
}

/**
 * 下载图片并保存到 agent 工作目录。
 * 任何步骤失败均记日志并返回 null，不阻塞消息处理。
 */
async function downloadAndSaveInboundImage(params: {
  msg: WechatIpadInboundMessage;
  deps: WechatIpadInboundContext;
  wxid: string;
  imageDir: string;
}): Promise<{ path: string; contentType: string } | null> {
  const { msg, deps, wxid, imageDir } = params;
  try {
    const parsed = parseImageXml(msg.body);
    if (!parsed) {
      emitWechatIpadLog(deps, `${buildLogPrefix(deps.accountId)}: 图片 XML 解析失败，跳过下载`);
      return null;
    }

    const { buffer, contentType: fallbackContentType } = await downloadImageViaApi({
      options: {
        baseUrl: deps.baseUrl,
        apiToken: deps.apiToken,
        robotId: deps.robotId,
      },
      wxid,
      aesKey: parsed.aesKey,
      cdnMidImgUrl: parsed.cdnMidImgUrl,
    });

    // 检测实际 MIME 类型
    const detectedMime = await detectMime({ buffer });
    const contentType = detectedMime ?? fallbackContentType;
    const ext = extensionForMime(contentType) ?? ".jpg";

    const contactId = msg.chatType === "group" ? msg.chatId : msg.senderId;
    const timestamp = Math.floor((msg.timestamp || Date.now()) / 1000);
    const msgId = msg.msgId ?? msg.id;
    const fileName = `${timestamp}_${msgId}${ext}`;
    const dir = join(imageDir, contactId);
    const filePath = join(dir, fileName);

    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, buffer);

    return { path: filePath, contentType };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitWechatIpadLog(deps, `${buildLogPrefix(deps.accountId)}: 图片下载/保存失败：${message}`);
    return null;
  }
}

/**
 * 下载语音并保存到 agent 工作目录。
 * 任何步骤失败均记日志并返回 null，不阻塞消息处理。
 */
async function downloadAndSaveInboundVoice(params: {
  msg: WechatIpadInboundMessage;
  deps: WechatIpadInboundContext;
  wxid: string;
  voiceDir: string;
}): Promise<{ path: string; contentType: string } | null> {
  const { msg, deps, wxid, voiceDir } = params;
  try {
    const parsed = parseVoiceXml(msg.rawContent ?? msg.body);
    if (!parsed) {
      emitWechatIpadLog(deps, `${buildLogPrefix(deps.accountId)}: 语音 XML 解析失败，跳过下载`);
      return null;
    }

    // 优先使用 /Tools/DownloadVoice（MsgId 分片方式），失败回退 CDN 端点
    let result: { buffer: Buffer; contentType: string; extension: string } | null = null;
    if (msg.msgId && parsed.bufid && parsed.totalLen > 0) {
      result = await downloadVoiceViaToolsApi({
        options: {
          baseUrl: deps.baseUrl,
          apiToken: deps.apiToken,
          robotId: deps.robotId,
        },
        wxid,
        msgId: msg.msgId,
        bufid: parsed.bufid,
        fromUserName: parsed.fromUsername || wxid,
        totalLen: parsed.totalLen,
      });
    }
    if (!result) {
      result = await downloadVoiceViaApi({
        options: {
          baseUrl: deps.baseUrl,
          apiToken: deps.apiToken,
          robotId: deps.robotId,
        },
        wxid,
        aesKey: parsed.aesKey,
        cdnVoiceUrl: parsed.cdnVoiceUrl,
      });
    }

    if (!result) {
      emitWechatIpadLog(deps, `${buildLogPrefix(deps.accountId)}: 语音下载 API 不可用，跳过`);
      return null;
    }

    const contactId = msg.chatType === "group" ? msg.chatId : msg.senderId;
    const timestamp = Math.floor((msg.timestamp || Date.now()) / 1000);
    const msgId = msg.msgId ?? msg.id;
    const ext = result.extension;
    const fileName = `${timestamp}_${msgId}${ext}`;
    const dir = join(voiceDir, contactId);
    const filePath = join(dir, fileName);

    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, result.buffer);

    return { path: filePath, contentType: result.contentType };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitWechatIpadLog(deps, `${buildLogPrefix(deps.accountId)}: 语音下载/保存失败：${message}`);
    return null;
  }
}

/**
 * 下载视频并保存到 agent 工作目录。
 * 任何步骤失败均记日志并返回 null，不阻塞消息处理。
 */
async function downloadAndSaveInboundVideo(params: {
  msg: WechatIpadInboundMessage;
  deps: WechatIpadInboundContext;
  wxid: string;
  videoDir: string;
}): Promise<{ path: string; contentType: string } | null> {
  const { msg, deps, wxid, videoDir } = params;
  try {
    const parsed = parseVideoXml(msg.rawContent ?? msg.body);
    if (!parsed) {
      emitWechatIpadLog(deps, `${buildLogPrefix(deps.accountId)}: 视频 XML 解析失败，跳过下载`);
      return null;
    }

    // 优先使用 /Tools/DownloadVideo（MsgId 分片方式），失败回退 CDN 端点
    let result: { buffer: Buffer; contentType: string; extension: string } | null = null;
    if (msg.msgId && parsed.length > 0) {
      result = await downloadVideoViaToolsApi({
        options: {
          baseUrl: deps.baseUrl,
          apiToken: deps.apiToken,
          robotId: deps.robotId,
        },
        wxid,
        msgId: msg.msgId,
        totalLen: parsed.length,
        toWxid: parsed.fromUsername || undefined,
      });
    }
    if (!result) {
      result = await downloadVideoViaApi({
        options: {
          baseUrl: deps.baseUrl,
          apiToken: deps.apiToken,
          robotId: deps.robotId,
        },
        wxid,
        aesKey: parsed.aesKey,
        cdnVideoUrl: parsed.cdnVideoUrl,
      });
    }

    if (!result) {
      emitWechatIpadLog(deps, `${buildLogPrefix(deps.accountId)}: 视频下载 API 不可用，跳过`);
      return null;
    }

    const contactId = msg.chatType === "group" ? msg.chatId : msg.senderId;
    const timestamp = Math.floor((msg.timestamp || Date.now()) / 1000);
    const msgId = msg.msgId ?? msg.id;
    const ext = result.extension;
    const fileName = `${timestamp}_${msgId}${ext}`;
    const dir = join(videoDir, contactId);
    const filePath = join(dir, fileName);

    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, result.buffer);

    return { path: filePath, contentType: result.contentType };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitWechatIpadLog(deps, `${buildLogPrefix(deps.accountId)}: 视频下载/保存失败：${message}`);
    return null;
  }
}

/**
 * 下载文件并保存到 agent 工作目录。
 * 任何步骤失败均记日志并返回 null，不阻塞消息处理。
 */
async function downloadAndSaveInboundFile(params: {
  msg: WechatIpadInboundMessage;
  deps: WechatIpadInboundContext;
  wxid: string;
  fileDir: string;
}): Promise<{ path: string; contentType: string } | null> {
  const { msg, deps, wxid, fileDir } = params;
  try {
    const fileMeta = parseFileXml(msg.rawContent ?? msg.body);
    if (!fileMeta || (!fileMeta.attachId && !fileMeta.cdnAttachUrl)) {
      emitWechatIpadLog(
        deps,
        `${buildLogPrefix(deps.accountId)}: 文件 XML 解析失败或缺少下载信息，跳过下载`,
      );
      return null;
    }

    const result = await downloadFileViaApi({
      options: {
        baseUrl: deps.baseUrl,
        apiToken: deps.apiToken,
        robotId: deps.robotId,
      },
      wxid,
      attachId: fileMeta.attachId || fileMeta.cdnAttachUrl,
      totalLen: fileMeta.totalLen,
    });

    if (!result) {
      emitWechatIpadLog(
        deps,
        `${buildLogPrefix(deps.accountId)}: 文件下载 API 不可用或下载失败，跳过`,
      );
      return null;
    }

    const contactId = msg.chatType === "group" ? msg.chatId : msg.senderId;
    const timestamp = Math.floor((msg.timestamp || Date.now()) / 1000);
    const msgId = msg.msgId ?? msg.id;
    const ext = fileMeta.fileExt ? `.${fileMeta.fileExt}` : "";
    const safeTitle = (fileMeta.title || `file_${msgId}`).replace(/[/\\:*?"<>|]/g, "_");
    const fileName = `${timestamp}_${safeTitle}${ext && !safeTitle.endsWith(ext) ? ext : ""}`;
    const dir = join(fileDir, contactId);
    const filePath = join(dir, fileName);

    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, result.buffer);

    // 根据文件扩展名推导 contentType
    const contentType =
      ext === ".pdf"
        ? "application/pdf"
        : ext === ".doc" || ext === ".docx"
          ? "application/msword"
          : ext === ".xls" || ext === ".xlsx"
            ? "application/vnd.ms-excel"
            : ext === ".zip"
              ? "application/zip"
              : "application/octet-stream";

    return { path: filePath, contentType };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitWechatIpadLog(deps, `${buildLogPrefix(deps.accountId)}: 文件下载/保存失败：${message}`);
    return null;
  }
}

/**
 * 统一处理 wechat-ipad 入站：策略校验 + 路由 + 回复派发。
 */
export async function handleWechatIpadInboundMessage(
  msg: WechatIpadInboundMessage,
  deps: WechatIpadInboundContext,
): Promise<void> {
  const {
    cfg,
    runtime,
    accountId,
    baseUrl,
    apiToken,
    robotId,
    allowFrom = [],
    dmPolicy = "pairing",
    groupPolicy = "open",
    commandAllowFrom,
    safetyPrefix,
    requireMention = true,
  } = deps;

  const logPrefix = buildLogPrefix(accountId);

  emitWechatIpadLog(
    deps,
    `${logPrefix}: 收到入站消息：id=${msg.id}，类型=${msg.contentType}(${msg.messageType})，发送者=${msg.senderId}，会话=${msg.chatId}(${msg.chatType})`,
  );

  // 解析发送者昵称标签（优先读缓存，缓存未命中时触发 API 查询）
  const rawSenderId = msg.senderId || msg.from;
  const senderLabel = await resolveContactLabel(rawSenderId, deps);

  // 持久化消息到 SQLite，在策略检查之前执行（被过滤的消息也可能被引用）
  const messageStore = getWechatIpadMessageStore(accountId);
  if (messageStore && msg.msgId) {
    try {
      messageStore.store({
        msgId: msg.msgId,
        msgSeq: msg.msgSeq,
        createTime: msg.timestamp ? Math.trunc(msg.timestamp / 1000) : undefined,
        msgSource: msg.rawMsgSource,
        senderId: rawSenderId,
        senderName: msg.senderName,
        chatId: msg.chatId,
        chatType: msg.chatType,
        msgType: msg.messageType,
        appMsgType: msg.appMessageType,
        contentType: msg.contentType,
        body: msg.body,
        rawContent: msg.rawContent,
      });
      emitWechatIpadLog(
        deps,
        `${logPrefix}: 入站消息已入库：msgId=${msg.msgId}，发送者=${senderLabel}`,
      );
    } catch {
      // 存储失败不阻塞消息处理
    }
  }

  // 系统消息处理（messageType=10002）：撤回、拍一拍、新成员入群
  if (msg.contentType === "system" && msg.messageType === 10002) {
    const rawXml = msg.rawContent ?? msg.body;

    // 撤回消息：解析被撤回的消息 ID 并标记
    const revokeMeta = parseRevokeMsgXml(rawXml);
    if (revokeMeta && messageStore) {
      const revokedMsgId = revokeMeta.newMsgId || revokeMeta.msgId;
      if (revokedMsgId) {
        try {
          messageStore.markRevoked?.(revokedMsgId);
          emitWechatIpadLog(
            deps,
            `${logPrefix}: 消息已撤回：msgId=${revokedMsgId}，${revokeMeta.replaceMsg || ""}`,
          );
        } catch {
          // 标记失败不阻塞
        }
      }
      return;
    }

    // 拍一拍消息
    const patInfo = parsePatXml(rawXml);
    if (patInfo) {
      emitWechatIpadLog(
        deps,
        `${logPrefix}: 拍一拍：${patInfo.fromusername} 拍了 ${patInfo.pattedusername}${patInfo.patsuffix ? `（${patInfo.patsuffix}）` : ""}`,
      );
      return;
    }

    // 新成员入群
    const newMember = parseNewMemberXml(rawXml);
    if (newMember) {
      emitWechatIpadLog(deps, `${logPrefix}: 新成员入群：${newMember.memberWxids.join(", ")}`);
      return;
    }

    // 其他系统消息不传递给 agent
    return;
  }

  // 纯系统通知（messageType=10000，如 "你已添加了 xxx"）不传递给 agent
  if (msg.contentType === "system" && msg.messageType === 10000) {
    emitWechatIpadLog(deps, `${logPrefix}: 系统通知：${msg.body?.substring(0, 100) ?? ""}`);
    return;
  }

  // 过滤机器人自身发出的消息，防止自循环
  if (msg.isFromSelf) {
    return;
  }

  // 过滤状态/初始化消息（messageType=51 等），不传递给 agent
  if (msg.contentType === "status") {
    return;
  }

  // 好友验证请求处理（messageType=37）：解析 XML 并自动通过
  if (msg.contentType === "verify" && msg.messageType === 37) {
    const verifyInfo = parseFriendVerifyXml(msg.rawContent ?? msg.body);
    if (verifyInfo) {
      emitWechatIpadLog(
        deps,
        `${logPrefix}: 收到好友验证请求：昵称=${verifyInfo.fromnickname}，wxid=${verifyInfo.fromusername}，来源=${verifyInfo.scene}`,
      );
      // dmPolicy=open 时自动通过好友请求
      if (dmPolicy === "open") {
        try {
          const wxid =
            deps.wxid?.trim() || getWechatIpadLoginSession(accountId)?.wxid?.trim() || robotId;
          await friendPassVerifyViaApi({
            options: { baseUrl, apiToken, robotId },
            wxid,
            v1: verifyInfo.encryptusername,
            v2: verifyInfo.ticket,
            scene: Number.parseInt(verifyInfo.scene, 10) || 14,
          });
          emitWechatIpadLog(deps, `${logPrefix}: 已自动通过好友验证：${verifyInfo.fromnickname}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emitWechatIpadLog(deps, `${logPrefix}: 自动通过好友验证失败：${message}`);
        }
      }
    }
    return;
  }

  if (msg.chatType === "group" && requireMention && !msg.isAtMe) {
    emitWechatIpadLog(
      deps,
      `${logPrefix}: 忽略群消息：未 @ 当前账号，发送者=${senderLabel}，群=${msg.chatId}`,
    );
    return;
  }

  const senderId = normalizeIdentity(msg.senderId || msg.from);
  const normalizedAllowFrom = allowFrom.map(normalizeIdentity);
  const effectivePolicy = msg.chatType === "group" ? groupPolicy : dmPolicy;
  const isAllowed = effectivePolicy === "open" || normalizedAllowFrom.includes(senderId);
  const isTrusted = normalizedAllowFrom.includes(senderId);

  const cmdAllowList = (commandAllowFrom ?? allowFrom).map(normalizeIdentity);
  const isCommandAuthorized = cmdAllowList.includes(senderId);

  if (!isAllowed && effectivePolicy !== "pairing") {
    emitWechatIpadLog(
      deps,
      `${logPrefix}: 忽略消息：策略=${effectivePolicy}，发送者=${senderId} 不在 allowFrom 中`,
    );
    return;
  }

  if (effectivePolicy === "pairing" && !normalizedAllowFrom.includes(senderId)) {
    const pairingSenderId = msg.chatType === "group" ? msg.chatId : senderId;
    const pairingSenderName =
      msg.chatType === "group" ? `群聊 ${msg.chatId}` : (msg.senderName ?? senderId);
    const { code } = await runtime.channel.pairing.upsertPairingRequest({
      channel: "wechat-ipad",
      accountId,
      id: pairingSenderId,
      meta: { name: pairingSenderName },
    });

    const pairingReply = runtime.channel.pairing.buildPairingReply({
      channel: "wechat-ipad",
      idLine: `你的 WeChat iPad 用户 ID：${pairingSenderId}`,
      code,
    });

    await sendWechatIpadText(msg.from, pairingReply, {
      baseUrl,
      apiToken,
      robotId,
    });
    return;
  }

  const chatTypeLabel = formatChatTypeLabel(msg.chatType);
  // 群聊时解析群名称，私聊时复用发送者标签
  const chatLabel =
    msg.chatType === "group" ? await resolveContactLabel(msg.chatId, deps) : senderLabel;

  emitWechatIpadLog(
    deps,
    `${logPrefix}: 收到消息：来自 ${senderLabel}，在 ${chatLabel}（${chatTypeLabel}）`,
  );

  runtime.channel.activity.record({
    channel: "wechat-ipad",
    accountId,
    direction: "inbound",
  });

  const route = runtime.channel.routing.resolveAgentRoute({
    cfg,
    channel: "wechat-ipad",
    accountId,
    peer: {
      kind: msg.chatType === "group" ? "group" : "direct",
      id: msg.chatType === "group" ? msg.chatId : senderId,
    },
  });

  // 图片下载
  let mediaPayload: AgentMediaPayload = {};
  if (msg.contentType === "image") {
    const resolvedWxid =
      deps.wxid?.trim() || getWechatIpadLoginSession(accountId)?.wxid?.trim() || robotId;
    const stateDir = runtime.state.resolveStateDir();
    const imageDir = join(stateDir, "workspace", "wechat-ipad-data", accountId, "images");
    const saved = await downloadAndSaveInboundImage({
      msg,
      deps,
      wxid: resolvedWxid,
      imageDir,
    });
    if (saved) {
      mediaPayload = buildAgentMediaPayload([saved]);
      emitWechatIpadLog(deps, `${logPrefix}: 图片已保存至 ${saved.path}`);
    }
  }

  // 语音下载
  if (msg.contentType === "voice") {
    const resolvedWxid =
      deps.wxid?.trim() || getWechatIpadLoginSession(accountId)?.wxid?.trim() || robotId;
    const stateDir = runtime.state.resolveStateDir();
    const voiceDir = join(stateDir, "workspace", "wechat-ipad-data", accountId, "voices");
    const saved = await downloadAndSaveInboundVoice({
      msg,
      deps,
      wxid: resolvedWxid,
      voiceDir,
    });
    if (saved) {
      mediaPayload = buildAgentMediaPayload([saved]);
      emitWechatIpadLog(deps, `${logPrefix}: 语音已保存至 ${saved.path}`);
    }
  }

  // 视频下载
  if (msg.contentType === "video") {
    const resolvedWxid =
      deps.wxid?.trim() || getWechatIpadLoginSession(accountId)?.wxid?.trim() || robotId;
    const stateDir = runtime.state.resolveStateDir();
    const videoDir = join(stateDir, "workspace", "wechat-ipad-data", accountId, "videos");
    const saved = await downloadAndSaveInboundVideo({
      msg,
      deps,
      wxid: resolvedWxid,
      videoDir,
    });
    if (saved) {
      mediaPayload = buildAgentMediaPayload([saved]);
      emitWechatIpadLog(deps, `${logPrefix}: 视频已保存至 ${saved.path}`);
    }
  }

  // 文件消息：下载文件并构建 mediaPayload
  if (msg.contentType === "file") {
    const fileMeta = parseFileXml(msg.rawContent ?? msg.body);
    if (fileMeta) {
      emitWechatIpadLog(
        deps,
        `${logPrefix}: 收到文件消息：${fileMeta.title}（${fileMeta.totalLen} 字节，扩展名=${fileMeta.fileExt}）`,
      );
      const resolvedWxid =
        deps.wxid?.trim() || getWechatIpadLoginSession(accountId)?.wxid?.trim() || robotId;
      const stateDir = runtime.state.resolveStateDir();
      const fileDir = join(stateDir, "workspace", "wechat-ipad-data", accountId, "files");
      const saved = await downloadAndSaveInboundFile({
        msg,
        deps,
        wxid: resolvedWxid,
        fileDir,
      });
      if (saved) {
        mediaPayload = buildAgentMediaPayload([saved]);
        emitWechatIpadLog(deps, `${logPrefix}: 文件已保存至 ${saved.path}`);
      }
    }
  }

  // 表情消息：解析元信息
  if (msg.contentType === "emoji") {
    const emojiMeta = parseEmojiXml(msg.rawContent ?? msg.body);
    if (emojiMeta) {
      emitWechatIpadLog(
        deps,
        `${logPrefix}: 收到表情消息：md5=${emojiMeta.md5}，大小=${emojiMeta.totalLen}`,
      );
    }
  }

  // 名片消息：解析联系人信息
  if (msg.contentType === "card") {
    const cardMeta = parseCardXml(msg.rawContent ?? msg.body);
    if (cardMeta) {
      emitWechatIpadLog(
        deps,
        `${logPrefix}: 收到名片消息：${cardMeta.nickname}（${cardMeta.wxid}）`,
      );
    }
  }

  // 位置消息：解析经纬度和地名
  if (msg.contentType === "location") {
    const locMeta = parseLocationXml(msg.rawContent ?? msg.body);
    if (locMeta) {
      emitWechatIpadLog(
        deps,
        `${logPrefix}: 收到位置消息：${locMeta.poiname || locMeta.label}（${locMeta.x},${locMeta.y}）`,
      );
    }
  }

  const envelopeOptions = runtime.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const defaultSafetyPrefix =
    "[系统安全提示：此用户为访客(guest)，禁止执行系统命令、文件操作、代码执行或工具调用，仅允许普通对话]\n\n";
  const effectiveSafetyPrefix = isTrusted ? "" : (safetyPrefix ?? defaultSafetyPrefix);

  // 媒体消息：如果下载成功则使用描述性文本替代原始 XML
  const effectiveBody =
    msg.contentType === "image" && mediaPayload.MediaPath
      ? "[图片]"
      : msg.contentType === "voice" && mediaPayload.MediaPath
        ? "[语音]"
        : msg.contentType === "video" && mediaPayload.MediaPath
          ? "[视频]"
          : msg.contentType === "file"
            ? mediaPayload.MediaPath
              ? `[文件] ${parseFileXml(msg.rawContent ?? msg.body)?.title ?? ""}`
              : `[文件] ${parseFileXml(msg.rawContent ?? msg.body)?.title ?? ""}（未下载）`
            : msg.contentType === "emoji"
              ? "[表情]"
              : msg.contentType === "card"
                ? `[名片] ${parseCardXml(msg.rawContent ?? msg.body)?.nickname ?? ""}`
                : msg.contentType === "location"
                  ? (() => {
                      const loc = parseLocationXml(msg.rawContent ?? msg.body);
                      return `[位置] ${loc?.poiname || loc?.label || ""}`;
                    })()
                  : msg.contentType === "link"
                    ? (() => {
                        // 解析链接卡片 XML，提取 title 和 url
                        const titleMatch = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i.exec(
                          msg.rawContent ?? msg.body,
                        );
                        const urlMatch = /<url>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/url>/i.exec(
                          msg.rawContent ?? msg.body,
                        );
                        const title = titleMatch?.[1]?.trim() ?? "";
                        const url = urlMatch?.[1]?.trim() ?? "";
                        return url ? `[链接] ${title} - ${url}` : `[链接] ${title || msg.body}`;
                      })()
                    : msg.contentType === "text" || msg.contentType === "quote"
                      ? `${effectiveSafetyPrefix}${msg.body}`
                      : msg.body;

  const body = runtime.channel.reply.formatInboundEnvelope({
    channel: "WeChat iPad",
    from: msg.senderName ?? senderId,
    timestamp: msg.timestamp,
    body: effectiveBody,
    chatType: msg.chatType,
    sender: {
      name: msg.senderName ?? senderId,
      id: senderId,
    },
    envelope: envelopeOptions,
  });

  const target = msg.from;
  const transportTo = msg.chatType === "group" ? `group:${msg.chatId}` : `wechat-ipad:${senderId}`;
  // 回复日志中使用可读的目标标签
  const targetLabel = msg.chatType === "group" ? chatLabel : senderLabel;

  const ctxPayload = runtime.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: msg.body,
    CommandBody: msg.body,
    From: transportTo,
    To: transportTo,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: msg.chatType,
    ConversationLabel: msg.senderName ?? senderId,
    GroupSubject: msg.chatType === "group" ? msg.chatId : undefined,
    SenderName: msg.senderName ?? senderId,
    SenderId: senderId,
    Provider: "wechat-ipad",
    Surface: "wechat-ipad",
    MessageSid: msg.msgId ?? msg.id,
    MessageSidFull: msg.msgIdFull ?? msg.msgId ?? msg.id,
    Timestamp: msg.timestamp,
    WasMentioned: msg.isAtMe,
    CommandAuthorized: isCommandAuthorized,
    OriginatingChannel: "wechat-ipad",
    OriginatingTo: transportTo,
    UserTrustLevel: isTrusted ? "trusted" : "guest",
    AllowedCapabilities: isTrusted ? ["chat", "tools", "files", "commands"] : ["chat"],
    ReplyToId: msg.quotedMessage?.quotedMessageId,
    ReplyToIdFull: msg.quotedMessage?.quotedMessageIdFull ?? msg.quotedMessage?.quotedMessageId,
    ReplyToBody: msg.quotedMessage?.quotedBody,
    ReplyToSender: msg.quotedMessage?.quotedSender ?? msg.quotedMessage?.quotedSenderWxid,
    ReplyToIsQuote: msg.quotedMessage ? true : undefined,
    ...mediaPayload,
  });

  if (!ctxPayload) {
    return;
  }

  const messagePreview = formatMessagePreview(msg.body);
  if (msg.chatType === "group") {
    emitWechatIpadLog(
      deps,
      `${logPrefix}: 群聊消息：${senderLabel} @ ${chatLabel}：${messagePreview}`,
    );
  } else {
    emitWechatIpadLog(deps, `${logPrefix}: 私聊消息：${senderLabel}：${messagePreview}`);
  }

  let quoteFallbackPending = Boolean(msg.quotedMessage?.quotedBody?.trim());
  const quoteFallbackPrefix = formatQuotedMessageFallbackPrefix(msg.quotedMessage);

  const { dispatcher, replyOptions, markDispatchIdle } =
    runtime.channel.reply.createReplyDispatcherWithTyping({
      deliver: async (payload: { text?: string; body?: string }, info: { kind: string }) => {
        let text = payload.text ?? payload.body ?? "";
        if (!text.trim()) {
          return;
        }
        if (quoteFallbackPending && quoteFallbackPrefix) {
          text = `${quoteFallbackPrefix}${text}`;
          quoteFallbackPending = false;
        }
        const result = await sendWechatIpadText(target, text, {
          cfg,
          accountId,
          baseUrl,
          apiToken,
          robotId,
          log: (message: string) => emitWechatIpadLog(deps, message),
        });
        if (result.endpoints?.length) {
          emitWechatIpadLog(
            deps,
            `${logPrefix}: 回复发送接口：kind=${info.kind}，目标=${targetLabel}，接口=${result.endpoints.join(" -> ")}`,
          );
        }
        if (!result.ok) {
          emitWechatIpadLog(
            deps,
            `${logPrefix}: 回复发送失败：kind=${info.kind}，目标=${targetLabel}，错误=${result.error ?? "未知错误"}`,
          );
        }
      },
      onError: (error, info) => {
        const message = error instanceof Error ? error.message : String(error);
        emitWechatIpadLog(deps, `${logPrefix}: 回复发送异常：kind=${info.kind}，错误=${message}`);
      },
    });

  try {
    emitWechatIpadLog(deps, `${logPrefix}: 开始分发到 agent（session=${route.sessionKey}）`);
    const result = await runtime.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions,
    });
    emitWechatIpadLog(
      deps,
      `${logPrefix}: 分发完成（已入队最终回复=${result.queuedFinal}，回复数=${result.counts.final}）`,
    );
  } finally {
    markDispatchIdle();
  }
}
