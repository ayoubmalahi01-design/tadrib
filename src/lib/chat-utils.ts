/** Pure helpers for the messaging screens — no Supabase, no React. */

export type ConversationLike = {
  id: string;
  label?: string | null;
  title?: string | null;
  conversation_type?: string | null;
};

export type MessageLike = {
  id: string;
  body?: string | null;
  message_type?: string | null;
  created_at?: string | null;
};

function norm(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/** Filters the conversation list by name/title, keeping the current chat visible. */
export function filterConversations<T extends ConversationLike>(
  list: T[],
  query: string,
  keepId?: string | null,
): T[] {
  const q = norm(query);
  if (!q) return list;
  return list.filter((c) => {
    if (keepId && c.id === keepId) return true;
    return norm(c.label).includes(q) || norm(c.title).includes(q);
  });
}

/** Filters loaded messages by their text body. */
export function filterMessages<T extends MessageLike>(
  list: T[],
  query: string,
): T[] {
  const q = norm(query);
  if (!q) return list;
  return list.filter((m) => norm(m.body).includes(q));
}

/** Sums the unread map, ignoring negative or non-numeric values. */
export function unreadTotal(map: Record<string, number> | null | undefined): number {
  if (!map) return 0;
  return Object.values(map).reduce((sum, value) => {
    const n = Number(value);
    return sum + (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  }, 0);
}

/** Formats a badge count, capping it at 99+. */
export function badgeCount(n: number): string {
  const value = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (value <= 0) return "";
  return value > 99 ? "99+" : String(value);
}

export type OutgoingPayload = {
  conversationId: string;
  body: string;
  fileName?: string | null;
};

/**
 * Keeps the failed message so the coach can resend it instead of retyping.
 * Returns null when there is nothing worth retrying.
 */
export function pendingRetry(
  payload: OutgoingPayload | null | undefined,
): OutgoingPayload | null {
  if (!payload) return null;
  const body = String(payload.body ?? "").trim();
  const file = String(payload.fileName ?? "").trim();
  if (!body && !file) return null;
  if (!payload.conversationId) return null;
  return { conversationId: payload.conversationId, body, fileName: file || null };
}

/** True when the conversation is a group that the user may manage. */
export function canManageGroup(
  conversationType: string | null | undefined,
  createdBy: string | null | undefined,
  me: string,
  role: string,
): boolean {
  if (conversationType === "direct") return false;
  return createdBy === me || role === "admin" || role === "manager" || role === "owner";
}
