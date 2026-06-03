// lib/checks.js
import { check } from 'k6';
import { STATUS_CODES } from '../config/status-codes.js';

export function validateResponse(resp, expected = STATUS_CODES.SUCCESS) {
  const ok = check(resp, {
    'status is expected': (r) => {
      if (Array.isArray(expected)) {
        return expected.includes(r.status);
      }
      return r.status === expected;
    },
    'body contains bSuccess true': (r) => {
      try {
        const body = r.json();
        return body.bSuccess === true;
      } catch (e) {
        return false;
      }
    },
  });
  return ok;
}
