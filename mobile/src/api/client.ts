import axios from "axios";
import * as SecureStore from "expo-secure-store";

/** Production backend — baked in so surveyors never configure Settings. */
export const PRODUCTION_API_URL = "https://survey-application-4r6q.onrender.com";

export async function apiBaseUrl() {
  return PRODUCTION_API_URL;
}

export const api = axios.create({ timeout: 30000 });

api.interceptors.request.use(async (config) => {
  config.baseURL = PRODUCTION_API_URL;
  const token = await SecureStore.getItemAsync("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

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
