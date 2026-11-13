import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterConversations,
  filterMessages,
  unreadTotal,
  badgeCount,
  pendingRetry,
  canManageGroup,
} from "../src/lib/chat-utils.ts";

const conversations = [
  { id: "a", label: "فريق كرة القدم" },
  { id: "b", label: "Ahmed Coach" },
  { id: "c", label: null, title: "إدارة المؤسسة" },
];

test("conversation search matches Arabic and Latin labels", () => {
  assert.equal(filterConversations(conversations, "كرة").length, 1);
  assert.equal(filterConversations(conversations, "ahmed")[0].id, "b");
  assert.equal(filterConversations(conversations, "إدارة")[0].id, "c");
});

test("empty query returns the untouched list", () => {
  assert.equal(filterConversations(conversations, "   ").length, 3);
});

test("the open conversation stays visible while searching", () => {
  const result = filterConversations(conversations, "zzz", "a");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a");
});

test("message search filters by body only", () => {
  const messages = [
    { id: "1", body: "الحصة الأولى جيدة" },
    { id: "2", body: "Travail terminé" },
    { id: "3", body: null },
  ];
  assert.equal(filterMessages(messages, "الحصة").length, 1);
  assert.equal(filterMessages(messages, "terminé")[0].id, "2");
  assert.equal(filterMessages(messages, "").length, 3);
});

test("unread total ignores junk values", () => {
  assert.equal(unreadTotal({ a: 3, b: 2 }), 5);
  assert.equal(unreadTotal({ a: -4, b: 2 }), 2);
  assert.equal(unreadTotal({ a: Number.NaN }), 0);
  assert.equal(unreadTotal(null), 0);
});

test("badge count caps at 99+", () => {
  assert.equal(badgeCount(0), "");
  assert.equal(badgeCount(7), "7");
  assert.equal(badgeCount(120), "99+");
});

test("failed message can be retried, empty ones are dropped", () => {
  assert.deepEqual(
    pendingRetry({ conversationId: "c1", body: "  hello  " }),
    { conversationId: "c1", body: "hello", fileName: null },
  );
  assert.equal(pendingRetry({ conversationId: "c1", body: "   " }), null);
  assert.equal(pendingRetry(null), null);
});

test("group management respects authorship and role", () => {
  assert.equal(canManageGroup("group", "me", "me", "coach"), true);
  assert.equal(canManageGroup("group", "other", "me", "coach"), false);
  assert.equal(canManageGroup("group", "other", "me", "admin"), true);
  assert.equal(canManageGroup("direct", "me", "me", "admin"), false);
});
