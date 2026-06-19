// Admin mutation handlers. These back the AdminDashboard hook mutations whose
// onSettled/onSuccess fire the cross-cutting cache invalidations (app/CLAUDE.md).
// The invalidation tests assert the invalidated key sets, so these acks only
// need to resolve 2xx with minimal valid JSON.
import { http, HttpResponse } from 'msw';
import { API_BASE } from './constants';

export const adminHandlers = [
  // ── list reads (back the admin tab queries; empty by default) ──
  http.get(`${API_BASE}/admin/projects`, () => HttpResponse.json([])),
  http.get(`${API_BASE}/admin/project-categories/`, () => HttpResponse.json([])),
  http.get(`${API_BASE}/admin/projects/weekly-report`, () => HttpResponse.json([])),
  http.get(`${API_BASE}/admin/employees`, () => HttpResponse.json([])),
  http.get(`${API_BASE}/admin/developers/capacity`, () => HttpResponse.json([])),
  http.get(`${API_BASE}/admin/stats`, () =>
    HttpResponse.json({ total_projects: 0, total_users: 0, total_employees: 0 }),
  ),
  http.get(`${API_BASE}/auth/admin/users`, () => HttpResponse.json([])),
  http.get(`${API_BASE}/auth/admin/roles`, () => HttpResponse.json([])),

  // project categories
  http.post(`${API_BASE}/admin/project-categories/`, () =>
    HttpResponse.json({ id: 1, name: 'X', description: null }),
  ),
  http.put(`${API_BASE}/admin/project-categories/:id`, () =>
    HttpResponse.json({ id: 1, name: 'X', description: null }),
  ),
  http.delete(
    `${API_BASE}/admin/project-categories/:id`,
    () => new HttpResponse(null, { status: 204 }),
  ),

  // users
  http.post(`${API_BASE}/auth/admin/create-user`, () => HttpResponse.json({ status: 'created' })),
  http.delete(`${API_BASE}/auth/admin/users/:id`, () => new HttpResponse(null, { status: 204 })),

  // role assignment on a user (assign / unassign)
  http.post(
    `${API_BASE}/auth/admin/users/:userId/roles/:roleId`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.delete(
    `${API_BASE}/auth/admin/users/:userId/roles/:roleId`,
    () => new HttpResponse(null, { status: 204 }),
  ),

  // employees
  http.post(`${API_BASE}/admin/employees`, () =>
    HttpResponse.json({ id: 1, name: 'Test', email: 'a@b.com' }),
  ),
  http.put(`${API_BASE}/admin/employees/:id`, () =>
    HttpResponse.json({ id: 1, name: 'Test', email: 'a@b.com' }),
  ),
  http.delete(`${API_BASE}/admin/employees/:id`, () => new HttpResponse(null, { status: 204 })),
];
