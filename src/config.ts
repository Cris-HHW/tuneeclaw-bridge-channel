/**
 * 读取 `channels.tunee`：无 `accounts` 时只有 `default`；有则列出各 accountId 并支持顶层+账号合并。
 */
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";
import type { PluginConfig, ResolvedTuneeAccount, TuneeChannelConfig } from "./types.js";

function section(cfg: PluginConfig): TuneeChannelConfig {
  return (cfg.channels as Record<string, TuneeChannelConfig> | undefined)?.tunee ?? {};
}

export function listTuneeAccountIds(cfg: PluginConfig): string[] {
  const acc = section(cfg).accounts;
  if (acc && typeof acc === "object" && Object.keys(acc).length > 0) {
    return Object.keys(acc).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }
  return [DEFAULT_ACCOUNT_ID];
}

function merge(cfg: PluginConfig, accountId: string): TuneeChannelConfig {
  const base = section(cfg);
  const over = base.accounts?.[accountId] ?? {};
  return { ...base, ...over, accounts: undefined };
}

export function resolveTuneeAccount(cfg: PluginConfig, accountId?: string | null): ResolvedTuneeAccount {
  const id = normalizeAccountId(accountId);
  const m = merge(cfg, id);
  const enabled = section(cfg).enabled !== false && m.enabled !== false;
  const wsUrl = m.wsUrl?.trim() ?? "";
  const replyUrl = m.replyUrl?.trim() ?? "";
  return {
    accountId: id,
    enabled,
    configured: Boolean(wsUrl && replyUrl),
    wsUrl,
    replyUrl,
    apiKey: m.apiKey?.trim() || undefined,
    authHeader: m.authHeader?.trim() || "Authorization",
  };
}
