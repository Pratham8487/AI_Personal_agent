import pino from "pino";
import { adminSql } from "./db";
import { loadBaileys } from "./whatsapp-baileys";
import {
  clearAuthState,
  hasStoredCreds,
  loadAuthState,
} from "./whatsapp-auth-state";
import { bindStoreEvents, purgeUserData } from "./whatsapp-store";
import type { ConnectionState, WASocket } from "baileys";

/**
 * Per-user Baileys socket manager. Each linked user needs a long-lived
 * WebSocket, so this only works while the app runs as a persistent Node
 * process (next dev / next start) — NOT on serverless hosting. Sessions
 * survive restarts through the DB auth state + lazy reconnects.
 */

// DisconnectReason values (baileys src/Types); local constants keep the
// close handler synchronous instead of awaiting the ESM import.
const LOGGED_OUT = 401;
const FORBIDDEN = 403;
const CONNECTION_REPLACED = 440;
const BAD_SESSION = 500;
const RESTART_REQUIRED = 515;

const QR_WAIT_MS = 15_000;
const PAIRING_WINDOW_MS = 5 * 60_000;
const PAIRING_CODE_TTL_MS = 60_000;
const MAX_RECONNECT_ATTEMPTS = 5;

export class WhatsAppNotConnectedError extends Error {
  constructor() {
    super("WhatsApp is not connected. Connect it from the Integrations page.");
    this.name = "WhatsAppNotConnectedError";
  }
}

export class WhatsAppAlreadyLinkedError extends Error {
  constructor() {
    super("WhatsApp is already connected. Disconnect it before pairing again.");
    this.name = "WhatsAppAlreadyLinkedError";
  }
}

type ConnState = "connecting" | "pairing" | "open" | "closed";

type Managed = {
  sock: WASocket | null;
  state: ConnState;
  phone: string | null;
  /** Latest QR payload while pairing in QR mode; WhatsApp rotates it. */
  qr: string | null;
  pairingExpiresAt: number | null;
  pairingTimer: ReturnType<typeof setTimeout> | null;
  /** Per-user mutex: pairing or reconnect currently in flight. */
  startPromise: Promise<unknown> | null;
  /** Serialized creds writes; awaited before a socket restart so the
   * restarted socket never loads stale credentials from the DB. */
  credsWrite: Promise<void> | null;
  reconnectAttempts: number;
};

// Survives HMR in dev; a fresh module instance reuses the same sockets.
const globalStore = globalThis as unknown as {
  __waSessions?: Map<string, Managed>;
};
const sessions = (globalStore.__waSessions ??= new Map<string, Managed>());

function getOrCreate(userId: string): Managed {
  let session = sessions.get(userId);
  if (!session) {
    session = {
      sock: null,
      state: "closed",
      phone: null,
      qr: null,
      pairingExpiresAt: null,
      pairingTimer: null,
      startPromise: null,
      credsWrite: null,
      reconnectAttempts: 0,
    };
    sessions.set(userId, session);
  }
  return session;
}

function clearPairingTimer(session: Managed): void {
  if (session.pairingTimer) {
    clearTimeout(session.pairingTimer);
    session.pairingTimer = null;
  }
}

/** Ends the socket locally (the WhatsApp session stays valid). */
function teardownSocket(session: Managed): void {
  clearPairingTimer(session);
  session.pairingExpiresAt = null;
  session.qr = null;
  if (session.sock) {
    try {
      session.sock.end(undefined);
    } catch {
      // already closed
    }
    session.sock = null;
  }
  session.state = "closed";
}

/** Same upsert as markGmailStatus, for the whatsapp provider row. */
export async function markWhatsappStatus(
  userId: string,
  status: "connected" | "disconnected",
): Promise<void> {
  await adminSql(
    `INSERT INTO public.user_integrations (user_id, provider, status, connected_at)
     VALUES ($1, 'whatsapp', $2, CASE WHEN $2 = 'connected' THEN now() END)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       status = EXCLUDED.status,
       connected_at = EXCLUDED.connected_at,
       updated_at = now()`,
    [userId, status],
  );
}

/** whatsapp_auth_state references public.users; guarantee the row first
 * (same FK guard as Gmail — signup writes public.users directly). */
async function ensureUserRecord(userId: string): Promise<void> {
  await adminSql(
    `INSERT INTO public.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [userId],
  );
}

async function upsertSessionRow(
  userId: string,
  phone: string | null,
  waJid: string | null,
): Promise<void> {
  await adminSql(
    `INSERT INTO public.whatsapp_sessions (user_id, phone, wa_jid, linked_at, last_connected_at)
     VALUES ($1, COALESCE($2, ''), $3, now(), now())
     ON CONFLICT (user_id) DO UPDATE SET
       phone = COALESCE(NULLIF(EXCLUDED.phone, ''), public.whatsapp_sessions.phone),
       wa_jid = COALESCE(EXCLUDED.wa_jid, public.whatsapp_sessions.wa_jid),
       linked_at = COALESCE(public.whatsapp_sessions.linked_at, now()),
       last_connected_at = now(),
       updated_at = now()`,
    [userId, phone, waJid],
  );
}

async function createSocket(userId: string): Promise<WASocket> {
  const baileys = await loadBaileys();
  const { state, saveCreds } = await loadAuthState(userId);
  const logger = pino({ level: "silent" });
  const sock = baileys.default({
    auth: {
      creds: state.creds,
      keys: baileys.makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    // Keep the linked session passive so the phone keeps its notifications.
    markOnlineOnConnect: false,
    syncFullHistory: false,
    getMessage: async () => undefined,
  });
  const session = getOrCreate(userId);
  sock.ev.on("creds.update", () => {
    // Chain writes: HTTP-SQL latency varies, and an out-of-order upsert
    // would overwrite newer creds with older ones.
    session.credsWrite = (session.credsWrite ?? Promise.resolve())
      .then(() => saveCreds())
      .catch((error) => console.error("WhatsApp creds save failed:", error));
  });
  bindStoreEvents(userId, sock);
  return sock;
}

function wireConnectionEvents(userId: string, sock: WASocket): void {
  sock.ev.on("connection.update", (update) => {
    void handleConnectionUpdate(userId, sock, update).catch((error) =>
      console.error("WhatsApp connection handler failed:", error),
    );
  });
}

async function handleConnectionUpdate(
  userId: string,
  sock: WASocket,
  update: Partial<ConnectionState>,
): Promise<void> {
  const session = sessions.get(userId);
  // A newer socket owns this session; ignore events from the old one.
  if (!session || session.sock !== sock) return;

  if (update.qr) session.qr = update.qr;

  if (update.connection === "open") {
    session.state = "open";
    session.reconnectAttempts = 0;
    session.pairingExpiresAt = null;
    session.qr = null;
    clearPairingTimer(session);
    const waJid = sock.user?.id ? sock.user.id.replace(/:\d+@/, "@") : null;
    await upsertSessionRow(userId, session.phone, waJid);
    await markWhatsappStatus(userId, "connected");
    return;
  }

  if (update.connection !== "close") return;

  const code =
    (
      update.lastDisconnect?.error as
        | { output?: { statusCode?: number } }
        | undefined
    )?.output?.statusCode ?? 0;
  const registered = sock.authState.creds.registered === true;

  if (code === RESTART_REQUIRED) {
    // Expected right after a successful pairing: reopen on the same creds —
    // but only once the fresh creds have finished writing to the DB.
    session.state = "connecting";
    session.sock = null;
    void (async () => {
      await session.credsWrite;
      await startSocket(userId);
    })().catch((error) => {
      console.error("WhatsApp restart failed:", error);
      session.state = "closed";
    });
    return;
  }

  if (code === LOGGED_OUT || code === BAD_SESSION || code === FORBIDDEN) {
    // Device was unlinked (or the session is beyond repair): full reset.
    teardownSocket(session);
    sessions.delete(userId);
    await clearAuthState(userId);
    await purgeUserData(userId);
    await markWhatsappStatus(userId, "disconnected");
    return;
  }

  if (code === CONNECTION_REPLACED) {
    // Another process owns these creds; do not fight over the session.
    session.sock = null;
    session.state = "closed";
    return;
  }

  if (registered && session.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    const delay = 2_000 * 2 ** session.reconnectAttempts;
    session.reconnectAttempts += 1;
    session.state = "connecting";
    setTimeout(() => {
      const current = sessions.get(userId);
      if (current !== session || current.sock !== sock) return;
      current.sock = null;
      void startSocket(userId).catch((error) => {
        console.error("WhatsApp reconnect failed:", error);
        current.state = "closed";
      });
    }, delay);
    return;
  }

  session.sock = null;
  session.state = "closed";
}

/** Creates and wires a socket for a user with stored creds. */
async function startSocket(userId: string): Promise<WASocket> {
  const session = getOrCreate(userId);
  session.state = "connecting";
  const sock = await createSocket(userId);
  session.sock = sock;
  wireConnectionEvents(userId, sock);
  return sock;
}

function waitForQr(sock: WASocket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = (update: Partial<ConnectionState>) => {
      if (update.qr) {
        cleanup();
        resolve();
      } else if (update.connection === "close") {
        cleanup();
        reject(new Error("WhatsApp closed the connection during pairing."));
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for WhatsApp."));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      sock.ev.off("connection.update", handler);
    };
    sock.ev.on("connection.update", handler);
  });
}

/** Tears the pairing attempt down if the user never enters the code. */
function armPairingTimer(userId: string, session: Managed): void {
  clearPairingTimer(session);
  session.pairingTimer = setTimeout(() => {
    void (async () => {
      const current = sessions.get(userId);
      if (current !== session) return;
      if (current.sock?.authState.creds.registered) return;
      teardownSocket(current);
      await clearAuthState(userId);
    })().catch((error) =>
      console.error("WhatsApp pairing cleanup failed:", error),
    );
  }, PAIRING_WINDOW_MS);
}

/**
 * Starts a fresh pairing attempt: new socket + identity, then a numeric
 * linking code the user enters under WhatsApp > Linked Devices.
 */
export async function beginPairing(
  userId: string,
  phoneE164: string,
): Promise<{ pairingCode: string; expiresAt: string }> {
  if (await hasStoredCreds(userId)) throw new WhatsAppAlreadyLinkedError();

  const session = getOrCreate(userId);
  if (session.startPromise) {
    throw new Error("A pairing attempt is already in progress. Please retry in a moment.");
  }

  await ensureUserRecord(userId);
  teardownSocket(session);
  await clearAuthState(userId);
  session.phone = phoneE164;
  session.state = "pairing";

  const work = (async () => {
    const sock = await createSocket(userId);
    session.sock = sock;
    wireConnectionEvents(userId, sock);
    await waitForQr(sock, QR_WAIT_MS);
    // Digits only, no "+": Baileys encodes the string verbatim into a JID.
    return sock.requestPairingCode(phoneE164.replace(/\D/g, ""));
  })();
  session.startPromise = work
    .catch(() => {})
    .finally(() => {
      session.startPromise = null;
    });

  let rawCode: string;
  try {
    rawCode = await work;
  } catch (error) {
    teardownSocket(session);
    throw error;
  }

  session.pairingExpiresAt = Date.now() + PAIRING_CODE_TTL_MS;
  armPairingTimer(userId, session);
  return {
    pairingCode: rawCode.match(/.{1,4}/g)?.join("-") ?? rawCode,
    expiresAt: new Date(session.pairingExpiresAt).toISOString(),
  };
}

/**
 * QR-mode alternative to beginPairing: starts a fresh socket and returns
 * the first QR payload; rotations are exposed through getStatus while the
 * user scans from WhatsApp > Linked Devices.
 */
export async function beginQrPairing(userId: string): Promise<{ qr: string }> {
  if (await hasStoredCreds(userId)) throw new WhatsAppAlreadyLinkedError();

  const session = getOrCreate(userId);
  if (session.startPromise) {
    throw new Error("A pairing attempt is already in progress. Please retry in a moment.");
  }

  await ensureUserRecord(userId);
  teardownSocket(session);
  await clearAuthState(userId);
  session.phone = null;
  session.state = "pairing";

  const work = (async () => {
    const sock = await createSocket(userId);
    session.sock = sock;
    wireConnectionEvents(userId, sock);
    await waitForQr(sock, QR_WAIT_MS);
  })();
  session.startPromise = work
    .catch(() => {})
    .finally(() => {
      session.startPromise = null;
    });

  try {
    await work;
  } catch (error) {
    teardownSocket(session);
    throw error;
  }

  armPairingTimer(userId, session);
  if (!session.qr) throw new Error("Could not get a QR code. Please retry.");
  return { qr: session.qr };
}

async function waitForState(
  userId: string,
  target: ConnState,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  // Poll the session state: a 515 restart swaps the socket out mid-wait,
  // so listening on one socket's events would miss the eventual "open".
  while (Date.now() < deadline) {
    const session = sessions.get(userId);
    if (session?.state === target && session.sock) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Could not reach WhatsApp. Please retry.");
}

/** Returns an open socket, lazily reconnecting from stored creds. */
export async function ensureConnected(
  userId: string,
  timeoutMs = 20_000,
): Promise<WASocket> {
  const existing = sessions.get(userId);
  if (existing?.state === "open" && existing.sock) return existing.sock;

  if (existing?.startPromise) {
    await existing.startPromise;
  } else if (!existing || existing.state === "closed" || !existing.sock) {
    if (!(await hasStoredCreds(userId))) throw new WhatsAppNotConnectedError();
    const session = getOrCreate(userId);
    session.startPromise = startSocket(userId)
      .catch(() => {})
      .finally(() => {
        session.startPromise = null;
      });
    await session.startPromise;
  }

  await waitForState(userId, "open", timeoutMs);
  const session = sessions.get(userId);
  if (session?.state === "open" && session.sock) return session.sock;
  throw new WhatsAppNotConnectedError();
}

/** Open socket or null — read tools use this to avoid slow lazy connects. */
export function getOpenSocket(userId: string): WASocket | null {
  const session = sessions.get(userId);
  return session?.state === "open" && session.sock ? session.sock : null;
}

export type WhatsappStatus = {
  linked: boolean;
  connection: "open" | "connecting" | "closed" | "none";
  phone: string | null;
  pairingPending: boolean;
  /** Current QR payload while a QR pairing attempt is running. */
  qr: string | null;
};

/** Side-effect free: the pairing dialog polls this. */
export async function getStatus(userId: string): Promise<WhatsappStatus> {
  const session = sessions.get(userId);
  const liveRegistered = session?.sock?.authState.creds.registered === true;
  const linked = liveRegistered || (await hasStoredCreds(userId));

  let phone = session?.phone ?? null;
  if (!phone) {
    const rows = await adminSql<{ phone: string }>(
      "SELECT phone FROM public.whatsapp_sessions WHERE user_id = $1",
      [userId],
    );
    phone = rows[0]?.phone || null;
  }

  return {
    linked,
    connection: session
      ? session.state === "pairing"
        ? "connecting"
        : session.state
      : "none",
    phone,
    pairingPending: session?.state === "pairing" && !liveRegistered,
    qr: session?.state === "pairing" ? session.qr : null,
  };
}

/** Unlinks the device, wipes the session + synced data, marks disconnected. */
export async function disconnectUser(userId: string): Promise<void> {
  const session = sessions.get(userId);
  if (session) {
    clearPairingTimer(session);
    if (session.sock) {
      try {
        // Server-side unlink; fails harmlessly when pairing never finished.
        await session.sock.logout();
      } catch {
        // best effort, like Gmail's token revoke
      }
    }
    teardownSocket(session);
    sessions.delete(userId);
  }
  await clearAuthState(userId);
  await purgeUserData(userId);
  await markWhatsappStatus(userId, "disconnected");
}
