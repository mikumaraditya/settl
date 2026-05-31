import axios from "axios";

const defaultBackendUrl = typeof window !== "undefined"
  ? `${window.location.protocol}//${window.location.hostname}:5000`
  : "http://localhost:5000";

export const API_BASE_URL = import.meta.env.VITE_API_URL || defaultBackendUrl;
export const SOCKET_URL = import.meta.env.VITE_API_URL || defaultBackendUrl;

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${API_BASE_URL}/api` : "/api",
});

// automatically attach token to every request
instance.interceptors.request.use((config) => {
  const user = JSON.parse(localStorage.getItem("settl_user"));
  if (user?.token) {
    config.headers.Authorization = `Bearer ${user.token}`;
  }
  return config;
});

export default instance;
