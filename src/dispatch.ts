/**
 * 入站 → OpenClaw 标准回复管线：路由、envelope、dispatchReplyFromConfig；
 * deliver 里 POST replyUrl（与飞书 deliver 调飞书 API 同类）。
 */
import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { ResolvedTuneeAccount, TuneeInboundEvent } from "./types.js";
import { postTuneeReply } from "./send.js";

const CH = "tunee";

export type TuneeChannelLogSink = {
  log?: (message: string) => void;
  error?: (message: string) => void;
};

export async function dispatchTuneeInbound(params: {
  cfg: OpenClawConfig;
  pluginRuntime: PluginRuntime;
  log: TuneeChannelLogSink;
  account: ResolvedTuneeAccount;
  event: TuneeInboundEvent;
}): Promise<void> {
  const { cfg, pluginRuntime, log, account, event } = params;
  const conversationId = event.conversationId?.trim();
  if (!conversationId) {
    log.error?.("[tunee] missing conversationId");
    return;
  }
  const userId = event.userId?.trim() || "anonymous";
  const text = event.text?.trim();
  if (!text) {
    log.error?.("[tunee] missing text");
    return;
  }

  // 按渠道 + accountId + 会话对等解析 Agent 路由（sessionKey、绑定的 accountId 等）
  const route = pluginRuntime.channel.routing.resolveAgentRoute({
    cfg,
    channel: CH,
    accountId: account.accountId ?? DEFAULT_ACCOUNT_ID,
    peer: { kind: "direct", id: conversationId },
  });

  // resolveEnvelopeFormatOptions：从 cfg 取信封/展示相关格式选项
  const envelopeFormat = pluginRuntime.channel.reply.resolveEnvelopeFormatOptions(cfg);
  // formatAgentEnvelope：按选项把正文包成管线识别的标准入站文本
  const envelope = pluginRuntime.channel.reply.formatAgentEnvelope({
    channel: "Tunee",
    from: `${userId}@${conversationId}`,
    timestamp: new Date(),
    envelope: envelopeFormat,
    body: text,
  });

  const messageSid = event.eventId?.trim() || `tunee-${Date.now()}`;

  // 组装入站上下文：供后续回复管线识别会话、发送方、MessageSid 等
  const inboundCtx = pluginRuntime.channel.reply.finalizeInboundContext({
    Body: envelope,
    RawBody: text,
    CommandBody: text,
    From: `${CH}:${userId}:${conversationId}`,
    To: `${CH}:${conversationId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    SenderName: userId,
    SenderId: userId,
    Provider: CH,
    Surface: CH,
    MessageSid: messageSid,
    Timestamp: event.timestamp ?? Date.now(),
    WasMentioned: true,
    CommandAuthorized: true,
    OriginatingChannel: CH,
    OriginatingTo: `${CH}:${conversationId}`,
  });

  // 创建带「正在输入」等行为的回复派发器；deliver 里真正把文本 POST 到 tunee replyUrl
  const { dispatcher, replyOptions, markDispatchIdle } =
    pluginRuntime.channel.reply.createReplyDispatcherWithTyping({
      deliver: async (payload, info) => {
        const replyText = payload.text?.trim();

        log.log?.(`[tunee] deliver ${info.kind}: ${replyText}`);

        if (!replyText) return;
        // 渠道出站：HTTP 回写到当前账号配置的 replyUrl
        await postTuneeReply(account, {
          conversationId,
          userId,
          text: replyText,
          kind: info.kind,
          eventId: event.eventId,
        });
      },
      onError: (err, info) => {
        log.error?.(`[tunee] dispatch ${info.kind}: ${String(err)}`);
      },
    });

  try {
    // 走配置驱动的标准回复流程（Agent/命令等），产出片段由 dispatcher.deliver 送出
    await pluginRuntime.channel.reply.dispatchReplyFromConfig({
      ctx: inboundCtx,
      cfg,
      dispatcher,
      replyOptions,
    });
  } finally {
    // 结束本轮派发，清理 typing / 空闲状态
    markDispatchIdle();
  }
}
