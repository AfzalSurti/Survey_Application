import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const defaultUrl = Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";
export async function apiBaseUrl() { return (await SecureStore.getItemAsync("api_base_url")) ?? defaultUrl; }
export const api = axios.create({ timeout: 15000 });
api.interceptors.request.use(async config => {
  config.baseURL = await apiBaseUrl();
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
export const setApiBaseUrl = (url: string) => SecureStore.setItemAsync("api_base_url", url.replace(/\/$/, ""));
export const logout = () => SecureStore.deleteItemAsync("access_token");
