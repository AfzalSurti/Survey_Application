import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import * as SecureStore from "expo-secure-store";

/** Production backend — baked in so surveyors never configure Settings. */
export const PRODUCTION_API_URL = "https://survey-application-4r6q.onrender.com";

export async function apiBaseUrl() {
  return PRODUCTION_API_URL;
}

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

export const api = axios.create({ timeout: 45000 });

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync("refresh_token");
  if (!refreshToken) return null;
  try {
    // Use plain axios so a 401 here does not recurse into the interceptor.
    const { data } = await axios.post<{ access_token: string; refresh_token: string }>(
      `${PRODUCTION_API_URL}/api/auth/refresh`,
      { refresh_token: refreshToken },
      { timeout: 30000 },
    );
    await SecureStore.setItemAsync("access_token", data.access_token);
    await SecureStore.setItemAsync("refresh_token", data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

function formatApiError(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    const ax = error as AxiosError<{ detail?: unknown }>;
    const status = ax.response?.status;
    const detail = ax.response?.data?.detail;
    let message = "";
    if (typeof detail === "string") message = detail;
    else if (Array.isArray(detail)) {
      message = detail
        .map((item) =>
          typeof item === "object" && item && "msg" in item ? String((item as { msg: string }).msg) : JSON.stringify(item),
        )
        .join("; ");
    } else if (detail != null) message = JSON.stringify(detail);

    if (status === 401) {
      return new Error(message || "Session expired — sign in again, then open Sync to upload pending surveys.");
    }
    if (!message) message = ax.message || `Request failed (${status || "network"})`;
    return new Error(status ? `${message}` : message);
  }
  return error instanceof Error ? error : new Error("Request failed");
}

api.interceptors.request.use(async (config) => {
  config.baseURL = PRODUCTION_API_URL;
  const token = await SecureStore.getItemAsync("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryConfig | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const token = await refreshPromise;
      if (token) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
    }
    return Promise.reject(formatApiError(error));
  },
);

/** Ensure we have a usable access token (refresh if needed). */
export async function ensureAuth(): Promise<boolean> {
  const access = await SecureStore.getItemAsync("access_token");
  if (access) {
    try {
      await api.get("/api/auth/me");
      return true;
    } catch {
      /* try refresh below */
    }
  }
  const token = await refreshAccessToken();
  return Boolean(token);
}

export async function login(email: string, password: string) {
  const { data } = await api.post("/api/auth/login", { email, password });
  await SecureStore.setItemAsync("access_token", data.tokens.access_token);
  await SecureStore.setItemAsync("refresh_token", data.tokens.refresh_token);
  return data;
}

export const logout = async () => {
  await SecureStore.deleteItemAsync("access_token");
  await SecureStore.deleteItemAsync("refresh_token");
};

export function isAuthErrorMessage(message?: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("401") || m.includes("session expired") || m.includes("unauthorized") || m.includes("sign in again");
}
