"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(path.join(root, "supabase/stack-d1-marketplace-messaging-hardening.sql"), "utf8");

test("D1 keeps message bodies RPC-only and publishes only participant-scoped event rows", () => {
  assert.match(sql, /create table if not exists public\.marketplace_message_events/i);
  assert.match(sql, /grant select on table public\.marketplace_message_events to authenticated/i);
  assert.match(sql, /marketplace_current_user_is_conversation_member\(conversation_id\)/i);
  assert.match(sql, /alter publication supabase_realtime drop table public\.marketplace_messages/i);
  assert.match(sql, /alter publication supabase_realtime add table public\.marketplace_message_events/i);
});

test("D1 message send is idempotent and increments unread only after a new insert", () => {
  assert.match(sql, /client_request_id/i);
  assert.match(sql, /marketplace_messages_sender_request_uidx/i);
  assert.match(sql, /marketplace_member_send_message_v2/i);
  assert.match(sql, /Message request identifier was already used/i);
  assert.match(sql, /set unread_count=unread_count\+1,[\s\S]*archived_at=null/i);
});

test("D1 supports per-member archive mute and inbox folders", () => {
  assert.match(sql, /marketplace_member_set_conversation_preferences/i);
  assert.match(sql, /archived_at=case/i);
  assert.match(sql, /muted_at=case/i);
  assert.match(sql, /marketplace_member_inbox_v2/i);
  for (const folder of ["buying","selling","unread","archived","muted"]) {
    assert.ok(sql.includes("'" + folder + "'"), folder);
  }
});

test("D1 public functions deny anon execution", () => {
  for (const signature of [
    "marketplace_member_send_message_v2(uuid,text,uuid)",
    "marketplace_member_set_conversation_preferences(uuid,boolean,boolean)",
    "marketplace_member_inbox_v2(text)",
    "marketplace_member_message_summary()"
  ]) {
    assert.ok(sql.includes("revoke all on function public." + signature), signature);
  }
});
