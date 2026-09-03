const API = '/api/v1';

let onUnauthorized = () => {};

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (res.status === 401) {
    onUnauthorized();
  }
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.detail || body.message || res.statusText);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  me: () => request('/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  logoutAll: () => request('/auth/logout-all', { method: 'POST' }),
  deleteAccount: () => request('/account', { method: 'DELETE' }),
  authStart: (provider) => request(`/auth/${provider}/start`, { method: 'POST' }),
  syncPush: (payload) => request('/sync', { method: 'POST', body: JSON.stringify(payload) }),
  syncPull: (since) =>
    request(`/sync${since ? `?since=${encodeURIComponent(since)}` : ''}`),
  contribute: (deck) =>
    request('/contribute', {
      method: 'POST',
      body: JSON.stringify({ ...deck, retain: deck.retain !== false }),
    }),
  devLogin: () => request('/auth/dev/login', { method: 'POST' }),
  report: (payload) => request('/reports', { method: 'POST', body: JSON.stringify(payload) }),
};
