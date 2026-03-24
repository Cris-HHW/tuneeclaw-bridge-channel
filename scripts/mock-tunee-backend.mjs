#!/usr/bin/env node
/**
 * 本地模拟你方后端：WSS 收 OpenClaw 连接并下推 JSON；HTTP 收 POST 回复。
 * 用法：npm run mock-backend → 再重启 Gateway。端口默认 28890/28891，与 openclaw.json 一致。
 * 入站文案：在终端输入一行后回车，该行作为 JSON 的 text 下推（空行仅提示）。
 * 可选：TUNEE_MOCK_AUTO_PUSH=1 时连接后约 1.5s 自动推一条（文案见 TUNEE_MOCK_AUTO_TEXT）。
 */
import http from "node:http";
import readline from "node:readline";
import { WebSocketServer } from "ws";

const WS_PORT = Number(process.env.TUNEE_MOCK_WS_PORT || 28890);
const HTTP_PORT = Number(process.env.TUNEE_MOCK_HTTP_PORT || 28891);
const REPLY_PATH = "/tunee/reply";
const AUTO_PUSH = process.env.TUNEE_MOCK_AUTO_PUSH === "1" || process.env.TUNEE_MOCK_AUTO_PUSH === "true";
const AUTO_TEXT =
  process.env.TUNEE_MOCK_AUTO_TEXT?.trim() || "你好，北京时区当前时间是多少";

function bailInUse(which, port) {
  console.error(`\n[mock] ${which} 端口 ${port} 占用。查看: lsof -i :${port}\n`);
  process.exit(1);
}

const httpServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === REPLY_PATH) {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      console.log("\n[reply]", new Date().toISOString(), body.slice(0, 2000));
      if (body.length > 2000) console.log(`... (${body.length} bytes)`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

httpServer.on("error", (err) => {
  if (err?.code === "EADDRINUSE") bailInUse("HTTP", HTTP_PORT);
  console.error(err);
  process.exit(1);
});

httpServer.listen(HTTP_PORT, "127.0.0.1", () => {
  console.log(`[mock] HTTP ${HTTP_PORT}${REPLY_PATH}`);
});

const wss = new WebSocketServer({ port: WS_PORT, host: "127.0.0.1" });

wss.on("error", (err) => {
  if (err?.code === "EADDRINUSE") {
    httpServer.close();
    bailInUse("WebSocket", WS_PORT);
  }
  console.error(err);
  process.exit(1);
});

let client = null;

wss.on("listening", () => {
  console.log(`[mock] WS ${WS_PORT} — 先起 Gateway 连上后，在此输入一行并回车即下推为 text`);
  if (AUTO_PUSH) console.log("[mock] TUNEE_MOCK_AUTO_PUSH=1：连接后自动推一条演示句");
});

/** @param {import("ws").WebSocket} ws */
function pushText(ws, text, tag = "stdin") {
  const payload = {
    eventId: `evt-${Date.now()}-${tag}`,
    conversationId: "local-test-1",
    userId: "local-user",
    text,
  };
  ws.send(JSON.stringify(payload));
  const preview = JSON.stringify(payload);
  console.log("[mock] push", preview.length > 120 ? `${preview.slice(0, 120)}…` : preview);
}

wss.on("connection", (ws) => {
  client = ws;
  console.log("[mock] connected");
  if (AUTO_PUSH) {
    setTimeout(() => pushText(ws, AUTO_TEXT, "auto"), 1500);
  }
  ws.on("close", () => {
    if (client === ws) client = null;
    console.log("[mock] disconnected");
  });
  ws.on("error", (e) => console.error("[mock] ws", e));
});

readline.createInterface({ input: process.stdin, output: process.stdout }).on("line", (line) => {
  const ws = client;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log("[mock] 无连接，先起 Gateway");
    return;
  }
  const text = typeof line === "string" ? line.trim() : "";
  if (!text) {
    console.log("[mock] 空行已忽略，输入非空内容后回车下推");
    return;
  }
  pushText(ws, text, "stdin");
});
