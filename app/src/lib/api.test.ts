import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import { apiFetch, ApiError } from './api';

describe('apiFetch', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves with JSON on 200', async () => {
    const mockResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

    const result = await apiFetch<{ ok: boolean }>('/api/test');
    expect(result).toEqual({ ok: true });
  });

  it('throws ApiError with status on 400', async () => {
    server.use(
      http.get('http://localhost:8000/api/test', () => {
        return HttpResponse.json({ detail: 'bad request' }, { status: 400 });
      }),
    );

    try {
      await apiFetch('/api/test');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err instanceof ApiError && err.status).toBe(400);
      expect(err instanceof ApiError && err.message).toContain('Bad Request');
    }
  });

  it('throws ApiError with status on 500', async () => {
    server.use(
      http.get('http://localhost:8000/api/test', () => {
        return HttpResponse.json({ detail: 'server error' }, { status: 500 });
      }),
    );

    try {
      await apiFetch('/api/test');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err instanceof ApiError && err.status).toBe(500);
    }
  });

  it('propagates Authorization header from localStorage', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const mockResponse = new Response(JSON.stringify({ value: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    fetchSpy.mockResolvedValueOnce(mockResponse);

    localStorage.setItem('token', 'test-token-123');
    const result = await apiFetch<{ value: string }>('/api/test');
    expect(result.value).toBe('ok');

    const call = fetchSpy.mock.calls[0];
    const headers = call[1] as RequestInit;
    expect(headers.headers).toHaveProperty('Authorization', 'Bearer test-token-123');
  });

  it('does NOT propagate Authorization when no token', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const mockResponse = new Response(JSON.stringify({ value: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    fetchSpy.mockResolvedValueOnce(mockResponse);

    const result = await apiFetch<{ value: string }>('/api/test');
    expect(result.value).toBe('ok');

    const call = fetchSpy.mock.calls[0];
    const headers = call[1] as RequestInit;
    expect((headers.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('handles network failure', async () => {
    server.use(
      http.get('http://localhost:8000/api/test', () => {
        return HttpResponse.error();
      }),
    );

    try {
      await apiFetch('/api/test');
      expect.fail('should have thrown');
    } catch (err) {
      // fetch() throws TypeError on network error
      expect(err).toBeInstanceOf(TypeError);
    }
  });

  it('respects custom headers passed in options.headers', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const mockResponse = new Response(JSON.stringify({ value: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    fetchSpy.mockResolvedValueOnce(mockResponse);

    localStorage.setItem('token', 'test-token');
    const result = await apiFetch<{ value: string }>('/api/test', { headers: { 'X-Foo': 'bar' } });
    expect(result.value).toBe('ok');

    const call = fetchSpy.mock.calls[0];
    const headers = call[1] as RequestInit;
    expect((headers.headers as Record<string, string>)['X-Foo']).toBe('bar');
    expect((headers.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });

  it('JSON-stringifies body objects and sets Content-Type', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const mockResponse = new Response(JSON.stringify({ value: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    fetchSpy.mockResolvedValueOnce(mockResponse);

    const payload = JSON.stringify({ name: 'test' });
    const result = await apiFetch<{ value: string }>('/api/test', {
      method: 'POST',
      body: payload,
    });
    expect(result.value).toBe('ok');

    const call = fetchSpy.mock.calls[0];
    const headers = call[1] as RequestInit;
    expect((headers.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(headers.body).toBe('{"name":"test"}');
  });

  it('returns undefined for 204 No Content', async () => {
    server.use(
      http.delete('http://localhost:8000/api/test', () => {
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const result = await apiFetch('/api/test', { method: 'DELETE' });
    expect(result).toBeUndefined();
  });

  it('uses statusText when response body is not JSON', async () => {
    server.use(
      http.get('http://localhost:8000/api/test', () => {
        return new HttpResponse('Plain text error', { status: 400, statusText: 'Bad Request' });
      }),
    );

    try {
      await apiFetch('/api/test');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err instanceof ApiError && err.message).toBe('Bad Request');
    }
  });
});
