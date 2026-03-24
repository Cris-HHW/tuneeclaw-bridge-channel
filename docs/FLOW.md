# tunee-bridge 模块与执行顺序（MVP）

## 模块做什么

| 文件 | 作用 |
|:---|:---|
| `index.ts` | 插件入口：`setTuneePluginRuntime(api.runtime)` → `registerChannel` |
| `src/plugin-runtime.ts` | 保存 `api.runtime`；`dispatch` 必须用其调 `channel.reply`，不能用 `startAccount` 的 `ctx.runtime` |
| `src/channel.ts` | 注册渠道元数据、读配置、`startAccount`（拉 WS + **await abort**）、`stopAccount`、`outbound.sendText` |
| `src/config.ts` | 读 `channels.tunee`，合并多账号，得到 `wsUrl` / `replyUrl` |
| `src/types.ts` | 配置与入站 JSON 的类型 |
| `src/monitor.ts` | `ws` 客户端连 `wsUrl`；收帧 → `dispatchTuneeInbound`；断线重连 |
| `src/dispatch.ts` | `resolveAgentRoute` → 封装 inbound → `dispatchReplyFromConfig`；`deliver` 里 POST 回复 |
| `src/send.ts` | `fetch(POST replyUrl)` |

## 执行顺序（从 Gateway 启动到一条回复）

1. Gateway 加载插件 → **`register()`** 注入 `api.runtime` 并注册 `tunee` 渠道。  
2. **`startAccount`** → `startTuneeWsMonitor` 连你方 WS → **Promise 挂起直到 `abort`**（避免被判定为已停止）。  
3. 你方 **`ws.send(JSON)`** → **`monitor`** `parseInbound` → **`dispatchTuneeInbound`**（`pluginRuntime` + `log`）。  
4. **`dispatch`**：`resolveAgentRoute`（看 `bindings`）→ `formatAgentEnvelope` / `finalizeInboundContext` → `createReplyDispatcherWithTyping` → **`dispatchReplyFromConfig`** 跑 Agent。  
5. 模型出字 → **`deliver`** → **`postTuneeReply`** → 你方 **`replyUrl`**。  
6. 停渠道 → **`abort`** + **`stopAccount`** → 关 WS、清重连。

## 数据走向（一句话）

**你方 WS 下行 JSON → OpenClaw（Gateway 内）→ Agent → HTTP POST 到你方 `replyUrl`。**

接口字段与本地测试见 [README.md](../README.md)。
