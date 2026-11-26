import axios from "axios";

const defaultBackendUrl = typeof window !== "undefined"
  ? `${window.location.protocol}//${window.location.hostname}:5000`
  : "http://localhost:5000";

export const API_BASE_URL = import.meta.env.VITE_API_URL || defaultBackendUrl;
export const SOCKET_URL = import.meta.env.VITE_API_URL || defaultBackendUrl;

// In production, send API requests through the app's own origin. This
// keeps the httpOnly session cookie first-party in browsers that restrict
// cross-site cookies. Development can still use the configured backend URL.
const apiBaseURL = import.meta.env.PROD
  ? "/api"
  : import.meta.env.VITE_API_URL
    ? `${API_BASE_URL}/api`
    : "/api";

const instance = axios.create({
  baseURL: apiBaseURL,
  withCredentials: true,
});

// global response interceptor to handle expired sessions and 401 Unauthorized errors
instance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response ? error.response.status : null;

    if (status === 401) {
      const requestUrl = error.config?.url || "";
      // Exclude login and register routes from redirection/eviction to let them handle validation normally
      const isAuthRoute = requestUrl.includes("/auth/login") || requestUrl.includes("/auth/register") || requestUrl.includes("/auth/me");

      if (!isAuthRoute) {
        // Evict invalid session metadata from store
        localStorage.removeItem("settl_user");
        
        // Flag to trigger user-friendly toast error banner on Login page mount
        localStorage.setItem("settl_session_expired", "true");

        // Redirect browser to login route (forces memory reset of auth states)
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default instance;
