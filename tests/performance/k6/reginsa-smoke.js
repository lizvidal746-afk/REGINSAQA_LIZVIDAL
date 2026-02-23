import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.K6_VUS || 5),
  iterations: __ENV.K6_ITERATIONS ? Number(__ENV.K6_ITERATIONS) : undefined,
  duration: __ENV.K6_DURATION || '1m'
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
const authHeader = __ENV.K6_AUTH_HEADER || '';

export default function () {
  const headers = authHeader ? { Authorization: authHeader } : undefined;
  const res = http.get(`${baseUrl}/`, { headers });

  check(res, {
    'status 200-399': (r) => r.status >= 200 && r.status < 400,
    'response under 2s': (r) => r.timings.duration < 2000
  });

  sleep(1);
}
