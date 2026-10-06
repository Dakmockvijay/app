// Central API base URL. Points to the hosted FastAPI backend on Render.
// Works for both Expo mobile (native) and Expo Web since it reads a public
// env var when present and otherwise falls back to the Render deployment.
export const API_BASE_URL =
  (process.env.EXPO_PUBLIC_API_URL && process.env.EXPO_PUBLIC_API_URL.trim()) ||
  "https://app-akxx.onrender.com";
