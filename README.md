# tunee-bridge（MVP）

OpenClaw 以 **WebSocket 客户端** 连你方 `wsUrl`，收用户消息 JSON；Agent 回复 **`POST`** 到 `replyUrl`。

**模块与调用顺序：** [docs/FLOW.md](./docs/FLOW.md)

## 配置

```json
{
  "plugins": {
    "allow": ["tunee-bridge"],
    "entries": { "tunee-bridge": { "enabled": true } }
  },
  "channels": {
    "tunee": {
      "enabled": true,
      "wsUrl": "wss://你的域/openclaw/ws",
      "replyUrl": "https://你的域/openclaw/reply",
      "apiKey": "可选，WS 与 POST 共用"
    }
  },
  "bindings": [
    { "agentId": "main", "match": { "channel": "tunee", "accountId": "default" } }
  ]
}
```

多账号：`channels.tunee.accounts.<id>` 覆盖 `wsUrl` / `replyUrl`。插件目录执行 **`npm install`**（依赖 `ws`）。

### IDE 里 `openclaw/plugin-sdk` 爆红（与飞书插件同理）

飞书扩展能识别，是因为 **`extensions/feishu` 里执行过 `npm install`，存在 `node_modules/openclaw`**。TypeScript 会从**当前文件所在目录**往上找 `node_modules`，**不需要**项目根 `tsconfig.json`。

`tunee-bridge` 已把 **`openclaw` 写成 `devDependencies`，并用 `file:../feishu/node_modules/openclaw` 链接到飞书目录里那份 SDK**（避免再从 npm 拉一遍、也少踩 git 依赖问题）。请先装好飞书依赖，再在 tunee 目录安装：

```bash
cd ~/.openclaw/extensions/feishu && npm install
cd ~/.openclaw/extensions/tunee-bridge && npm install
```

完成后 **`tunee-bridge/node_modules/openclaw`** 应存在，爆红应消失。

**没有飞书扩展时**：把 `package.json` 里 `openclaw` 改成与你本机一致的版本号，例如 `"openclaw": "2026.2.26"`，再 `npm install`。

## 本地联调

1. 终端 A：`cd ~/.openclaw/extensions/tunee-bridge && npm run mock-backend`  
2. 终端 B：`openclaw gateway restart`（`openclaw.json` 里 `tunee` 端口与 mock 一致，如 28890/28891）  
3. 终端 A 出现 `[reply]` 即通。改端口用 `TUNEE_MOCK_WS_PORT` / `TUNEE_MOCK_HTTP_PORT` 并同步改配置。

## 入站 JSON（你方 → OpenClaw，一帧一条）

必填：`conversationId`、`text`。可选：`eventId`、`userId`、`timestamp`。

## 出站 POST 体（OpenClaw → `replyUrl`）

含 `channel`、`accountId`、`conversationId`、`userId`、`text`、`kind`（`tool`|`block`|`final`）、`eventId?`、`sentAt`。需返回 2xx。

## 常见问题（极简）

- **端口占用 / 已有 Gateway**：`openclaw gateway stop` 或 `restart`；勿重复 `gateway run`。  
- **`package.json` 的 `name`** 须为 `tunee-bridge`，与 `openclaw.plugin.json` 的 `id` 一致。  
- **无回复**：看 Gateway 日志里 `[tunee]`；模型/OAuth 需可用。
