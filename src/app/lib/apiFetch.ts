import { supabase, projectId, publicAnonKey } from './supabaseClient';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1`;

/**
 * Authenticated fetch wrapper for Edge Function calls.
 * Gateway auth: Authorization: Bearer <anon_key>
 * User identity: X-User-Token: <user_jwt>
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token;

  if (!jwt) {
    throw new Error('Not authenticated');
  }

  const headers = new Headers(options.headers);
  // Authorization carries the anon key so the Supabase API gateway
  // accepts the request (it validates this JWT at the gateway level).
  headers.set('Authorization', `Bearer ${publicAnonKey}`);
  // The real user JWT goes in X-User-Token so the Edge Function's
  // requireAuth middleware can validate it server-side.
  headers.set('X-User-Token', jwt);
  headers.set('apikey', publicAnonKey);
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
}

/**
 * Returns the current session JWT or null.
 * Useful when you need the token but don't want to use apiFetch.
 */
export async function getSessionToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}