// src/api/client.js
// Centralized HTTP Client with automatic 429 retry and exponential backoff

import http from 'k6/http';
import { sleep } from 'k6';
import { config } from '../config/index.js';
import {
  errorRate,
  businessLimitHits,
  httpOutcomeCounter,
  rateLimitedRequests,
  recordApdex,
  sessionSuccessRate,
  timeoutErrors,
  ttfbTrend,
  unexpectedErrors,
} from '../../lib/metrics.js';

export function getSourceIp() {
  if (!config.localIps || config.localIps.length === 0) return __ENV.K6_SOURCE_IP || 'auto';
  return config.localIps[(__VU - 1 + config.localIps.length) % config.localIps.length];
}

function jsonValue(response, path) {
  try {
    return response && response.json ? response.json(path) : undefined;
  } catch (e) {
    return undefined;
  }
}

export function isFunctionalSuccessResponse(response, requireData = false) {
  if (!response || (response.status !== 200 && response.status !== 201)) return false;
  const bSuccess = jsonValue(response, 'bSuccess');
  if (bSuccess !== true) return false;
  if (!requireData) return true;
  const data = jsonValue(response, 'oData');
  if (Array.isArray(data)) return data.length > 0;
  if (data && typeof data === 'object') return Object.keys(data).length > 0;
  return data !== undefined && data !== null && data !== '';
}

function responseOutcome(response) {
  const status = response ? response.status : 0;
  if (status === 0) return 'network';
  if (status === 429) return 'rate_limited';
  if (status >= 200 && status < 300) {
    return jsonValue(response, 'bSuccess') === false ? 'business' : 'success';
  }
  if ([400, 409, 422].includes(status)) return 'business';
  return 'error';
}

export function recordResponseMetrics(response, sourceIp, requestTags = {}) {
  const endpoint = requestTags.endpoint || 'unknown';
  const tags = { source_ip: sourceIp, endpoint };
  if (!response) {
    timeoutErrors.add(1, tags);
    errorRate.add(1, tags);
    sessionSuccessRate.add(false, tags);
    httpOutcomeCounter.add(1, { ...tags, outcome: 'network', status_code: '0' });
    return;
  }

  ttfbTrend.add(response.timings?.waiting || 0, tags);
  recordApdex(response.timings?.duration || 0);

  const outcome = responseOutcome(response);

  if (response.status === 0) {
    timeoutErrors.add(1, tags);
    errorRate.add(1, tags);
  } else if (response.status >= 500) {
    unexpectedErrors.add(1, tags);
    errorRate.add(1, tags);
  } else if (response.status === 429) {
    rateLimitedRequests.add(1, tags);
    errorRate.add(1, tags);
  } else if (outcome === 'business') {
    businessLimitHits.add(1, tags);
    errorRate.add(1, tags);
  } else if (response.status >= 400) {
    errorRate.add(1, tags);
  } else {
    errorRate.add(0, tags);
  }

  httpOutcomeCounter.add(1, {
    ...tags,
    outcome,
    status_code: String(response.status || 0),
  });
  sessionSuccessRate.add(outcome === 'success', tags);
}

/**
 * Centralized function to make HTTP requests with automatic 429 rate limit retries
 * @param {string} method HTTP Method (GET, POST, PUT, etc)
 * @param {string} path Relative path (e.g., '/Entidad/Crear')
 * @param {object|string|null} payload Body of the request
 * @param {object} extraOpts Extra options (headers, tags, etc)
 * @returns {object} K6 Response object
 */
export function apiRequest(method, path, payload = null, extraOpts = {}) {
  const url = `${config.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  const sourceIp = getSourceIp();

  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const headers = Object.assign({}, defaultHeaders, extraOpts.headers || {});
  const tags = Object.assign({ source_ip: sourceIp }, extraOpts.tags || {});
  const params = Object.assign({}, extraOpts, {
    headers,
    tags,
    timeout: config.timeoutMs
  });

  let body = payload;
  if (payload && typeof payload === 'object' && headers['Content-Type'] === 'application/json') {
    body = JSON.stringify(payload);
  }

  let response;
  const retries = config.maxRetries || 3;
  let waitSecs = 1.5; // Start with 1.5s delay since QA limits are tight

  for (let attempt = 0; attempt <= retries; attempt++) {
    params.tags.retry = String(attempt);
    response = http.request(method, url, body, params);
    recordResponseMetrics(response, sourceIp, params.tags);

    if (response.status !== 429) {
      break;
    }

    if (attempt < retries) {
      console.warn(`[WARN] 429 Rate Limit en ${path}. Intento ${attempt + 1}/${retries}. Esperando ${waitSecs}s...`);
      sleep(waitSecs);
      waitSecs *= 2.0; // Exponential backoff
    }
  }

  return response;
}
