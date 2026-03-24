/**
 * tunee-bridge 插件入口（MVP）
 * - 插件 id：`tunee-bridge`（plugins.allow / entries）
 * - 渠道 id：`tunee`（channels.tunee、bindings）
 * - 业务配置在 `channels.tunee`，不在 plugins.entries
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { tuneeChannelPlugin } from "./src/channel.js";
import { setTuneePluginRuntime } from "./src/plugin-runtime.js";

export default {
  id: "tunee-bridge",
  name: "Tunee Bridge",
  description: "WS inbound + HTTP reply (MVP)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setTuneePluginRuntime(api.runtime);
    api.registerChannel({ plugin: tuneeChannelPlugin });
  },
};
