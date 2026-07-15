"use client";

import { useEffect, useState } from "react";
import { getCurrentUser, type AuthUser } from "./auth-client";

export function useCurrentUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    getCurrentUser().then((current) => {
      if (!active) return;
      setUser(current);
      setIsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return { user, isLoaded, setUser };
}
