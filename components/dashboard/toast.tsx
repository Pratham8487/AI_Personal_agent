"use client";

import { useEffect, useState } from "react";

const AUTO_HIDE_MS = 5_000;

/** Transient bottom-center notice; re-shows whenever `message` changes. */
export default function Toast({ message }: { message: string | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message || !visible) return null;
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-amber-500/30 bg-white px-4 py-2.5 text-xs font-medium text-amber-700 shadow-lg dark:border-amber-500/30 dark:bg-zinc-900 dark:text-amber-400"
    >
      {message}
    </div>
  );
}
