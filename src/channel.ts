/**
 * tunee 渠道定义：配置、出站、Gateway 启停 WS。
 * - startAccount：起 monitor，并 await abort（否则 Gateway 会认为渠道已退出）
 * - outbound.sendText：其它功能通过渠道发字时 POST replyUrl（可选路径）
 */
import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import { listTuneeAccountIds, resolveTuneeAccount } from "./config.js";
import type { ResolvedTuneeAccount } from "./types.js";
import { startTuneeWsMonitor, stopTuneeMonitor } from "./monitor.js";
import { postTuneeReply } from "./send.js";

const CHANNEL_ID = "tunee";

export const tuneeChannelPlugin: ChannelPlugin<ResolvedTuneeAccount> = {
  id: CHANNEL_ID,
  meta: {
    id: CHANNEL_ID,
    label: "Tunee Bridge",
    selectionLabel: "Tunee (WS in, HTTP out)",
    docsPath: "/channels/tunee",
    docsLabel: "tunee",
    blurb: "Your WS pushes events; OpenClaw POSTs replies to your URL.",
    order: 95,
  },
  /**
   * 渠道能力位：告诉 OpenClaw 本渠道支持哪些「聊天形态 / 交互」。
   * 宿主会据此做 UI 列表、部分默认策略等；未实现的能力务必保持 false，避免误导。
   * 完整类型见 openclaw plugin-sdk：`ChannelCapabilities`。
   */
  capabilities: {
    /** 支持的会话类型：`direct` 私聊/单聊；还可含 `group`、`channel` 等（本 MVP 仅点对点会话） */
    chatTypes: ["direct"],
    /** 是否支持投票/问卷类消息（本渠道无） */
    polls: false,
    /** 是否支持子线程/话题回复（本渠道无） */
    threads: false,
    /** 是否支持图片/音视频等媒体收发（本 MVP 仅文本 JSON） */
    media: false,
    /** 是否支持消息表情回应（本渠道无） */
    reactions: false,
    /** 是否支持编辑已发消息（本渠道无） */
    edit: false,
    /** 是否按「可回复会话」处理（与回复管线、部分路由展示相关；入站会走标准 deliver） */
    reply: true,
  },
  /**
   * 热重载：当 openclaw.json 里以下前缀的配置变更时，Gateway 可对本渠道做重载/重启账号（具体行为以 OpenClaw 版本为准）。
   * 这里写 `channels.tunee`，表示改 wsUrl、replyUrl、accounts 等都会触发评估。
   */
  reload: { configPrefixes: ["channels.tunee"] },
  /**
   * JSON Schema：用于校验/描述 `channels.tunee` 下允许出现的字段（与 config 里读写逻辑一致）。
   * `additionalProperties: false` 表示未列出的键会被视为无效配置。
   */
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        wsUrl: { type: "string" },
        replyUrl: { type: "string" },
        apiKey: { type: "string" },
        authHeader: { type: "string" },
        accounts: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: false,
            properties: {
              enabled: { type: "boolean" },
              wsUrl: { type: "string" },
              replyUrl: { type: "string" },
              apiKey: { type: "string" },
              authHeader: { type: "string" },
            },
          },
        },
      },
    },
  },
  /**
   * OpenClaw 读 `channels.tunee`、枚举账号、判断是否可启动时用。
   * 回调里的 `cfg` = Gateway 当前生效的**整份** `OpenClawConfig`（通常来自 `openclaw.json` 等），非仅 tunee 一段。
   */
  config: {
    /** 本渠道有哪些 accountId（无 accounts 时只有 default） */
    listAccountIds: (cfg) => listTuneeAccountIds(cfg as OpenClawConfig),
    /** 合并顶层 + accounts.<id>，得到 wsUrl/replyUrl 等 */
    resolveAccount: (cfg, accountId) => resolveTuneeAccount(cfg as OpenClawConfig, accountId),
    /** 未指定账号时的 id */
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    /** 是否同时配齐了 wsUrl 与 replyUrl */
    isConfigured: (account) => account.configured,
    /** 给状态页/列表展示的摘要 */
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
    }),
  },

  // 将出站消息发送到 Tunee 的 replyUrl，返回至用户层
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ cfg, to, text, accountId }) => {
      const account = resolveTuneeAccount(cfg as OpenClawConfig, accountId);
      await postTuneeReply(account, {
        conversationId: to?.trim() || "unknown",
        userId: "system",
        text: text ?? "",
        kind: "final",
      });
      return { channel: CHANNEL_ID, ok: true, messageId: `tunee-${Date.now()}` };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const cfg = ctx.cfg as OpenClawConfig;
      const account = resolveTuneeAccount(cfg, ctx.accountId);
      if (!account.configured || !account.enabled) {
        ctx.log?.info?.(`[tunee] skip start: ${ctx.accountId}`);
        return;
      }
      ctx.setStatus?.({ accountId: ctx.accountId, running: true });
      ctx.log?.info?.(`[tunee] starting WS monitor for ${ctx.accountId}`);
      startTuneeWsMonitor({
        cfg,
        runtime: ctx.runtime,
        account,
        abortSignal: ctx.abortSignal,
      });
      await new Promise<void>((resolve) => {
        if (ctx.abortSignal.aborted) resolve();
        else ctx.abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });
    },
    stopAccount: async (ctx) => {
      stopTuneeMonitor(ctx.accountId);
      ctx.log?.info?.(`[tunee] stopped ${ctx.accountId}`);
    },
  },
};
