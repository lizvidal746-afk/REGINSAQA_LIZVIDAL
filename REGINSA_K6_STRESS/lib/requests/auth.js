// lib/requests/auth.js
import { request } from '../http.js';
import { config } from '../../config/env.js';
import { getNextCredentials } from '../users.js';

export function login() {
  const creds = getNextCredentials();
  if (!creds) {
    throw new Error('No credentials configured');
  }
  const payload = {
    usuario: creds.user,
    clave: creds.pass,
  };
  const url = `${config.baseUrl}/Auth/Login`;
  const res = request('POST', url, payload);
  if (!res) throw new Error('Login request failed');
  const body = res.json();
  return body.token;
}
