import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { $upsertUser } from "./user.server";

interface AppUser {
  email: string;
  displayName: string;
  initials: string;
}

const UserContext = createContext<AppUser | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data: { email: string }) => {
        if (data.email) {
          const namePart = data.email.split("@")[0] || "";
          const displayName = namePart.split(".").map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
          const initials = namePart.split(".").map((p: string) => p.charAt(0).toUpperCase()).join("").slice(0, 2);
          const u = { email: data.email, displayName, initials };
          setUser(u);
          $upsertUser({ data: { email: u.email, displayName: u.displayName } }).catch(console.error);
        } else {
          setUser({ email: "", displayName: "Unknown", initials: "?" });
        }
      })
      .catch(() => setUser({ email: "", displayName: "Unknown", initials: "?" }));
  }, []);

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useCurrentUser(): AppUser | null {
  return useContext(UserContext);
}
