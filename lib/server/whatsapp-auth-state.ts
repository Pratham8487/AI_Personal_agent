import { adminSql } from "./db";
import { loadBaileys } from "./whatsapp-baileys";
import type { AuthenticationState, SignalDataTypeMap } from "baileys";

/**
 * DB-backed replacement for Baileys' useMultiFileAuthState: one row per
 * credential blob in whatsapp_auth_state, keyed "creds" or
 * "<signal-type>-<id>". Values go through BufferJSON so binary key
 * material survives the jsonb round trip.
 */

async function readKeys(
  userId: string,
  keys: string[],
): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();
  const placeholders = keys.map((_, i) => `$${i + 2}`).join(", ");
  const rows = await adminSql<{ key: string; value: string }>(
    `SELECT key, value::text AS value FROM public.whatsapp_auth_state
     WHERE user_id = $1 AND key IN (${placeholders})`,
    [userId, ...keys],
  );
  return new Map(rows.map((row) => [row.key, row.value]));
}

/** Batched upsert + delete; keys.set fires on nearly every message. */
async function writeKeys(
  userId: string,
  upserts: Array<[key: string, json: string]>,
  removals: string[],
): Promise<void> {
  if (upserts.length > 0) {
    const values: string[] = [];
    const params: unknown[] = [userId];
    for (const [key, json] of upserts) {
      params.push(key, json);
      values.push(`($1, $${params.length - 1}, $${params.length}::jsonb)`);
    }
    await adminSql(
      `INSERT INTO public.whatsapp_auth_state (user_id, key, value)
       VALUES ${values.join(", ")}
       ON CONFLICT (user_id, key) DO UPDATE SET
         value = EXCLUDED.value,
         updated_at = now()`,
      params,
    );
  }
  if (removals.length > 0) {
    const placeholders = removals.map((_, i) => `$${i + 2}`).join(", ");
    await adminSql(
      `DELETE FROM public.whatsapp_auth_state
       WHERE user_id = $1 AND key IN (${placeholders})`,
      [userId, ...removals],
    );
  }
}

export async function loadAuthState(userId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const { initAuthCreds, BufferJSON, proto } = await loadBaileys();

  const stored = await readKeys(userId, ["creds"]);
  const credsJson = stored.get("creds");
  const creds: AuthenticationState["creds"] = credsJson
    ? JSON.parse(credsJson, BufferJSON.reviver)
    : initAuthCreds();

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(
        type: T,
        ids: string[],
      ) => {
        const rows = await readKeys(
          userId,
          ids.map((id) => `${type}-${id}`),
        );
        const data: { [id: string]: SignalDataTypeMap[T] } = {};
        for (const id of ids) {
          const json = rows.get(`${type}-${id}`);
          if (json === undefined) continue;
          let value = JSON.parse(json, BufferJSON.reviver);
          if (type === "app-state-sync-key" && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          data[id] = value as SignalDataTypeMap[T];
        }
        return data;
      },
      set: async (data) => {
        const upserts: Array<[string, string]> = [];
        const removals: string[] = [];
        for (const [type, byId] of Object.entries(data)) {
          for (const [id, value] of Object.entries(byId ?? {})) {
            if (value === null || value === undefined) {
              removals.push(`${type}-${id}`);
            } else {
              upserts.push([
                `${type}-${id}`,
                JSON.stringify(value, BufferJSON.replacer),
              ]);
            }
          }
        }
        await writeKeys(userId, upserts, removals);
      },
    },
  };

  return {
    state,
    saveCreds: () =>
      writeKeys(
        userId,
        [["creds", JSON.stringify(state.creds, BufferJSON.replacer)]],
        [],
      ),
  };
}

/** True when the stored creds finished pairing (device is linked). */
export async function hasStoredCreds(userId: string): Promise<boolean> {
  const rows = await adminSql<{ registered: string | null }>(
    `SELECT value->>'registered' AS registered
     FROM public.whatsapp_auth_state
     WHERE user_id = $1 AND key = 'creds'`,
    [userId],
  );
  return rows[0]?.registered === "true";
}

export async function clearAuthState(userId: string): Promise<void> {
  await adminSql("DELETE FROM public.whatsapp_auth_state WHERE user_id = $1", [
    userId,
  ]);
}
