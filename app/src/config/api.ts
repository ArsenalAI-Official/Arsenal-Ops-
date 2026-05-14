// API Configuration
// In development, use localhost.
// In production, VITE_API_URL must be set explicitly — production builds
// refuse to boot with the localhost fallback so a missing env var becomes
// loud at deploy time instead of silently hitting a non-routable host.

const configured = import.meta.env.VITE_API_URL;

if (import.meta.env.PROD && !configured) {
  throw new Error(
    'VITE_API_URL is required in production builds. Set it in your deploy env ' +
      '(e.g. Vercel project settings) before rebuilding.',
  );
}

export const API_BASE_URL = configured || 'http://localhost:8000';
