import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

import { api, setToken, clearToken, loadToken } from "@/src/api";

WebBrowser.maybeCompleteAuthSession();

export type User = {
  user_id: string;
  name: string;
  email: string;
  picture?: string | null;
  referral_code?: string;
  token_balance: number;
  is_admin: boolean;
  created_at: string;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, referral?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);
const processedSessionIds = new Set<string>();

function extractSessionId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const capturedUrl = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const token = await loadToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
    } catch {
      await clearToken();
      setUser(null);
    }
  }, []);

  const exchangeSession = useCallback(async (sessionId: string) => {
    if (processedSessionIds.has(sessionId)) return;
    processedSessionIds.add(sessionId);
    const res = await api.post<{ session_token: string; user: User }>("/auth/session", {
      session_id: sessionId,
    });
    await setToken(res.session_token);
    setUser(res.user);
  }, []);

  useEffect(() => {
    let sub: any;
    (async () => {
      try {
        if (Platform.OS === "web") {
          const sid =
            extractSessionId(window.location.hash) || extractSessionId(window.location.search);
          if (sid) {
            try {
              await exchangeSession(sid);
              const url = new URL(window.location.href);
              url.hash = "";
              url.searchParams.delete("session_id");
              window.history.replaceState(window.history.state, "", url.toString());
            } catch {}
            setLoading(false);
            return;
          }
        } else {
          sub = Linking.addEventListener("url", ({ url }) => {
            capturedUrl.current = url;
            const sid = extractSessionId(url);
            if (sid) exchangeSession(sid).catch(() => {});
          });
          const initial = await Linking.getInitialURL();
          const sid = extractSessionId(initial);
          if (sid) {
            try {
              await exchangeSession(sid);
            } catch {}
            setLoading(false);
            return;
          }
        }
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      if (sub) sub.remove();
    };
  }, [refresh, exchangeSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ session_token: string; user: User }>("/auth/login", {
      email,
      password,
    });
    await setToken(res.session_token);
    setUser(res.user);
  }, []);

  const signUp = useCallback(
    async (name: string, email: string, password: string, referral?: string) => {
      const res = await api.post<{ session_token: string; user: User }>("/auth/register", {
        name,
        email,
        password,
        referral_code: referral || null,
      });
      await setToken(res.session_token);
      setUser(res.user);
    },
    [],
  );

  const signInWithGoogle = useCallback(async () => {
    const redirectUrl =
      Platform.OS === "web" ? window.location.origin + "/" : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    let url: string | null = null;
    if (result.type === "success" && result.url) url = result.url;
    if (!url) url = capturedUrl.current;
    if (!url) url = await Linking.getInitialURL();
    const sid = extractSessionId(url);
    if (sid) await exchangeSession(sid);
  }, [exchangeSession]);

  const signOut = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    await clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signUp, signInWithGoogle, signOut, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
