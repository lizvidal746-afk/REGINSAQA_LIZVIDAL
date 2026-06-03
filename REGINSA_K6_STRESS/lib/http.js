// lib/http.js
// Central HTTP wrapper for K6 scripts in REGINSA_K6_STRESS
import http from 'k6/http';
import { check } from 'k6';
import { sleep } from 'k6';
import { getIpTag } from './ip.js';

export function request(method, url, payload = null, params = {}, retryOptions = { retries: 3, backoff: 0.5 }) {
  const ipTag = getIpTag();
  const defaultParams = {
    tags: { source_ip: ipTag },
    timeout: '60s',
    headers: { 'Content-Type': 'application/json' },
    ...params,
  };
  let res;
  for (let i = 0; i <= retryOptions.retries; i++) {
    try {
      if (method === 'GET') {
        res = http.get(url, defaultParams);
      } else if (method === 'POST') {
        res = http.post(url, JSON.stringify(payload), defaultParams);
      } else if (method === 'PUT') {
        res = http.put(url, JSON.stringify(payload), defaultParams);
      } else if (method === 'DELETE') {
        res = http.del(url, null, defaultParams);
      } else {
        throw new Error(`Unsupported method ${method}`);
      }
      // simple backoff on non‑2xx
      if (res.status >= 200 && res.status < 300) {
        return res;
      }
    } catch (e) {
      // ignore and retry
    }
    sleep(retryOptions.backoff * Math.pow(2, i));
  }
  return res;
}

export function multipartPut(url, filePath, params = {}, retryOptions) {
  const ipTag = getIpTag();
  const data = { file: http.file(open(filePath, 'b'), 'application/pdf') };
  const defaultParams = { tags: { source_ip: ipTag }, timeout: '120s', ...params };
  // reuse request wrapper with method PUT and raw multipart body
  return request('PUT', url, data, defaultParams, retryOptions);
}
