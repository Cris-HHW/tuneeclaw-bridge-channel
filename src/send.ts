/**
 * Agent 回复出站：POST channels.tunee.replyUrl（由 dispatch.deliver 与 outbound 调用）。
 */
import type { ResolvedTuneeAccount } from "./types.js";

export type TuneeReplyPayload = {
  conversationId: string;
  userId: string;
  text: string;
  kind: "tool" | "block" | "final";
  eventId?: string;
};

export async function postTuneeReply(account: ResolvedTuneeAccount, payload: TuneeReplyPayload): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (account.apiKey) {
    const name = account.authHeader;
    if (name.toLowerCase() === "authorization") {
      headers.Authorization = account.apiKey.startsWith("Bearer ")
        ? account.apiKey
        : `Bearer ${account.apiKey}`;
    } else {
      headers[name] = account.apiKey;
    }
  }

  const res = await fetch(account.replyUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      channel: "tunee",
      accountId: account.accountId,
      ...payload,
      sentAt: Date.now(),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`tunee replyUrl HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
}
