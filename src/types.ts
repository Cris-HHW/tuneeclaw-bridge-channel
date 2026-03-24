/**
 * channels.tunee 与入站 WS JSON 的类型（MVP）。
 */
import type { OpenClawConfig } from "openclaw/plugin-sdk";

export type TuneeAccountOverride = Partial<{
  enabled: boolean;
  wsUrl: string;
  replyUrl: string;
  apiKey: string;
  authHeader: string;
}>;

export type TuneeChannelConfig = {
  enabled?: boolean;
  wsUrl?: string;
  replyUrl?: string;
  apiKey?: string;
  authHeader?: string;
  accounts?: Record<string, TuneeAccountOverride>;
};

export type ResolvedTuneeAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  wsUrl: string;
  replyUrl: string;
  apiKey?: string;
  authHeader: string;
};

/** 入站：一帧 WS 文本 = 一个 JSON */
export type TuneeInboundEvent = {
  eventId?: string;
  conversationId: string;
  userId?: string;
  text: string;
  timestamp?: number;
};

export type PluginConfig = OpenClawConfig;
