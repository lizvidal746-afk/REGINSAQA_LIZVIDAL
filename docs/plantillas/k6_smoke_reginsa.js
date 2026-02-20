import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '2m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1200']
  }
};

const BASE_URL = __ENV.BASE_URL || 'https://example-reginsa.local';

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  check(res, {
    'status 200': (r) => r.status === 200,
    'duración aceptable': (r) => r.timings.duration < 1200
  });
  sleep(1);
}
