// MSW handlers for the full auth surface AuthContext exercises: the current
// user (/api/auth/me), the effective capability set (/api/auth/me/capabilities),
// the login flows (password / Google / dev), password change, and the dev-login
// availability probe — plus the static capability registry (/api/auth/capabilities)
// the admin role-edit UI reads.
//
// All handlers resolve the HAPPY PATH from the seeded authStore. Edge cases
// (401 bad credentials, 400 wrong current-password, expired /me, etc.) are
// injected per-test with server.use(...), never by mutating these.
import { http, HttpResponse } from 'msw';
import { API_BASE } from './constants';
import { authStore } from '../data/auth';

export const authHandlers = [
  http.get(`${API_BASE}/auth/me`, () => HttpResponse.json(authStore.getUser())),

  // Static capability registry (admin role editor). Shape: [{key, description}]
  // — NOT the effective-caps string[]. useRolesAdmin consumes this as
  // Capability[], so it must return objects, not bare keys.
  http.get(`${API_BASE}/auth/capabilities`, () =>
    HttpResponse.json(authStore.getCapabilityRegistry()),
  ),

  // Effective caps for the calling user. Shape: { roles, capabilities }.
  // This is the endpoint AuthContext.fetchCapabilitiesWith() calls.
  http.get(`${API_BASE}/auth/me/capabilities`, () =>
    HttpResponse.json(authStore.getEffectiveCapabilities()),
  ),

  // Dev-login button visibility probe. Default: available (tests can override).
  http.get(`${API_BASE}/auth/dev-login/available`, () => HttpResponse.json({ available: true })),

  // Password login. Backend consumes form-urlencoded (OAuth2PasswordRequestForm)
  // and returns a Token. Success by default; force 401 per-test via server.use.
  http.post(`${API_BASE}/auth/login`, () => HttpResponse.json(authStore.getTokenResponse())),

  // Google SSO login (JSON { token }) → Token.
  http.post(`${API_BASE}/auth/google-login`, () => HttpResponse.json(authStore.getTokenResponse())),

  // Dev login → Token (200 when DEV_AUTH_BYPASS=1; 404 otherwise).
  http.post(`${API_BASE}/auth/dev-login`, () => HttpResponse.json(authStore.getTokenResponse())),

  // Change password → 200 with no body. Force 400 per-test via server.use.
  http.post(`${API_BASE}/auth/change-password`, () => new HttpResponse(null, { status: 200 })),
];
