/**
 * 保存 register() 时的 api.runtime（含 channel.reply / routing）。
 * startAccount 的 ctx.runtime 只有 log/error，不能用来 dispatch。
 */
import type { PluginRuntime } from "openclaw/plugin-sdk";

let rt: PluginRuntime | null = null;

export function setTuneePluginRuntime(next: PluginRuntime): void {
  rt = next;
}

export function getTuneePluginRuntime(): PluginRuntime {
  if (!rt) throw new Error("tunee-bridge: PluginRuntime 未设置，请先执行插件 register()");
  return rt;
}
