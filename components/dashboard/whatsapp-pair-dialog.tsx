"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { customArray } from "country-codes-list";
import Modal from "./modal";

/** Same shape normalizePhone accepts server-side. */
const PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;

type Country = { iso: string; name: string; dial: string };

const COUNTRIES: Country[] = customArray(
  {
    iso: "{countryCode}",
    name: "{countryNameEn}",
    dial: "{countryCallingCode}",
  },
  { sortDataBy: "countryNameEn" },
)
  .map((entry) => ({
    iso: entry.iso,
    name: entry.name,
    dial: entry.dial.replace(/\D/g, ""),
  }))
  .filter((entry) => entry.iso && entry.name && entry.dial);

const POLL_INTERVAL_MS = 2_500;
const POLL_TIMEOUT_MS = 150_000;

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500";

const primaryButtonClass =
  "rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85 disabled:opacity-50";

const secondaryButtonClass =
  "rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5";

type Phase = "enter-phone" | "requesting" | "show-code" | "success";

/** Compact country-code dropdown: search + fixed-height scrollable list. */
function CountryCodePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const selected = COUNTRIES.find((c) => c.iso === value);
  const term = filter.trim().toLowerCase();
  const filtered = term
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.iso.toLowerCase() === term ||
          `+${c.dial}`.startsWith(term.startsWith("+") ? term : `+${term}`),
      )
    : COUNTRIES;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="Country code"
        className={`${inputClass.replace("w-full", "w-24")} text-left`}
      >
        {selected ? `+${selected.dial} ${selected.iso}` : "Code"}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute top-full z-20 mt-1 w-72 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-white/10 dark:bg-[#17111f]">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search country or code…"
              autoFocus
              className={inputClass}
            />
            <ul className="no-scrollbar mt-1.5 max-h-48 overflow-y-auto">
              {filtered.map((c) => (
                <li key={c.iso}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(c.iso);
                      setOpen(false);
                      setFilter("");
                    }}
                    className="flex w-full items-baseline justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-900 transition-colors hover:bg-zinc-100 dark:text-white dark:hover:bg-white/5"
                  >
                    <span className="break-words">{c.name}</span>
                    <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                      +{c.dial}
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-2.5 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  No countries match.
                </li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Connect-WhatsApp flow: phone number -> linking code -> poll until the
 * user enters the code under WhatsApp > Linked Devices.
 */
export default function WhatsappPairDialog({
  userId,
  onLinked,
  onClose,
}: {
  userId: string;
  onLinked: () => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("enter-phone");
  const [country, setCountry] = useState("IN");
  const [nationalNumber, setNationalNumber] = useState("");
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const linkedRef = useRef(false);

  const dial = COUNTRIES.find((c) => c.iso === country)?.dial ?? "";
  // National number: digits only, without the trunk "0" some countries use.
  const normalized = `+${dial}${nationalNumber.replace(/\D/g, "").replace(/^0+/, "")}`;
  const phoneValid = PHONE_PATTERN.test(normalized);

  const requestCode = useCallback(async () => {
    setPhase("requesting");
    setError(null);
    try {
      const res = await fetch("/api/integrations/whatsapp/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, phone: normalized }),
      });
      const body = (await res.json().catch(() => null)) as {
        pairingCode?: string;
        expiresAt?: string;
        error?: string;
      } | null;
      if (!res.ok || !body?.pairingCode) {
        setError(body?.error ?? "Could not generate a linking code. Please retry.");
        setPhase("enter-phone");
        return;
      }
      setCode(body.pairingCode);
      setExpiresAt(body.expiresAt ? Date.parse(body.expiresAt) : Date.now());
      setNow(Date.now());
      setPhase("show-code");
    } catch {
      setError("Could not reach the server. Please retry.");
      setPhase("enter-phone");
    }
  }, [userId, normalized]);

  // Poll until the phone confirms the link.
  useEffect(() => {
    if (phase !== "show-code") return;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        clearInterval(interval);
        setError("Pairing timed out. Get a new code to retry.");
        return;
      }
      fetch(`/api/integrations/whatsapp/status?uid=${userId}`)
        .then((res) => res.json())
        .then((status: { linked?: boolean; connection?: string }) => {
          if (status?.linked && status.connection === "open") {
            clearInterval(interval);
            linkedRef.current = true;
            setError(null);
            setPhase("success");
            onLinked();
          }
        })
        .catch(() => {
          // transient; keep polling
        });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [phase, userId, onLinked]);

  // Ticks the expiry countdown.
  useEffect(() => {
    if (phase !== "show-code") return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "success") return;
    const timer = setTimeout(onClose, 1_500);
    return () => clearTimeout(timer);
  }, [phase, onClose]);

  const handleClose = () => {
    if (!linkedRef.current) {
      // Cancel the pairing attempt server-side; best effort.
      void fetch("/api/integrations/whatsapp/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }).catch(() => {});
    }
    onClose();
  };

  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));

  return (
    <Modal title="Connect WhatsApp" onClose={handleClose}>
      {(phase === "enter-phone" || phase === "requesting") && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (phoneValid && phase === "enter-phone") void requestCode();
          }}
        >
          <label
            htmlFor="whatsapp-phone"
            className="block text-sm font-medium text-zinc-900 dark:text-white"
          >
            Your WhatsApp phone number
          </label>
          <div className="mt-3 flex gap-2">
            <CountryCodePicker value={country} onChange={setCountry} />
            <input
              id="whatsapp-phone"
              type="tel"
              value={nationalNumber}
              onChange={(e) => setNationalNumber(e.target.value)}
              placeholder="123456789"
              autoFocus
              className={inputClass}
            />
          </div>
          {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={!phoneValid || phase === "requesting"}
              className={primaryButtonClass}
            >
              {phase === "requesting" ? "Generating code…" : "Get linking code"}
            </button>
          </div>
        </form>
      )}

      {phase === "show-code" && (
        <div>
          <p className="text-sm text-zinc-700 dark:text-zinc-200">
            Enter this code in WhatsApp on your phone:
          </p>
          <p className="my-4 text-center font-mono text-3xl font-semibold tracking-[0.2em] text-zinc-900 dark:text-white">
            {code}
          </p>
          <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
            {secondsLeft > 0 ? (
              <>Code expires in {secondsLeft}s</>
            ) : (
              <>The code may have expired.</>
            )}
          </p>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            <li>Open WhatsApp and go to Settings → Linked Devices.</li>
            <li>Tap “Link a Device”.</li>
            <li>Tap “Link with phone number instead”.</li>
            <li>Enter the code above.</li>
          </ol>
          {error ? (
            <p className="mt-4 text-sm text-rose-500">{error}</p>
          ) : (
            <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              Waiting for you to link the device…
            </p>
          )}
          {(error || secondsLeft === 0) && (
            <button
              type="button"
              onClick={() => void requestCode()}
              className={`mt-3 ${secondaryButtonClass}`}
            >
              Get new code
            </button>
          )}
        </div>
      )}

      {phase === "success" && (
        <div className="py-4 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-2xl">
            ✓
          </span>
          <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-white">
            WhatsApp connected
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Your chats are syncing in the background.
          </p>
        </div>
      )}
    </Modal>
  );
}
