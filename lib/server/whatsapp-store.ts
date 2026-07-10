import { adminSql } from "./phone-auth";
import { InvalidToolArgsError } from "./gmail-mcp";
import type { Chat, Contact, WAMessage, WASocket } from "baileys";

/**
 * Baileys no longer ships a message store, so chats/contacts/messages are
 * persisted from socket events into whatsapp_* tables; the read-side MCP
 * tools query those tables instead of the live socket.
 */

export type StoredMessage = {
  chat_jid: string;
  chat_name: string | null;
  sender_jid: string | null;
  sender_name: string | null;
  from_me: boolean;
  text: string | null;
  msg_type: string | null;
  sent_at: string;
};

export type ChatSummary = {
  jid: string;
  name: string | null;
  is_group: boolean;
  last_message_at: string | null;
};

export type ContactSummary = {
  jid: string;
  name: string | null;
  notify: string | null;
};

type MessageRow = {
  chat_jid: string;
  msg_id: string;
  sender_jid: string | null;
  sender_name: string | null;
  from_me: boolean;
  text: string | null;
  msg_type: string | null;
  sent_at: Date;
};

const INSERT_CHUNK = 200;

/** Strips the device suffix ("...:12@s.whatsapp.net"); keeps user/group/lid
 * JIDs and drops broadcast/newsletter noise. */
function storableJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const normalized = jid.replace(/:\d+@/, "@");
  return /@(s\.whatsapp\.net|g\.us|lid)$/.test(normalized) ? normalized : null;
}

function isGroupJid(jid: string): boolean {
  return jid.endsWith("@g.us");
}

/** messageTimestamp is a number or protobuf Long. */
function timestampToDate(value: unknown): Date {
  const seconds =
    typeof value === "number"
      ? value
      : value != null
        ? Number(value.toString())
        : 0;
  return seconds > 0 ? new Date(seconds * 1000) : new Date();
}

/** Wrapper types (ephemeral, view-once, ...) hide the payload one level down. */
function unwrapContent(
  message: WAMessage["message"],
): NonNullable<WAMessage["message"]> | null {
  let content = message ?? null;
  while (content) {
    const inner =
      content.ephemeralMessage?.message ??
      content.viewOnceMessage?.message ??
      content.viewOnceMessageV2?.message ??
      content.documentWithCaptionMessage?.message;
    if (!inner) break;
    content = inner;
  }
  return content;
}

/** Bookkeeping payloads that are not user-visible messages. */
const HIDDEN_TYPES = new Set([
  "protocolMessage",
  "reactionMessage",
  "pollUpdateMessage",
  "keepInChatMessage",
]);

function mapMessage(msg: WAMessage): MessageRow | null {
  const chatJid = storableJid(msg.key?.remoteJid);
  const msgId = msg.key?.id;
  if (!chatJid || !msgId) return null;
  const content = unwrapContent(msg.message);
  if (!content) return null;
  const type =
    Object.keys(content).find(
      (key) =>
        key !== "messageContextInfo" && key !== "senderKeyDistributionMessage",
    ) ?? null;
  if (!type || HIDDEN_TYPES.has(type)) return null;

  const poll =
    content.pollCreationMessage ??
    content.pollCreationMessageV2 ??
    content.pollCreationMessageV3;
  const pollOptions = (poll?.options ?? [])
    .map((option) => option?.optionName)
    .filter(Boolean)
    .join(" / ");
  const text =
    content.conversation ??
    content.extendedTextMessage?.text ??
    content.imageMessage?.caption ??
    content.videoMessage?.caption ??
    content.documentMessage?.caption ??
    (poll?.name
      ? `[poll] ${poll.name}${pollOptions ? ` — ${pollOptions}` : ""}`
      : `[${type.replace(/Message$/, "")}]`);

  const fromMe = msg.key?.fromMe === true;
  return {
    chat_jid: chatJid,
    msg_id: msgId,
    // In 1:1 chats the sender is the chat itself; in groups it's the
    // participant — never fall back to the group JID.
    sender_jid:
      storableJid(msg.key?.participant) ??
      (!fromMe && !isGroupJid(chatJid) ? chatJid : null),
    sender_name: msg.pushName ?? null,
    from_me: fromMe,
    text,
    msg_type: type,
    sent_at: timestampToDate(msg.messageTimestamp),
  };
}

async function insertMessages(
  userId: string,
  rows: MessageRow[],
): Promise<void> {
  for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
    const chunk = rows.slice(start, start + INSERT_CHUNK);
    const values: string[] = [];
    const params: unknown[] = [userId];
    for (const row of chunk) {
      params.push(
        row.chat_jid,
        row.msg_id,
        row.sender_jid,
        row.sender_name,
        row.from_me,
        row.text,
        row.msg_type,
        row.sent_at.toISOString(),
      );
      const base = params.length - 8;
      values.push(
        `($1, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}::timestamptz)`,
      );
    }
    await adminSql(
      `INSERT INTO public.whatsapp_messages
         (user_id, chat_jid, msg_id, sender_jid, sender_name, from_me, text, msg_type, sent_at)
       VALUES ${values.join(", ")}
       ON CONFLICT (user_id, chat_jid, msg_id) DO NOTHING`,
      params,
    );
  }

  // Keep the chat list fresh: bump last_message_at per touched chat.
  const latest = new Map<string, Date>();
  for (const row of rows) {
    const current = latest.get(row.chat_jid);
    if (!current || row.sent_at > current) latest.set(row.chat_jid, row.sent_at);
  }
  if (latest.size > 0) {
    const values: string[] = [];
    const params: unknown[] = [userId];
    for (const [jid, sentAt] of latest) {
      params.push(jid, isGroupJid(jid), sentAt.toISOString());
      values.push(
        `($1, $${params.length - 2}, $${params.length - 1}, $${params.length}::timestamptz)`,
      );
    }
    await adminSql(
      `INSERT INTO public.whatsapp_chats (user_id, jid, is_group, last_message_at)
       VALUES ${values.join(", ")}
       ON CONFLICT (user_id, jid) DO UPDATE SET
         last_message_at = GREATEST(
           COALESCE(public.whatsapp_chats.last_message_at, 'epoch'::timestamptz),
           EXCLUDED.last_message_at
         ),
         updated_at = now()`,
      params,
    );
  }
}

async function upsertChats(
  userId: string,
  chats: Array<Partial<Chat>>,
): Promise<void> {
  const rows = chats
    .map((chat) => ({ jid: storableJid(chat.id), name: chat.name ?? null }))
    .filter((row): row is { jid: string; name: string | null } => !!row.jid);
  if (rows.length === 0) return;
  const values: string[] = [];
  const params: unknown[] = [userId];
  for (const row of rows) {
    params.push(row.jid, isGroupJid(row.jid), row.name);
    values.push(
      `($1, $${params.length - 2}, $${params.length - 1}, $${params.length})`,
    );
  }
  await adminSql(
    `INSERT INTO public.whatsapp_chats (user_id, jid, is_group, name)
     VALUES ${values.join(", ")}
     ON CONFLICT (user_id, jid) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, public.whatsapp_chats.name),
       updated_at = now()`,
    params,
  );
}

async function upsertContacts(
  userId: string,
  contacts: Array<Partial<Contact>>,
): Promise<void> {
  // A contact can be addressed by lid AND phone-number JID; store a row
  // for each form so sender lookups hit from either.
  const rows = contacts.flatMap((contact) => {
    const jids = [contact.id, contact.lid, contact.phoneNumber]
      .map(storableJid)
      .filter((jid): jid is string => !!jid);
    return [...new Set(jids)].map((jid) => ({
      jid,
      name: contact.name ?? null,
      notify: contact.notify ?? null,
    }));
  });
  if (rows.length === 0) return;
  const values: string[] = [];
  const params: unknown[] = [userId];
  for (const row of rows) {
    params.push(row.jid, row.name, row.notify);
    values.push(
      `($1, $${params.length - 2}, $${params.length - 1}, $${params.length})`,
    );
  }
  await adminSql(
    `INSERT INTO public.whatsapp_contacts (user_id, jid, name, notify)
     VALUES ${values.join(", ")}
     ON CONFLICT (user_id, jid) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, public.whatsapp_contacts.name),
       notify = COALESCE(EXCLUDED.notify, public.whatsapp_contacts.notify),
       updated_at = now()`,
    params,
  );
}

function logStoreError(scope: string) {
  return (error: unknown) =>
    console.error(`WhatsApp store ingest failed (${scope}):`, error);
}

/** Persists history sync + live events for one user's socket. */
export function bindStoreEvents(userId: string, sock: WASocket): void {
  sock.ev.on("messaging-history.set", ({ chats, contacts, messages }) => {
    void (async () => {
      await upsertChats(userId, chats ?? []);
      await upsertContacts(userId, contacts ?? []);
      const rows = (messages ?? [])
        .map(mapMessage)
        .filter((row): row is MessageRow => row !== null);
      await insertMessages(userId, rows);
    })().catch(logStoreError("history"));
  });

  sock.ev.on("messages.upsert", ({ messages }) => {
    const rows = messages
      .map(mapMessage)
      .filter((row): row is MessageRow => row !== null);
    if (rows.length > 0) {
      void insertMessages(userId, rows).catch(logStoreError("messages"));
    }
  });

  sock.ev.on("chats.upsert", (chats) => {
    void upsertChats(userId, chats).catch(logStoreError("chats"));
  });
  sock.ev.on("chats.update", (updates) => {
    void upsertChats(userId, updates).catch(logStoreError("chats"));
  });
  sock.ev.on("contacts.upsert", (contacts) => {
    void upsertContacts(userId, contacts).catch(logStoreError("contacts"));
  });
  sock.ev.on("contacts.update", (updates) => {
    void upsertContacts(userId, updates).catch(logStoreError("contacts"));
  });
}

/** Records a message this app just sent, so history tools see it too. */
export async function recordSentMessage(
  userId: string,
  chatJid: string,
  text: string,
  msgId: string | null,
): Promise<void> {
  await insertMessages(userId, [
    {
      chat_jid: chatJid,
      msg_id: msgId ?? crypto.randomUUID(),
      sender_jid: null,
      sender_name: null,
      from_me: true,
      text,
      msg_type: "conversation",
      sent_at: new Date(),
    },
  ]);
}

const MESSAGE_SELECT = `
  SELECT m.chat_jid,
         COALESCE(c.name, ct.name, ct.notify) AS chat_name,
         m.sender_jid,
         COALESCE(m.sender_name, sct.name, sct.notify) AS sender_name,
         m.from_me, m.text, m.msg_type,
         to_char(m.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS sent_at
  FROM public.whatsapp_messages m
  LEFT JOIN public.whatsapp_chats c
    ON c.user_id = m.user_id AND c.jid = m.chat_jid
  LEFT JOIN public.whatsapp_contacts ct
    ON ct.user_id = m.user_id AND ct.jid = m.chat_jid
  LEFT JOIN public.whatsapp_contacts sct
    ON sct.user_id = m.user_id AND sct.jid = m.sender_jid`;

/**
 * History-sync messages often lack a push name while live messages from
 * the same sender carry one; borrow the latest known name per sender so
 * group transcripts don't show "Unknown".
 */
async function fillSenderNames(
  userId: string,
  rows: StoredMessage[],
): Promise<StoredMessage[]> {
  const missing = [
    ...new Set(
      rows
        .filter((row) => !row.sender_name && !row.from_me && row.sender_jid)
        .map((row) => row.sender_jid as string),
    ),
  ];
  if (missing.length === 0) return rows;
  const placeholders = missing.map((_, i) => `$${i + 2}`).join(", ");
  const known = await adminSql<{ sender_jid: string; sender_name: string }>(
    `SELECT DISTINCT ON (sender_jid) sender_jid, sender_name
     FROM public.whatsapp_messages
     WHERE user_id = $1 AND sender_jid IN (${placeholders}) AND sender_name IS NOT NULL
     ORDER BY sender_jid, sent_at DESC`,
    [userId, ...missing],
  );
  if (known.length === 0) return rows;
  const names = new Map(known.map((row) => [row.sender_jid, row.sender_name]));
  return rows.map((row) =>
    row.sender_name || !row.sender_jid
      ? row
      : { ...row, sender_name: names.get(row.sender_jid) ?? null },
  );
}

export async function getRecentMessages(
  userId: string,
  count: number,
): Promise<StoredMessage[]> {
  const rows = await adminSql<StoredMessage>(
    `${MESSAGE_SELECT}
     WHERE m.user_id = $1
     ORDER BY m.sent_at DESC
     LIMIT $2`,
    [userId, count],
  );
  return fillSenderNames(userId, rows);
}

export async function getChatHistory(
  userId: string,
  chatJid: string,
  count: number,
  before?: string,
): Promise<StoredMessage[]> {
  const params: unknown[] = [userId, chatJid, count];
  let filter = "";
  if (before) {
    params.push(before);
    filter = "AND m.sent_at < $4::timestamptz";
  }
  const rows = await adminSql<StoredMessage>(
    `${MESSAGE_SELECT}
     WHERE m.user_id = $1 AND m.chat_jid = $2 ${filter}
     ORDER BY m.sent_at DESC
     LIMIT $3`,
    params,
  );
  return fillSenderNames(userId, rows);
}

function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export async function searchChats(
  userId: string,
  query: string,
  count: number,
  options: { groupsOnly?: boolean } = {},
): Promise<ChatSummary[]> {
  const groupFilter = options.groupsOnly ? "WHERE t.is_group" : "";
  return adminSql<ChatSummary>(
    `SELECT t.jid, t.name, t.is_group, t.last_message_at FROM (
       SELECT c.jid,
              COALESCE(c.name, ct.name, ct.notify) AS name,
              c.is_group,
              to_char(c.last_message_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_message_at
       FROM public.whatsapp_chats c
       LEFT JOIN public.whatsapp_contacts ct
         ON ct.user_id = c.user_id AND ct.jid = c.jid
       WHERE c.user_id = $1
       UNION
       SELECT ct.jid, COALESCE(ct.name, ct.notify) AS name, false, NULL
       FROM public.whatsapp_contacts ct
       WHERE ct.user_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM public.whatsapp_chats c2
           WHERE c2.user_id = $1 AND c2.jid = ct.jid
         )
     ) t ${groupFilter ? `${groupFilter} AND` : "WHERE"} t.name ILIKE $2
     ORDER BY t.last_message_at DESC NULLS LAST, t.name
     LIMIT $3`,
    [userId, likePattern(query), count],
  );
}

/** Individual chats ranked by message volume — "frequently contacted". */
export async function getFrequentChats(
  userId: string,
  count: number,
): Promise<ChatSummary[]> {
  return adminSql<ChatSummary>(
    `SELECT m.chat_jid AS jid,
            COALESCE(c.name, ct.name, ct.notify) AS name,
            false AS is_group,
            to_char(max(m.sent_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_message_at
     FROM public.whatsapp_messages m
     LEFT JOIN public.whatsapp_chats c
       ON c.user_id = m.user_id AND c.jid = m.chat_jid
     LEFT JOIN public.whatsapp_contacts ct
       ON ct.user_id = m.user_id AND ct.jid = m.chat_jid
     WHERE m.user_id = $1 AND m.chat_jid NOT LIKE '%@g.us'
       AND (m.chat_jid NOT LIKE '%@lid'
            OR COALESCE(c.name, ct.name, ct.notify) IS NOT NULL)
     GROUP BY m.chat_jid, c.name, ct.name, ct.notify
     ORDER BY count(*) DESC
     LIMIT $2`,
    [userId, count],
  );
}

export async function listGroupsDb(userId: string): Promise<ChatSummary[]> {
  return adminSql<ChatSummary>(
    `SELECT jid, name, is_group,
            to_char(last_message_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_message_at
     FROM public.whatsapp_chats
     WHERE user_id = $1 AND is_group
     ORDER BY last_message_at DESC NULLS LAST, name`,
    [userId],
  );
}

export async function getContact(
  userId: string,
  input: string,
): Promise<ContactSummary[]> {
  const trimmed = input.trim();
  if (trimmed.includes("@")) {
    return adminSql<ContactSummary>(
      "SELECT jid, name, notify FROM public.whatsapp_contacts WHERE user_id = $1 AND jid = $2",
      [userId, trimmed.replace(/:\d+@/, "@")],
    );
  }
  const digits = trimmed.replace(/[\s().+-]/g, "");
  if (/^\d{6,15}$/.test(digits)) {
    return adminSql<ContactSummary>(
      "SELECT jid, name, notify FROM public.whatsapp_contacts WHERE user_id = $1 AND jid = $2",
      [userId, `${digits}@s.whatsapp.net`],
    );
  }
  return adminSql<ContactSummary>(
    `SELECT jid, name, notify FROM public.whatsapp_contacts
     WHERE user_id = $1 AND (name ILIKE $2 OR notify ILIKE $2)
     ORDER BY name NULLS LAST
     LIMIT 10`,
    [userId, likePattern(trimmed)],
  );
}

/**
 * Turns a phone number, JID, or chat name into a concrete chat JID.
 * Ambiguous or missing names raise InvalidToolArgsError so the MCP layer
 * reports them as bad arguments.
 */
export async function resolveChatJid(
  userId: string,
  input: string,
  options: { groupOnly?: boolean } = {},
): Promise<string> {
  const trimmed = input.trim();
  const kind = options.groupOnly ? "group" : "chat";

  if (trimmed.includes("@")) {
    const jid = trimmed.replace(/:\d+@/, "@");
    if (options.groupOnly && !isGroupJid(jid)) {
      throw new InvalidToolArgsError(
        "Expected a group JID (ending in @g.us) or a group name.",
      );
    }
    return jid;
  }

  const digits = trimmed.replace(/[\s().+-]/g, "");
  if (/^\d{6,15}$/.test(digits)) {
    if (options.groupOnly) {
      throw new InvalidToolArgsError(
        "Groups cannot be addressed by phone number; pass the group name or JID.",
      );
    }
    return `${digits}@s.whatsapp.net`;
  }

  const matches = await searchChats(userId, trimmed, 6, {
    groupsOnly: options.groupOnly,
  });
  const exact = matches.filter(
    (match) => match.name?.toLowerCase() === trimmed.toLowerCase(),
  );
  const candidates = exact.length === 1 ? exact : matches;
  if (candidates.length === 1) return candidates[0].jid;
  if (candidates.length === 0) {
    throw new InvalidToolArgsError(
      `No WhatsApp ${kind} found matching "${input}".`,
    );
  }
  const listing = candidates
    .map((match) => `${match.name ?? "Unnamed"} (${match.jid})`)
    .join(", ");
  throw new InvalidToolArgsError(
    `Multiple ${kind}s match "${input}": ${listing}. Pass the JID instead.`,
  );
}

/** Removes every stored WhatsApp row for the user (not the auth state). */
export async function purgeUserData(userId: string): Promise<void> {
  await adminSql(
    `WITH m AS (DELETE FROM public.whatsapp_messages WHERE user_id = $1),
          c AS (DELETE FROM public.whatsapp_chats WHERE user_id = $1),
          ct AS (DELETE FROM public.whatsapp_contacts WHERE user_id = $1)
     DELETE FROM public.whatsapp_sessions WHERE user_id = $1`,
    [userId],
  );
}
