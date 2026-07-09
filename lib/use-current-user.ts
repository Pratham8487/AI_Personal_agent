"use client";

import { useEffect, useState } from "react";
import type { UserSchema } from "@insforge/sdk";
import { insforge } from "./insforge";

export function useCurrentUser() {
  const [user, setUser] = useState<UserSchema | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    insforge.auth.getCurrentUser().then(({ data }) => {
      if (!active) return;
      setUser(data?.user ?? null);
      setIsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return { user, isLoaded, setUser };
}
