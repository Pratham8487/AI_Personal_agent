import { reapExpiredDemoUsers } from "./demo";
import { adminSql } from "./db";

/**
 * Retention sweep, piggybacked on the 15-minute briefing cron. Keeps the
 * database a rolling window instead of a forever-archive: WhatsApp messages
 * are a 30-day cache (the phone remains the source of truth), logs and OTPs
 * expire, and briefing history is capped per briefing.
 */

const WHATSAPP_RETENTION_DAYS = 30;
const LOG_RETENTION_DAYS = 30;
const BRIEFING_RESULTS_KEPT = 30;

export async function cleanupExpiredData(): Promise<void> {
  // Backstop for demo sessions the tab-close beacon missed (e.g. the last demo
  // user closed with no other demo traffic to trigger an opportunistic sweep).
  await reapExpiredDemoUsers();
  await adminSql(
    `DELETE FROM public.whatsapp_messages
     WHERE sent_at < now() - make_interval(days => $1::int)`,
    [WHATSAPP_RETENTION_DAYS],
  );
  // Chats whose messages have all aged out and that saw no activity since.
  await adminSql(
    `DELETE FROM public.whatsapp_chats c
     WHERE COALESCE(c.last_message_at, c.updated_at) < now() - make_interval(days => $1::int)
       AND NOT EXISTS (
         SELECT 1 FROM public.whatsapp_messages m
         WHERE m.user_id = c.user_id AND m.chat_jid = c.jid
       )`,
    [WHATSAPP_RETENTION_DAYS],
  );
  await adminSql(
    "DELETE FROM public.user_otp_verifications WHERE created_at < now() - interval '24 hours'",
  );
  await adminSql(
    "DELETE FROM public.password_reset_requests WHERE created_at < now() - interval '30 days'",
  );
  await adminSql(
    `DELETE FROM public.ai_refresh_logs
     WHERE refreshed_at < now() - make_interval(days => $1::int)`,
    [LOG_RETENTION_DAYS],
  );
  await adminSql(
    `DELETE FROM public.briefing_results WHERE id IN (
       SELECT id FROM (
         SELECT id, row_number() OVER (
           PARTITION BY briefing_id ORDER BY generated_at DESC
         ) AS rn
         FROM public.briefing_results
       ) ranked WHERE ranked.rn > $1::int
     )`,
    [BRIEFING_RESULTS_KEPT],
  );
  await adminSql(
    `DELETE FROM public.briefing_runs
     WHERE created_at < now() - make_interval(days => $1::int)`,
    [LOG_RETENTION_DAYS],
  );
}
