/**
 * WebSocket 客户端：连 channels.tunee.wsUrl，收 JSON 文本帧 → dispatch。
 * 断线指数退避重连；abort 时停止。已有 OPEN/CONNECTING 连接时不重建（避免被频繁 startAccount 掐断）。
 */
import WebSocket from "ws";
import type { OpenClawConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import type { ResolvedTuneeAccount, TuneeInboundEvent } from "./types.js";
import { dispatchTuneeInbound } from "./dispatch.js";
import { getTuneePluginRuntime } from "./plugin-runtime.js";

const sockets = new Map<string, WebSocket>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearReconnect(accountId: string): void {
  const t = reconnectTimers.get(accountId);
  if (t) clearTimeout(t);
  reconnectTimers.delete(accountId);
}

function parseInbound(raw: string): TuneeInboundEvent | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;
    const o = data as Record<string, unknown>;
    const conversationId = String(o.conversationId ?? "").trim();
    const text = String(o.text ?? "").trim();
    if (!conversationId || !text) return null;
    return {
      eventId: o.eventId != null ? String(o.eventId) : undefined,
      conversationId,
      userId: o.userId != null ? String(o.userId) : undefined,
      text,
      timestamp: typeof o.timestamp === "number" ? o.timestamp : undefined,
    };
  } catch {
    return null;
  }
}

export function startTuneeWsMonitor(params: {
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  account: ResolvedTuneeAccount;
  abortSignal?: AbortSignal;
}): void {
  const { cfg, runtime, account, abortSignal } = params;
  const { accountId, wsUrl } = account;

  const connect = (attempt: number) => {
    if (abortSignal?.aborted) return;

    clearReconnect(accountId);
    const existing = sockets.get(accountId);
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    if (existing) {
      try {
        existing.close();
      } catch {
        /* ignore */
      }
      sockets.delete(accountId);
    }

    runtime.log?.(`[tunee] WS connecting account=${accountId} url=${wsUrl}`);

    const ws = new WebSocket(wsUrl, {
      headers: account.apiKey
        ? {
            Authorization: account.apiKey.startsWith("Bearer ")
              ? account.apiKey
              : `Bearer ${account.apiKey}`,
          }
        : undefined,
    });

    sockets.set(accountId, ws);

    ws.on("open", () => {
      runtime.log?.(`[tunee] WS open account=${accountId}`);
    });

    ws.on("message", (data) => {
      const raw = typeof data === "string" ? data : data.toString("utf8");
      const event = parseInbound(raw);
      if (!event) {
        runtime.error?.(`[tunee] invalid WS payload: ${raw.slice(0, 200)}`);
        return;
      }
      void dispatchTuneeInbound({
        cfg,
        pluginRuntime: getTuneePluginRuntime(),
        log: runtime,
        account,
        event,
      }).catch((err) => {
        runtime.error?.(`[tunee] dispatch failed: ${String(err)}`);
      });
    });

    ws.on("error", (err) => {
      runtime.error?.(`[tunee] WS error account=${accountId}: ${String(err)}`);
    });

    ws.on("close", () => {
      sockets.delete(accountId);
      if (abortSignal?.aborted) return;
      const delay = Math.min(30_000, 1000 * Math.pow(2, attempt));
      runtime.log?.(`[tunee] WS closed account=${accountId}, reconnect in ${delay}ms`);
      reconnectTimers.set(accountId, setTimeout(() => connect(attempt + 1), delay));
    });
  };

  const onAbort = () => {
    clearReconnect(accountId);
    const ws = sockets.get(accountId);
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      sockets.delete(accountId);
    }
  };

  if (abortSignal) {
    if (abortSignal.aborted) {
      onAbort();
      return;
    }
    abortSignal.addEventListener("abort", onAbort, { once: true });
  }

  connect(0);
}

export function stopTuneeMonitor(accountId: string): void {
  clearReconnect(accountId);
  const ws = sockets.get(accountId);
  if (ws) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    sockets.delete(accountId);
  }
}
