// lib/users.js
// Simple credential manager cycling through configured users
import { config } from '../config/env.js';

const users = [];
if (config.baseUrl) {
  // expecting env vars REGINSA_USER_1, REGINSA_PASS_1, etc.
  const max = 10; // arbitrary limit
  for (let i = 1; i <= max; i++) {
    const user = __ENV[`REGINSA_USER_${i}`];
    const pass = __ENV[`REGINSA_PASS_${i}`];
    if (user && pass) {
      users.push({ user, pass });
    }
  }
}
let idx = 0;
export function getNextCredentials() {
  if (users.length === 0) return null;
  const cred = users[idx % users.length];
  idx += 1;
  return cred;
}
