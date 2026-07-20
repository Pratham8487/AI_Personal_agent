"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Distance from the bottom still treated as "following along". */
const THRESHOLD_PX = 64;

/**
 * Keeps a scroll container pinned to the newest content, but only while the
 * user is already at the bottom. Scrolling up to re-read an earlier answer
 * releases the pin, so a streaming reply no longer yanks the view back down
 * on every token; returning to the bottom re-engages it.
 */
export function useStickToBottom<T extends HTMLElement>(
  deps: readonly unknown[],
) {
  const ref = useRef<T>(null);
  const pinnedRef = useRef(true);
  const [isPinned, setIsPinned] = useState(true);

  const readPosition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const pinned = distance <= THRESHOLD_PX;
    pinnedRef.current = pinned;
    setIsPinned(pinned);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = ref.current;
    if (!el) return;
    pinnedRef.current = true;
    setIsPinned(true);
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, isPinned, onScroll: readPosition, scrollToBottom };
}
