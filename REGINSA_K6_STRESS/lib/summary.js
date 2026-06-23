// ============================================================
// lib/summary.js
// Reporte local profesional sin dependencias remotas.
// Mantiene el HTML autocontenido para redes corporativas/proxy.
// ============================================================
import { SUNEDU_LOGO_B64 } from './logo.js';

const DEFAULT_ENDPOINTS = [
  { tag: 'infraccion_listar', label: 'INFRACCION / LISTAR', title: 'Infraccion/Listar' },
  {
    tag: 'cabecerainfraccionsancion_crear',
    label: 'CABECERA INFRACCION SANCION / CREAR',
    title: 'CabeceraInfraccionSancion/Crear',
  },
  { tag: 'medidacorrectiva_crear', label: 'MEDIDA CORRECTIVA / CREAR', title: 'MedidaCorrectiva/Crear' },
  {
    tag: 'detalleinfraccionsancion_crear',
    label: 'DETALLE INFRACCION SANCION / CREAR',
    title: 'DetalleInfraccionSancion/Crear',
  },
];

const SLO = {
  p95: 1500,
  p99: 2000,
  errorRate: 0.01,
  apdex: 0.9,
  checks: 0.99,
  session: 0.99,
  tls: 50,
};

function values(metric) {
  return metric ? metric.values || metric : {};
}
function num(v, fallback = 0) {
  return v == null || Number.isNaN(v) ? fallback : v;
}
function fmtMs(v) {
  return v == null || Number.isNaN(v) ? '-' : `${Math.round(v)}ms`;
}
function fmtPct(v) {
  return v == null || Number.isNaN(v) ? '-' : `${(v * 100).toFixed(2)}%`;
}
function fmtFixed(v, digits = 3) {
  return v == null || Number.isNaN(v) ? '-' : Number(v).toFixed(digits);
}
function fmtRate(v) {
  return v == null || Number.isNaN(v) ? '-' : `${Number(v).toFixed(2)}/s`;
}
function fmtMb(v) {
  return v == null || Number.isNaN(v) ? '-' : `${(Number(v) / 1048576).toFixed(2)} MB`;
}
function fmtMbRate(v) {
  return v == null || Number.isNaN(v) ? '-' : `${(Number(v) / 1048576).toFixed(2)} MB/s`;
}
function passIcon(pass) {
  return pass ? 'OK' : 'REVISAR';
}
function passColor(pass) {
  return pass ? '#1b5e20' : '#bf360c';
}
function passMark(pass) {
  return pass ? '&#10004;' : '&#9888;';
}
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function faviconHref() {
  return (
    SUNEDU_LOGO_B64 ||
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2212%22 fill=%22%235b21b6%22/%3E%3Ctext x=%2212%22 y=%2240%22 font-family=%22Arial%22 font-size=%2223%22 font-weight=%22700%22 fill=%22white%22%3Ek6%3C/text%3E%3C/svg%3E'
  );
}

function metric(data, name) {
  return values(data.metrics[name]);
}

function countMetric(data, name) {
  return num(metric(data, name).count, 0);
}

function parseMetricKey(key) {
  const match = String(key).match(/^([^{}]+)(?:\{(.+)\})?$/);
  if (!match) return { base: key, tags: {} };
  const tags = {};
  if (match[2]) {
    match[2].split(',').forEach((pair) => {
      const idx = pair.indexOf(':');
      if (idx > -1) tags[pair.slice(0, idx)] = pair.slice(idx + 1);
    });
  }
  return { base: match[1], tags };
}

function taggedCount(data, base, filters = {}) {
  const filterEntries = Object.entries(filters).map(([k, v]) => [k, String(v)]);
  const matches = Object.entries(data.metrics || {}).filter(([key]) => {
    const parsed = parseMetricKey(key);
    if (parsed.base !== base) return false;
    return filterEntries.every(([k, v]) => parsed.tags[k] === v);
  });
  const exactMatches = matches.filter(([key]) => {
    const parsed = parseMetricKey(key);
    return Object.keys(parsed.tags).length === filterEntries.length;
  });
  const source = exactMatches.length ? exactMatches : matches;
  return source.reduce((sum, [, raw]) => sum + num(values(raw).count, 0), 0);
}

function statusCount(data, status, filters = {}) {
  return taggedCount(data, 'http_outcome_count', { ...filters, status_code: String(status) });
}

function outcomeCount(data, outcome, filters = {}) {
  return taggedCount(data, 'http_outcome_count', { ...filters, outcome });
}

function endpointFallbackCounts(data, ep) {
  const reqs = countMetric(data, `http_req_duration{endpoint:${ep.tag}}`);
  const fail = metric(data, `http_req_failed{endpoint:${ep.tag}}`);
  const failures = Math.round(reqs * num(fail.rate ?? fail.value, 0));
  const success = Math.max(0, reqs - failures);
  const global429 = countMetric(data, 'http_reqs{status:429}');
  const global5xx = [500, 502, 503, 504].reduce((sum, st) => sum + countMetric(data, `http_reqs{status:${st}}`), 0);
  const rateLimited = ep.tag === 'cabecerainfraccionsancion_crear' ? Math.min(failures, global429) : 0;
  const error = ep.tag === 'detalleinfraccionsancion_crear' ? Math.min(failures, global5xx) : Math.max(0, failures - rateLimited);
  const business = Math.max(0, failures - rateLimited - error);
  return { success, business, gateway429: rateLimited, unexpected: error };
}

function endpointOutcomeCounts(data, ep, extraFilters = {}) {
  const filters = { endpoint: ep.tag, ...extraFilters };
  const success = outcomeCount(data, 'success', filters);
  const business = outcomeCount(data, 'business', filters);
  const gateway429 = outcomeCount(data, 'rate_limited', filters);
  const unexpected = outcomeCount(data, 'error', filters);
  const network = outcomeCount(data, 'network', filters);
  const exactTotal = success + business + gateway429 + unexpected + network;
  if (exactTotal > 0) {
    return { success, business, gateway429, unexpected, network };
  }
  if (extraFilters.source_ip) {
    const ipDur = metric(data, `http_req_duration{source_ip:${extraFilters.source_ip}}`);
    const ipReqs = num(ipDur.count, 0);
    const epReqs = countMetric(data, `http_req_duration{endpoint:${ep.tag}}`);
    if (!ipReqs || !epReqs) return { success: 0, business: 0, gateway429: 0, unexpected: 0, network: 0 };
    const totalReqs = countMetric(data, 'http_reqs') || 1;
    const share = ipReqs / totalReqs;
    const fallback = endpointFallbackCounts(data, ep);
    return {
      success: Math.round(fallback.success * share),
      business: Math.round(fallback.business * share),
      gateway429: Math.round(fallback.gateway429 * share),
      unexpected: Math.round(fallback.unexpected * share),
      network: 0,
    };
  }
  return { ...endpointFallbackCounts(data, ep), network: 0 };
}

function creationCount(data, operation) {
  return taggedCount(data, 'reginsa_created_records', { operation });
}

function _rateMetric(data, name) {
  const m = metric(data, name);
  return num(m.rate ?? m.value, 0);
}

function effectiveErrorRate(data, filters = {}) {
  const outcomeFilters = {};
  if (filters.endpoint) outcomeFilters.endpoint = filters.endpoint;
  if (filters.source_ip) outcomeFilters.source_ip = filters.source_ip;

  const success = outcomeCount(data, 'success', outcomeFilters);
  const business = outcomeCount(data, 'business', outcomeFilters);
  const gateway429 = outcomeCount(data, 'rate_limited', outcomeFilters);
  const unexpected = outcomeCount(data, 'error', outcomeFilters);
  const network = outcomeCount(data, 'network', outcomeFilters);
  const total = success + business + gateway429 + unexpected + network;
  if (total > 0) return (business + gateway429 + unexpected + network) / total;

  const tagParts = [];
  if (filters.endpoint) tagParts.push(`endpoint:${filters.endpoint}`);
  if (filters.source_ip) tagParts.push(`source_ip:${filters.source_ip}`);
  const suffix = tagParts.length ? `{${tagParts.join(',')}}` : '';
  return Math.max(_rateMetric(data, `error_rate${suffix}`), _rateMetric(data, `http_req_failed${suffix}`));
}

function limaDate() {
  return new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: false });
}

function limaTimestampForFile() {
  // Peru is UTC-5 and has no daylight saving time. Avoid Intl here so k6
  // can generate stable filenames even in restricted runtimes.
  const lima = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return lima.toISOString().replace(/T/, '_').replace(/[:.]/g, '-').slice(0, 19);
}

function scenarioName(testName) {
  return (__ENV.SCENARIO || String(testName).split('-').slice(1).join('-') || 'smoke').toLowerCase();
}

function endpointSummaries(data, endpointDefs = DEFAULT_ENDPOINTS) {
  return endpointDefs.map((ep) => {
    const dur = metric(data, `http_req_duration{endpoint:${ep.tag}}`);
    if (!dur.count) return null;
    const errorRate = effectiveErrorRate(data, { endpoint: ep.tag });
    return {
      ...ep,
      reqs: dur.count || 0,
      avg: dur.avg,
      p50: dur.med,
      p90: dur['p(90)'],
      p95: dur['p(95)'],
      p99: dur['p(99)'],
      max: dur.max,
      errorRate,
      sloPass: num(dur['p(95)'], 0) < SLO.p95 && errorRate < SLO.errorRate,
    };
  }).filter(Boolean);
}

function collectChecks(group, out) {
  if (!group) return;
  if (Array.isArray(group.checks)) {
    group.checks.forEach((c) => {
      out.push({
        name: c.name || '',
        path: group.path || group.name || '',
        passes: c.passes || 0,
        fails: c.fails || 0,
      });
    });
  } else if (group.checks) {
    Object.keys(group.checks).forEach((key) => {
      const c = group.checks[key];
      out.push({
        name: c.name || key,
        path: group.path || group.name || '',
        passes: c.passes || 0,
        fails: c.fails || 0,
      });
    });
  }
  if (group.groups) {
    Object.keys(group.groups).forEach((k) => collectChecks(group.groups[k], out));
  }
}

function allChecks(data) {
  const checks = [];
  collectChecks(data.root_group, checks);
  return checks;
}

function checkPasses(data, pattern) {
  return allChecks(data)
    .filter((check) => pattern.test(check.name || ''))
    .reduce((sum, check) => sum + num(check.passes, 0), 0);
}

function recordsAudit(data, endpoints = DEFAULT_ENDPOINTS) {
  const expected = countMetric(data, 'iterations');
  const byTag = Object.fromEntries(endpoints.map((ep) => [ep.tag, ep]));
  const isCaso01 = Boolean(byTag.entidad_crear);
  const crearConDetallesOk = checkPasses(data, /^CrearConDetalles tiene RESULTADO$/);
  const isCaso02 = Boolean(byTag.cabecerainfraccionsancion_crearcondetalles) || crearConDetallesOk > 0;
  const isCaso04 = Boolean(byTag.cabecerainfraccionsancion_actualizar);
  const globalCounter = countMetric(data, 'reginsa_created_records');

  let created = globalCounter;
  let source = 'contador global reginsa_created_records';

  if (isCaso02) {
    const byResultCheck = crearConDetallesOk;
    const byOperation = creationCount(data, 'cabecera_con_detalles');
    created = byResultCheck || byOperation || globalCounter;
    source = byResultCheck
      ? 'check funcional CrearConDetalles tiene RESULTADO'
      : (byOperation ? 'contador operation:cabecera_con_detalles' : source);
  } else if (isCaso01) {
    const byOperation = creationCount(data, 'administrado');
    created = byOperation || globalCounter;
    source = byOperation ? 'contador operation:administrado' : source;
  } else if (isCaso04) {
    const byOperation = creationCount(data, 'reconsideracion');
    created = byOperation || globalCounter;
    source = byOperation ? 'contador operation:reconsideracion' : source;
  }

  return {
    expected,
    created,
    missing: Math.max(0, expected - created),
    extra: Math.max(0, created - expected),
    match: expected > 0 && expected === created,
    source,
    globalCounter,
  };
}

function formatBreakdown(breakdown, count) {
  if (count === 0 || !breakdown || Object.keys(breakdown).length === 0) {
    return `${count}`;
  }
  // Traducir claves a etiquetas legibles
  const labelMap = {
    'Sin resp. HTTP': '⚡ Sin resp. HTTP (Red/Timeout)',
  };
  const parts = Object.entries(breakdown).map(([code, val]) => {
    const label = labelMap[code] ? labelMap[code] : `HTTP ${code}`;
    return `${label}: ${val}`;
  });
  return `${count} <span style="font-size: 10px; font-weight: normal; color: #b71c1c; display: block; margin-top: 2px;">(${parts.join(', ')})</span>`;
}

function endpointCheckStats(checks, ep) {
  const relevant = checks.filter((c) => {
    const haystack = `${c.path} ${c.name}`.toLowerCase();
    return haystack.includes(ep.title.toLowerCase()) || haystack.includes(ep.tag.replace('_', '/'));
  });

  const success = relevant
    .filter((c) => c.name.includes('[HTTP 200] Success: true'))
    .reduce((sum, c) => sum + c.passes, 0);
  const business = relevant
    .filter((c) => c.name.includes('Success: false') || c.name.includes('Límite') || c.name.includes('Limite'))
    .reduce((sum, c) => sum + c.passes + c.fails, 0);
  const gateway429 = relevant
    .filter((c) => c.name.includes('[HTTP 429]'))
    .reduce((sum, c) => sum + c.passes + c.fails, 0);

  const unexpectedBreakdown = {};
  let unexpected = 0;

  relevant.forEach((c) => {
    if (
      !c.name.includes('[HTTP 200] Success: true') &&
      !c.name.includes('Success: false') &&
      !c.name.includes('[HTTP 429]')
    ) {
      const match = c.name.match(/\[HTTP (\d{3})\]/);
      if (match) {
        const code = match[1];
        const count = c.fails + c.passes;
        if (count > 0) {
          unexpectedBreakdown[code] = (unexpectedBreakdown[code] || 0) + count;
          unexpected += count;
        }
      } else {
        const count = c.fails;
        if (count > 0) {
          unexpectedBreakdown['Sin resp. HTTP'] = (unexpectedBreakdown['Sin resp. HTTP'] || 0) + count;
          unexpected += count;
        }
      }
    }
  });

  return { success, business, gateway429, unexpected, unexpectedBreakdown };
}

function activeIps(data, localIps) {
  return (localIps || [])
    .map((ip) => {
      const dur = metric(data, `http_req_duration{source_ip:${ip}}`);
      const ttfb = metric(data, `ttfb_ms{source_ip:${ip}}`);
      const blocked = metric(data, `http_req_blocked{source_ip:${ip}}`);
      const tls = metric(data, `http_req_tls_handshaking{source_ip:${ip}}`);
      if (!dur.count) return null;
      const errorRate = effectiveErrorRate(data, { source_ip: ip });
      return {
        ip,
        reqs: dur.count,
        avg: dur.avg,
        p50: dur.med,
        p95: dur['p(95)'],
        p99: dur['p(99)'],
        errorRate,
        ttfb: ttfb.avg,
        blocked: blocked.avg,
        tls: tls.avg,
      };
    })
    .filter(Boolean);
}

// ============================================================
// HÉLPERES Y GENERADORES DE AUDITORÍA MULTI-IP (ISTQB / SRE)
// ============================================================

function estimateIpApdex(durTrend) {
  if (!durTrend || !durTrend.count) return 1.0;

  const points = [
    { val: num(durTrend.min, 0), pct: 0.0 },
    { val: num(durTrend.med ?? durTrend.p50, 0), pct: 0.5 },
    { val: num(durTrend['p(90)'], 0), pct: 0.9 },
    { val: num(durTrend['p(95)'], 0), pct: 0.95 },
    { val: num(durTrend['p(99)'], 0), pct: 0.99 },
    { val: num(durTrend.max, 0), pct: 1.0 },
  ];

  points.sort((a, b) => a.val - b.val);

  const estimateCdf = (x) => {
    if (x <= points[0].val) return 0.0;
    if (x >= points[points.length - 1].val) return 1.0;
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (x >= p1.val && x <= p2.val) {
        if (p2.val === p1.val) return p1.pct;
        return p1.pct + (p2.pct - p1.pct) * ((x - p1.val) / (p2.val - p1.val));
      }
    }
    return 1.0;
  };

  const pctT = estimateCdf(800);
  const pct4T = estimateCdf(3200);
  return pctT + 0.5 * (pct4T - pctT);
}

function _ipChecksRate(checks, ip) {
  const cleanIp = ip.trim();
  const ipChecks = checks.filter((c) => {
    return c.path.includes(`IP de Origen: ${cleanIp}`) ||
           c.path.includes(`[${cleanIp}]`) ||
           c.name.includes(`[${cleanIp}]`) ||
           c.path.includes(cleanIp) ||
           c.name.includes(cleanIp);
  });
  if (!ipChecks.length) return 1.0;
  const passes = ipChecks.reduce((sum, c) => sum + c.passes, 0);
  const fails = ipChecks.reduce((sum, c) => sum + c.fails, 0);
  const total = passes + fails;
  return total ? passes / total : 1.0;
}

function ipEndpointCheckStats(checks, ip, ep) {
  const cleanIp = ip.trim();
  const relevant = checks.filter((c) => {
    const hasIp = c.path.includes(`IP de Origen: ${cleanIp}`) ||
                  c.path.includes(`[${cleanIp}]`) ||
                  c.name.includes(`[${cleanIp}]`) ||
                  c.path.includes(cleanIp) ||
                  c.name.includes(cleanIp);
    if (!hasIp) return false;
    const haystack = `${c.path} ${c.name}`.toLowerCase();
    return haystack.includes(ep.title.toLowerCase()) || haystack.includes(ep.tag.replace('_', '/'));
  });

  const success = relevant
    .filter((c) => c.name.includes('[HTTP 200] Success: true'))
    .reduce((sum, c) => sum + c.passes, 0);
  const business = relevant
    .filter((c) => c.name.includes('Success: false') || c.name.includes('Límite') || c.name.includes('Limite'))
    .reduce((sum, c) => sum + c.passes + c.fails, 0);
  const gateway429 = relevant
    .filter((c) => c.name.includes('[HTTP 429]'))
    .reduce((sum, c) => sum + c.passes + c.fails, 0);

  const unexpectedBreakdown = {};
  let unexpected = 0;

  relevant.forEach((c) => {
    if (
      !c.name.includes('[HTTP 200] Success: true') &&
      !c.name.includes('Success: false') &&
      !c.name.includes('[HTTP 429]')
    ) {
      const match = c.name.match(/\[HTTP (\d{3})\]/);
      if (match) {
        const code = match[1];
        const count = c.fails + c.passes;
        if (count > 0) {
          unexpectedBreakdown[code] = (unexpectedBreakdown[code] || 0) + count;
          unexpected += count;
        }
      } else {
        const count = c.fails;
        if (count > 0) {
          unexpectedBreakdown['Sin resp. HTTP'] = (unexpectedBreakdown['Sin resp. HTTP'] || 0) + count;
          unexpected += count;
        }
      }
    }
  });

  return { success, business, gateway429, unexpected, unexpectedBreakdown };
}

function buildIpBusinessDistribution(data, endpoints, checks, ip) {
  const rows = endpoints
    .map((ep) => {
      const statsFromChecks = ipEndpointCheckStats(checks, ip, ep);
      const statsFromMetrics = endpointOutcomeCounts(data, ep, { source_ip: ip });
      const stats = {
        success: statsFromMetrics.success || statsFromChecks.success,
        business: statsFromMetrics.business || statsFromChecks.business,
        gateway429: statsFromMetrics.gateway429 || statsFromChecks.gateway429,
        unexpected: statsFromMetrics.unexpected + statsFromMetrics.network || statsFromChecks.unexpected,
        unexpectedBreakdown: statsFromChecks.unexpectedBreakdown || {},
      };
      return `<tr>
      <td class="left strong">${escapeHtml(ep.label)}</td>
      <td class="ok-cell" style="background:#e8f5e9;color:#1b5e20">${stats.success}</td>
      <td style="background:#fff3e0;color:#e65100;font-weight:700">${stats.business}</td>
      <td style="background:#e3f2fd;color:#0d47a1;font-weight:700">${stats.gateway429}</td>
      <td style="background:#ffebee;color:#b71c1c;font-weight:700">${formatBreakdown(stats.unexpectedBreakdown, stats.unexpected)}</td>
    </tr>`;
    })
    .join('');

  return `<table class="compact">
    <thead>
      <tr>
        <th class="left" style="background:#1a237e">ENDPOINT</th>
        <th style="background:#e8f5e9;color:#1b5e20;border:1px solid #c8e6c9">✔ 200 OK</th>
        <th style="background:#fff3e0;color:#e65100;border:1px solid #ffe0b2">⚠ 200 LÍMITE</th>
        <th style="background:#e3f2fd;color:#0d47a1;border:1px solid #bbdefb">⚡ 429 RATE LIMIT</th>
        <th style="background:#ffebee;color:#b71c1c;border:1px solid #ffcdd2">❌ ERRORES</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
}

function endpointSreMetric(data, ep, ip) {
  const endpointDur = metric(data, `http_req_duration{endpoint:${ep.tag}}`);
  const endpointFail = metric(data, `http_req_failed{endpoint:${ep.tag}}`);
  const exactDur = ip ? metric(data, `http_req_duration{endpoint:${ep.tag},source_ip:${ip}}`) : endpointDur;
  const exactFail = ip ? metric(data, `http_req_failed{endpoint:${ep.tag},source_ip:${ip}}`) : endpointFail;
  const endpointTtfb = metric(data, `ttfb_ms{endpoint:${ep.tag}}`);
  const endpointBlocked = metric(data, `http_req_blocked{endpoint:${ep.tag}}`);
  const endpointTls = metric(data, `http_req_tls_handshaking{endpoint:${ep.tag}}`);
  const exactTtfb = ip ? metric(data, `ttfb_ms{endpoint:${ep.tag},source_ip:${ip}}`) : endpointTtfb;
  const exactBlocked = ip ? metric(data, `http_req_blocked{endpoint:${ep.tag},source_ip:${ip}}`) : endpointBlocked;
  const exactTls = ip ? metric(data, `http_req_tls_handshaking{endpoint:${ep.tag},source_ip:${ip}}`) : endpointTls;
  const ipDur = ip ? metric(data, `http_req_duration{source_ip:${ip}}`) : null;
  const ipFail = ip ? metric(data, `http_req_failed{source_ip:${ip}}`) : null;
  const ipTtfb = ip ? metric(data, `ttfb_ms{source_ip:${ip}}`) : null;
  const ipBlocked = ip ? metric(data, `http_req_blocked{source_ip:${ip}}`) : null;
  const ipTls = ip ? metric(data, `http_req_tls_handshaking{source_ip:${ip}}`) : null;
  const counts = endpointOutcomeCounts(data, ep, ip ? { source_ip: ip } : {});
  const outcomeTotal = counts.success + counts.business + counts.gateway429 + counts.unexpected + counts.network;
  const sourceDur = exactDur.count ? exactDur : (ip ? ipDur : endpointDur);
  const sourceFail = exactFail.count ? exactFail : (ip ? ipFail : endpointFail);
  const reqs = outcomeTotal || num(sourceDur.count, 0);
  const errorCount = counts.gateway429 + counts.unexpected + counts.network;
  const fallbackErrorRate = reqs ? errorCount / reqs : 0;
  const errorRate = sourceFail && (sourceFail.rate != null || sourceFail.value != null)
    ? num(sourceFail.rate ?? sourceFail.value, fallbackErrorRate)
    : fallbackErrorRate;
  const apdex = estimateIpApdex(sourceDur);

  return {
    ...ep,
    reqs,
    p50: sourceDur.med,
    avg: sourceDur.avg,
    p95: sourceDur['p(95)'],
    p99: sourceDur['p(99)'],
    errorRate,
    ttfb: exactTtfb.count ? exactTtfb.avg : (ip ? ipTtfb.avg : endpointTtfb.avg),
    blocked: exactBlocked.count ? exactBlocked.avg : (ip ? ipBlocked.avg : endpointBlocked.avg),
    tls: exactTls.count ? exactTls.avg : (ip ? ipTls.avg : endpointTls.avg),
    apdex,
    success: counts.success,
    business: counts.business,
    gateway429: counts.gateway429,
    unexpected: counts.unexpected,
    network: counts.network,
    isEstimatedLatency: ip && !exactDur.count,
  };
}

function buildEndpointSreMetricsTable(data, endpoints, opts = {}) {
  const rows = endpoints
    .map((ep) => endpointSreMetric(data, ep, opts.ip))
    .filter((item) => item.reqs || item.success || item.business || item.gateway429 || item.unexpected || item.network)
    .map((item) => {
      const p95Pass = num(item.p95, Infinity) < SLO.p95;
      const p99Pass = num(item.p99, Infinity) < SLO.p99;
      const errorPass = num(item.errorRate, 0) < SLO.errorRate;
      const apdexPass = num(item.apdex, 0) >= SLO.apdex;
      const statePass = p95Pass && p99Pass && errorPass && apdexPass;
      return `<tr>
      <td class="left strong">${escapeHtml(item.label)}${item.isEstimatedLatency ? '<br><span style="font-size:10px;color:#607d8b;font-weight:400">latencia referencial del nodo</span>' : ''}</td>
      <td>${item.reqs}</td>
      <td>${fmtMs(item.p50)}</td>
      <td>${fmtMs(item.avg)}</td>
      <td class="strong" style="${!p95Pass ? 'color:#c62828' : ''}">${fmtMs(item.p95)}</td>
      <td class="strong" style="${!p99Pass ? 'color:#c62828' : ''}">${fmtMs(item.p99)}</td>
      <td class="strong" style="${!errorPass ? 'color:#c62828' : ''}">${fmtPct(item.errorRate)}</td>
      <td>${item.ttfb == null ? '-' : fmtMs(item.ttfb)}</td>
      <td>${item.blocked == null ? '-' : fmtMs(item.blocked)}</td>
      <td>${item.tls == null ? '-' : fmtMs(item.tls)}</td>
      <td class="strong" style="${!apdexPass ? 'color:#c62828' : 'color:#1b5e20'}">${fmtFixed(item.apdex, 3)}</td>
      <td style="color:${passColor(statePass)};font-weight:700">${passMark(statePass)} ${statePass ? 'OK' : 'REV'}</td>
    </tr>`;
    })
    .join('');

  if (!rows) {
    return '<div class="note">No se encontraron métricas por endpoint para este nivel de desglose.</div>';
  }

  return `<table class="master">
    <thead>
      <tr>
        <th class="left">Endpoint</th>
        <th>Total Reqs</th>
        <th>Mediana (p50)</th>
        <th>Promedio (avg)</th>
        <th class="slo-head">p95 * SLO</th>
        <th>p99 (Cola)</th>
        <th>Tasa Errores</th>
        <th>TTFB (Server)</th>
        <th>Bloqueo Red</th>
        <th>Seguridad TLS</th>
        <th>APDEX Score</th>
        <th>Estado SLO</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildGlobalEndpointSreSection(data, endpoints) {
  return `<section class="section">
    <div class="section-title">Muestra Total por Endpoint - Métricas Consolidadas de Calidad SRE</div>
    <div style="overflow-x:auto">${buildEndpointSreMetricsTable(data, endpoints)}</div>
    <div class="note" style="font-size:10px;color:#37474f;background:#eceff1;border-top:1px solid #cfd8dc;">
      <strong>Lectura:</strong> Este bloque consolida toda la muestra sin separar IPs. Úselo para identificar el endpoint dominante en latencia, cola p99 y errores antes de entrar al análisis por nodo.
    </div>
  </section>`;
}

function renderStatusBadge(pass, passText = '✔ PASA', failText = '🔴 FALLA') {
  const cls = pass ? 'pass' : 'fail';
  const txt = pass ? passText : failText;
  return `<span class="pill-badge ${cls}">${txt}</span>`;
}

function buildIpToggleCell(ip, index, detailId) {
  return `<button type="button" class="ip-row-toggle" onclick="toggleIpDetail('${escapeHtml(detailId)}', this)" aria-expanded="false" title="Ver desglose por endpoint">
      <span class="toggle-caret">▸</span><span class="mono">${escapeHtml(ip)}</span>
    </button>`;
}

function buildEndpointDetailRow(colspan, detailId, data, endpoints, checks, ip) {
  return `<tr id="${escapeHtml(detailId)}" class="ip-detail-row" style="display:none;">
      <td colspan="${colspan}" style="padding:0;background:#fbfcff;">
        <div class="ip-detail-panel">
          <div style="font-size:11px;font-weight:700;color:#1a237e;margin:0 0 8px;">Métricas SRE por endpoint dentro del nodo</div>
          <div style="overflow-x:auto;margin-bottom:10px;">${buildEndpointSreMetricsTable(data, endpoints, { ip })}</div>
          <div style="font-size:11px;font-weight:700;color:#1a237e;margin:0 0 8px;">Respuestas HTTP / reglas de negocio por endpoint dentro del nodo</div>
          ${buildIpBusinessDistribution(data, endpoints, checks, ip)}
        </div>
      </td>
    </tr>`;
}

function buildAuditMatrix(ips, durationStr, data, endpoints, checks) {
  // 1. Matriz de Auditoría Estándar (Resumen simplificado)
  const simpleRows = ips
    .map((ip, index) => {
      const isOk = ip.p95 < SLO.p95 && ip.errorRate < SLO.errorRate;
      const statusHtml = isOk
        ? '<span style="color:#2e7d32;font-weight:700">✔ OK</span>'
        : '<span style="color:#e65100;font-weight:700">⚠️ REV</span>';

      const detailId = `audit-ip-detail-${index + 1}`;
      const endpointBreakdown = endpoints.length ? buildEndpointDetailRow(8, detailId, data, endpoints, checks, ip.ip) : '';

      return `<tr>
      <td class="left strong">${buildIpToggleCell(ip.ip, index, detailId)}</td>
      <td>Nodo ${index + 1}</td>
      <td>${ip.reqs}</td>
      <td>${fmtMs(ip.avg)}</td>
      <td class="strong">${fmtMs(ip.p95)}</td>
      <td class="${ip.errorRate >= SLO.errorRate ? 'strong' : ''}" style="${ip.errorRate >= SLO.errorRate ? 'color:#c62828' : ''}">${fmtPct(ip.errorRate)}</td>
      <td>${durationStr}</td>
      <td>${statusHtml}</td>
    </tr>${endpointBreakdown}`;
    })
    .join('');

  // 2. NUEVA SECCIÓN DE VALOR AGREGADO: "Distribución y Balanceo de Carga por Nodo de Origen"
  // Incluye desgloses ejecutivos completos de todas las métricas avanzadas (TTFB, Red, TLS, p99, APDEX) por nodo
  const advancedRows = ips
    .map((ip, index) => {
      const durTrend = metric(data, `http_req_duration{source_ip:${ip.ip}}`);
      const apdex = estimateIpApdex(durTrend);
      
      const p95Pass = num(ip.p95, Infinity) < SLO.p95;
      const p99Pass = num(ip.p99, Infinity) < SLO.p99;
      const errorPass = num(ip.errorRate, 0) < SLO.errorRate;
      const apdexPass = apdex >= SLO.apdex;
      const nodePass = p95Pass && errorPass && apdexPass;
      const detailId = `balance-ip-detail-${index + 1}`;
      const endpointBreakdown = endpoints.length ? buildEndpointDetailRow(12, detailId, data, endpoints, checks, ip.ip) : '';

      return `<tr>
      <td class="left strong">${buildIpToggleCell(ip.ip, index, detailId)}</td>
      <td class="strong">Nodo ${index + 1}</td>
      <td>${ip.reqs}</td>
      <td>${fmtMs(ip.p50)}</td>
      <td class="strong ${!p95Pass ? 'strong' : ''}" style="${!p95Pass ? 'color:#c62828' : ''}">${fmtMs(ip.p95)}</td>
      <td class="${!p99Pass ? 'strong' : ''}" style="${!p99Pass ? 'color:#c62828' : ''}">${fmtMs(ip.p99)}</td>
      <td class="${ip.errorRate >= SLO.errorRate ? 'strong' : ''}" style="${ip.errorRate >= SLO.errorRate ? 'color:#c62828' : ''}">${fmtPct(ip.errorRate)}</td>
      <td>${fmtMs(ip.ttfb)}</td>
      <td>${fmtMs(ip.blocked)}</td>
      <td>${fmtMs(ip.tls)}</td>
      <td class="strong" style="color:${apdex >= SLO.apdex ? '#2e7d32' : '#c62828'}">${fmtFixed(apdex, 3)}</td>
      <td style="color:${passColor(nodePass)};font-weight:700">${passMark(nodePass)} ${nodePass ? 'OK' : 'REV'}</td>
    </tr>${endpointBreakdown}`;
    })
    .join('');

  return `<details class="section" open>
    <summary>🖥️ Matriz de Auditoría — Resumen de Desglose de métricas por IP (${ips.length} IPs del pool)
      <span style="float: right; font-size: 10px; opacity: 0.88; font-weight: normal; margin-top: 2px;">
        ⏱️ Duración total del escenario: ${durationStr}
      </span>
    </summary>
    <div style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th class="left">IP de Origen</th>
            <th>Nodo</th>
            <th>Reqs</th>
            <th>avg</th>
            <th>p95 * SLO</th>
            <th>Errores</th>
            <th>Duración Total (*)</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${simpleRows}
        </tbody>
      </table>
      <div class="note" style="font-size: 10px; color: #555; background: #f5f5f5; border-top: 1px solid #e0e0e0;">
        (*) Todas las IPs del pool ejecutaron en paralelo durante el mismo período de ${durationStr}. La columna refleja la duración total del escenario completo, no un tiempo individual por IP.
      </div>
    </div>
  </details>

  <details class="section" open>
    <summary>⚖️ Distribución y Balanceo de Carga por Nodo de Origen (Métricas Consolidadas de Calidad SRE)</summary>
    <div style="overflow-x:auto">
      <table class="master">
        <thead>
          <tr>
            <th class="left">IP de Origen</th>
            <th>Nodo</th>
            <th>Total Reqs</th>
            <th>Mediana (p50)</th>
            <th class="slo-head">p95 * SLO</th>
            <th>p99 (Cola)</th>
            <th>Tasa Errores</th>
            <th>TTFB (Server)</th>
            <th>Bloqueo Red</th>
            <th>Seguridad TLS</th>
            <th>APDEX Score</th>
            <th>Estado SLO</th>
          </tr>
        </thead>
        <tbody>
          ${advancedRows}
        </tbody>
      </table>
      <div class="note" style="font-size: 10px; color: #37474f; background: #eceff1; border-top: 1px solid #cfd8dc;">
        <strong>Análisis de Balanceo de Carga (SRE):</strong> Compare la columna de <em>Total Reqs</em> y <em>Tasa Errores</em> entre nodos. Si una sola IP acumula la mayoría de las peticiones o experimenta latencias (p95/p99) desproporcionadas, verifique las políticas de balanceo (Round Robin, Least Connections) o bloqueos selectivos por IP en el WAF/API Gateway del cliente.
      </div>
    </div>
  </details>`;
}

function buildLatencyGraphInsights(ips) {
  if (!ips || ips.length === 0) return '';

  const validP95 = ips.filter((ip) => Number.isFinite(num(ip.p95, NaN)));
  const validP99 = ips.filter((ip) => Number.isFinite(num(ip.p99, NaN)));
  const worstP95 = validP95.reduce((worst, ip) => (!worst || num(ip.p95) > num(worst.p95) ? ip : worst), null);
  const bestP95 = validP95.reduce((best, ip) => (!best || num(ip.p95) < num(best.p95) ? ip : best), null);
  const worstP99 = validP99.reduce((worst, ip) => (!worst || num(ip.p99) > num(worst.p99) ? ip : worst), null);
  const p95Breaches = ips.filter((ip) => num(ip.p95, 0) >= SLO.p95);
  const p99Breaches = ips.filter((ip) => num(ip.p99, 0) >= SLO.p99);
  const spreadP95 = worstP95 && bestP95 ? num(worstP95.p95) - num(bestP95.p95) : 0;
  const worstP95Index = worstP95 ? ips.findIndex((ip) => ip.ip === worstP95.ip) + 1 : 0;
  const worstP99Index = worstP99 ? ips.findIndex((ip) => ip.ip === worstP99.ip) + 1 : 0;
  const spreadPct = bestP95 && num(bestP95.p95) > 0 ? spreadP95 / num(bestP95.p95) : 0;
  const p99TailRatio = worstP95 && worstP99 && num(worstP95.p95) > 0 ? num(worstP99.p99) / num(worstP95.p95) : 0;
  const statusColor = p95Breaches.length || p99Breaches.length ? '#bf360c' : '#1b5e20';
  const statusBg = p95Breaches.length || p99Breaches.length ? '#fff7ed' : '#e8f5e9';

  const card = (label, value, hint, color = '#1a237e') => `
    <div style="background:#fff; border:1px solid #dfe3f5; border-left:4px solid ${color}; border-radius:6px; padding:9px 10px; min-width:145px; flex:1;">
      <div style="font-size:10px; color:#607d8b; font-weight:700; text-transform:uppercase;">${escapeHtml(label)}</div>
      <div style="font-size:16px; color:${color}; font-weight:800; margin-top:3px;">${value}</div>
      <div style="font-size:10px; color:#546e7a; margin-top:2px; line-height:1.35;">${escapeHtml(hint)}</div>
    </div>`;

  return `
    <div style="margin-top:12px; background:#f8f9ff; border:1px solid #dfe3f5; border-radius:6px; padding:10px;">
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${card(
          'Nodo p95 más crítico',
          worstP95 ? `Nodo ${worstP95Index} · ${fmtMs(worstP95.p95)}` : '-',
          worstP95 ? worstP95.ip : 'Sin datos por IP',
          num(worstP95 ? worstP95.p95 : 0, 0) >= SLO.p95 ? '#c62828' : '#1b5e20',
        )}
        ${card(
          'Cola p99 máxima',
          worstP99 ? `Nodo ${worstP99Index} · ${fmtMs(worstP99.p99)}` : '-',
          worstP99 ? `${worstP99.ip} · x${fmtFixed(p99TailRatio, 2)} vs p95 crítico` : 'Sin datos de cola',
          num(worstP99 ? worstP99.p99 : 0, 0) >= SLO.p99 ? '#b71c1c' : '#1b5e20',
        )}
        ${card(
          'Nodos fuera de SLO',
          `${p95Breaches.length}/${ips.length}`,
          `p99 fuera de cola: ${p99Breaches.length}/${ips.length}`,
          p95Breaches.length || p99Breaches.length ? '#ef6c00' : '#1b5e20',
        )}
        ${card(
          'Variación p95 entre nodos',
          fmtMs(spreadP95),
          `Brecha aprox. ${fmtPct(spreadPct)} entre mejor y peor nodo`,
          spreadPct > 0.25 ? '#6a1b9a' : '#1a237e',
        )}
      </div>
      <div style="margin-top:8px; padding:8px 10px; border-radius:5px; background:${statusBg}; color:${statusColor}; font-size:11px; line-height:1.45;">
        <strong>Lectura SRE:</strong> Use p95 para evaluar experiencia sostenida y p99 para identificar cola extrema. Si varios nodos superan el umbral, el problema es sistémico; si uno o dos concentran la cola, revise afinidad por IP, rate limiting, pool de conexiones y bloqueos de base de datos para esos nodos.
      </div>
    </div>`;
}

function buildAuditRecommendations(p95, errorRate, checksRate, apdex, SLO, testName, data) {
  const p95Pass = num(p95, Infinity) < SLO.p95;
  const errorPass = num(errorRate, 0) < SLO.errorRate;
  const checksPass = num(checksRate, 0) >= SLO.checks;
  const apdexPass = num(apdex, 0) >= SLO.apdex;
  
  const dur = metric(data, 'http_req_duration');
  const p99 = dur ? num(dur['p(99)'], 0) : 0;
  const p99Pass = p99 < SLO.p99;
  
  const allPass = p95Pass && errorPass && checksPass && apdexPass && p99Pass;

  const badgeClass = allPass ? 'pass' : 'fail';
  const badgeText = allPass ? '🟢 ÓPTIMO / PASA CRITERIOS' : '🔴 DEGRADADO/REQUIERE ATENCIÓN';

  const scenario = scenarioName(testName);
  const statusCounts = {
    429: countMetric(data, 'http_reqs{status:429}') || statusCount(data, 429),
    500: countMetric(data, 'http_reqs{status:500}') || statusCount(data, 500),
    502: countMetric(data, 'http_reqs{status:502}') || statusCount(data, 502),
    503: countMetric(data, 'http_reqs{status:503}') || statusCount(data, 503),
    504: countMetric(data, 'http_reqs{status:504}') || statusCount(data, 504),
    net: outcomeCount(data, 'network'),
  };

  function errorDiagnosisText() {
    const parts = [];
    if (statusCounts[429] > 0) {
      parts.push(`HTTP 429 (${statusCounts[429]}): rate limit aplicado por API Gateway/WAF, especialmente relevante en CabeceraInfraccionSancion/Crear.`);
    }
    if (statusCounts[500] > 0) {
      parts.push(`HTTP 500 (${statusCounts[500]}): error interno del backend; priorice correlación con logs de REGINSA, trazas de DetalleInfraccionSancion/Crear, SPs, bloqueos, deadlocks y rollback de transacciones concurrentes.`);
    }
    const gatewayErrors = [502, 503, 504].filter((code) => statusCounts[code] > 0);
    if (gatewayErrors.length > 0) {
      parts.push(`${gatewayErrors.map((code) => `HTTP ${code} (${statusCounts[code]})`).join(', ')}: falla de gateway, disponibilidad del upstream o timeout del backend.`);
    }
    if (statusCounts.net > 0) {
      parts.push(`Red/Timeout (${statusCounts.net}): k6 no recibió respuesta HTTP; revisar timeouts, sockets y límites del balanceador.`);
    }
    return parts.length ? parts.join(' ') : 'Revise el desglose HTTP de la muestra total para identificar el código dominante.';
  }

  const recommendations = [];
  if (!p95Pass) {
    recommendations.push(
      `<li><strong>Latencia Percentil 95 degradada (${fmtMs(p95)} vs &lt; ${SLO.p95}ms):</strong> El 5% de las transacciones experimentó lentitud crítica. Esto denota un encolamiento en el procesamiento de base de datos o contención de hilos en el IIS/Tomcat. Ejecutar diagnóstico de base de datos (SP_WhoIsActive, bloqueos).</li>`,
    );
  }
  if (!p99Pass) {
    recommendations.push(
      `<li><strong>Percentil 99 de Cola elevado (${fmtMs(p99)} vs &lt; ${SLO.p99}ms):</strong> El 1% de los usuarios experimentó latencias extremas. Esto usualmente es síntoma de picos de recolección de basura (Garbage Collection), agotamiento puntual del pool de conexiones o reintentos de red.</li>`,
    );
  }
  if (!errorPass) {
    recommendations.push(
      `<li><strong>Tasa de errores por encima de SLO (${fmtPct(errorRate)} vs &lt; ${fmtPct(SLO.errorRate)}):</strong> Se superó el umbral de tolerancia del 1%. ${escapeHtml(errorDiagnosisText())}</li>`,
    );
  }
  if (!checksPass) {
    recommendations.push(
      `<li><strong>Tasa de validación de Checks deficiente (${fmtPct(checksRate)} vs &gt; ${fmtPct(SLO.checks)}):</strong> Parte de las respuestas no cumple la validación funcional esperada: códigos HTTP no exitosos, cuerpos de error, datos vacíos o reglas de negocio rechazadas. Revise el desglose por endpoint antes de atribuirlo solo a latencia.</li>`,
    );
  }
  if (!apdexPass) {
    recommendations.push(
      `<li><strong>Índice de satisfacción APDEX crítico (${fmtFixed(apdex, 3)} vs &gt; ${fmtFixed(SLO.apdex, 2)}):</strong> La experiencia del usuario final está catalogada en zona Frustrada/Tolerante. Se requiere optimizar el código del API.</li>`,
    );
  }

  // Recomendación específica del escenario
  if (scenario === 'attack') {
    recommendations.push(
      `<li><strong>[Diagnóstico de Ataque de Saturación]:</strong> Durante aumentos súbitos a tiempo 0, la capacidad de autoescalamiento horizontal (HPA) no llega a activarse a tiempo. Se recomienda pre-escalar instancias antes de campañas masivas de la SUNEDU o aumentar el mínimo de pods activos.</li>`,
    );
  } else if (scenario === 'one_shot') {
    recommendations.push(
      `<li><strong>[Diagnóstico de Ráfaga de Impacto (One-Shot)]:</strong> La prueba de un solo disparo masivo en milisegundo cero sirve para auditar la resistencia de la primera línea de defensa (API Gateway, Cloudflare, F5). Si la tasa de errores es alta, configure reglas de Rate Limiting eficientes.</li>`,
    );
  } else if (scenario === 'collapse') {
    recommendations.push(
      `<li><strong>[Diagnóstico de Punto de Ruptura (Collapse)]:</strong> La prueba destructiva progresiva evidenció degradación. Documente el nivel exacto de RPS y VUs al que el servicio empezó a fallar para definir la capacidad máxima segura del sistema.</li>`,
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      `<li><strong>¡Todo en orden!</strong> El sistema cumple perfectamente con todos los criterios de aceptación y acuerdos de nivel de servicio (SLO) definidos por SUNEDU.</li>`,
    );
  }

  return `<details class="section" open>
    <summary>📋 Criterios de Aceptación QA e Ingeniería SRE (Site Reliability Engineering)
      <span class="badge-summary ${badgeClass}">${badgeText}</span>
    </summary>
    <div class="section-body">
      <table>
        <thead>
          <tr>
            <th class="left">CRITERIO DE ACEPTACIÓN</th>
            <th>UMBRAL DE SLO / ESTÁNDAR</th>
            <th>RESULTADO MEDIDO</th>
            <th>ESTADO</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="left strong">Latencia Percentil 95 (p95)</td>
            <td>&lt; ${SLO.p95} ms</td>
            <td class="strong">${fmtMs(p95)}</td>
            <td>${renderStatusBadge(p95Pass)}</td>
          </tr>
          <tr>
            <td class="left strong">Latencia Percentil 99 (Cola)</td>
            <td>&lt; ${SLO.p99} ms</td>
            <td class="strong">${fmtMs(p99)}</td>
            <td>${renderStatusBadge(p99Pass)}</td>
          </tr>
          <tr>
            <td class="left strong">Tasa de Error Global</td>
            <td>&lt; ${fmtPct(SLO.errorRate)}</td>
            <td class="strong" style="${!errorPass ? 'color:#c62828' : ''}">${fmtPct(errorRate)}</td>
            <td>${renderStatusBadge(errorPass)}</td>
          </tr>
          <tr>
            <td class="left strong">Checks de Validación Funcional</td>
            <td>&gt; ${fmtPct(SLO.checks)}</td>
            <td class="strong">${fmtPct(checksRate)}</td>
            <td>${renderStatusBadge(checksPass)}</td>
          </tr>
          <tr>
            <td class="left strong">Índice de Satisfacción APDEX</td>
            <td>&gt; ${fmtFixed(SLO.apdex, 2)}</td>
            <td class="strong" style="color:${apdexPass ? '#2e7d32' : '#c62828'}">${fmtFixed(apdex, 3)}</td>
            <td>${renderStatusBadge(apdexPass)}</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top: 14px;">
        <h4 style="margin: 0 0 8px; color: #1a237e; font-size: 12px; display: flex; align-items: center; gap: 6px;">
          💡 Diagnóstico y Recomendaciones de Site Reliability Engineering (SRE):
        </h4>
        <ul style="margin: 0; padding-left: 20px; line-height: 1.6; color: #37474f;">
          ${recommendations.join('')}
        </ul>
      </div>
    </div>
  </details>`;
}

const ERROR_CODES_LOOKUP = {
  400: { name: 'Bad Request (Solicitud Incorrecta)', desc: 'La solicitud enviada tiene una estructura inválida, parámetros incorrectos o cabeceras corruptas.', diag: 'Verifique los payloads enviados por k6, el mapeo de datos o si las llamadas SOAP/REST contienen caracteres especiales no permitidos en el esquema XML/JSON del backend.' },
  401: { name: 'Unauthorized (No Autorizado)', desc: 'Falta token de autenticación válido o credenciales requeridas para el recurso.', diag: 'Asegúrese de que el flujo de autenticación de k6 esté obteniendo y enviando correctamente las cabeceras JWT, Bearer o credenciales WS-Security de SUNEDU.' },
  403: { name: 'Forbidden (Acceso Prohibido)', desc: 'El cliente está autenticado pero no tiene permisos suficientes para el recurso solicitado.', diag: 'El WAF (Cloudflare/Fortinet) o el API Gateway denegó el acceso debido a reglas de seguridad o bloqueo de rango IP. Revise los logs de seguridad.' },
  404: { name: 'Not Found (No Encontrado)', desc: 'El recurso solicitado o endpoint no existe en el servidor backend.', diag: 'Valide que la URL base o las rutas del endpoint de Grados/Carnet estén correctamente configuradas y desplegadas en el entorno correspondiente.' },
  429: { name: 'Too Many Requests (Límite Excedido)', desc: 'Se ha superado la tasa máxima de peticiones permitidas (Rate Limiting).', diag: 'El WAF o API Gateway del cliente bloqueó las peticiones al superar el umbral configurado por IP. Es el comportamiento esperado en pruebas de "Attack" o "Collapse" para proteger el backend. Se recomienda aumentar el umbral de rate-limiting en pre-producción.' },
  500: { name: 'Internal Server Error (Error Interno)', desc: 'El servidor backend experimentó una condición inesperada que le impidió completar la solicitud.', diag: 'En REGINSA este patrón suele asociarse a interbloqueos/locks de base de datos en operaciones de creación concurrente. Revise trazas del SP, transacciones y aislamiento en DetalleInfraccionSancion/Crear.' },
  502: { name: 'Bad Gateway (Puerta de Enlace Incorrecta)', desc: 'El servidor proxy o gateway recibió una respuesta inválida del servidor aguas arriba (upstream).', diag: 'El servidor de aplicaciones (IIS, Apache, Tomcat) detrás de Nginx/WAF se cayó o el proceso del microservicio se detuvo debido a la saturación de CPU/Memoria bajo estrés.' },
  503: { name: 'Service Unavailable (Servicio No Disponible)', desc: 'El servidor no puede atender la solicitud temporalmente, usualmente por sobrecarga o mantenimiento.', diag: 'El microservicio ha alcanzado su límite de hilos de ejecución o conexiones a la base de datos (Connection Pool exhausto). Se recomienda escalamiento horizontal.' },
  504: { name: 'Gateway Timeout (Tiempo de Espera Agotado)', desc: 'El servidor intermedio no recibió una respuesta a tiempo del backend.', diag: 'El microservicio tardó más tiempo del permitido por el proxy (ej. > 30s o 60s) en responder, típicamente debido a bloqueos en consultas SQL pesadas, locks de transacciones en BD o saturación extrema del microservicio.' }
};

function buildErrorAnalysis(data, checksArr) {
  const foundErrors = [];
  let totalErrorsCount = 0;
  
  const httpReqs = metric(data, 'http_reqs');
  const totalRequests = num(httpReqs ? httpReqs.count : 0, 0);

  const globalErrorsMap = {};
  [400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504].forEach((code) => {
    const count = countMetric(data, `http_reqs{status:${code}}`) || statusCount(data, code);
    if (count > 0) globalErrorsMap[code] = count;
  });
  let globalNetworkErrors = outcomeCount(data, 'network');

  if (Object.keys(globalErrorsMap).length === 0 && globalNetworkErrors === 0) {
    checksArr.forEach((c) => {
      const match = c.name.match(/\[HTTP (\d+)\]/);
      if (match) {
        const code = parseInt(match[1], 10);
        if (code === 0) {
          globalNetworkErrors += c.fails;
        } else if (code < 200 || code >= 300) {
          globalErrorsMap[code] = (globalErrorsMap[code] || 0) + c.fails;
        }
      } else if (c.fails > 0) {
        globalNetworkErrors += c.fails;
      }
    });
  }

  Object.entries(globalErrorsMap).forEach(([codeStr, count]) => {
    const code = parseInt(codeStr, 10);
    if (count > 0) {
      totalErrorsCount += count;
      const pct = totalRequests > 0 ? (count / totalRequests) * 100 : 0;
      const lookup = ERROR_CODES_LOOKUP[code] || {
        name: `HTTP ${code}`,
        desc: 'Código de error HTTP detectado en el backend.',
        diag: 'Revise la respuesta detallada del servidor en los logs de la prueba.'
      };
      foundErrors.push({
        code,
        count,
        pct,
        name: lookup.name,
        desc: lookup.desc,
        diag: lookup.diag,
        isNetwork: false
      });
    }
  });

  if (globalNetworkErrors > 0) {
    totalErrorsCount += globalNetworkErrors;
    const pct = totalRequests > 0 ? (globalNetworkErrors / totalRequests) * 100 : 0;
    foundErrors.push({
      code: 'NET',
      count: globalNetworkErrors,
      pct,
      name: '⚡ Sin respuesta HTTP — Error de Red / Timeout',
      desc: 'K6 no recibió ningún byte de respuesta HTTP del servidor. Puede indicar: conexión rechazada (ECONNREFUSED), tiempo de espera agotado (ETIMEDOUT), socket cortado (ECONNRESET) o saturación total del pool de conexiones del gateway.',
      diag: 'Revisar capacidad del API Gateway y límites de conexiones TCP simultáneas. Aplicar rampa de carga (ramp-up) en lugar de one-shot. Verificar si el proxy inverso o load balancer tiene un queue limit configurado.',
      isNetwork: true
    });
  }

  // Ordenar errores estándar y al final el de red (NET)
  foundErrors.sort((a, b) => {
    if (a.isNetwork && !b.isNetwork) return 1;
    if (!a.isNetwork && b.isNetwork) return -1;
    return a.code - b.code;
  });

  if (foundErrors.length === 0) {
    return `<section class="section" id="section-error-analysis">
      <div class="section-title" style="background: #1b5e20;">🛡️ Análisis y Diagnóstico de Errores HTTP</div>
      <div class="section-body" style="padding: 16px; background: #e8f5e9; border: 1px solid #c8e6c9; border-radius: 4px; display: flex; align-items: center; gap: 12px;">
        <div style="font-size: 24px; color: #2e7d32;">🏆</div>
        <div>
          <strong style="color: #1b5e20; font-size: 13px;">¡Ejecución 100% Exitosa! No se registraron errores HTTP.</strong>
          <p style="margin: 4px 0 0; color: #2e7d32; font-size: 11px;">Durante toda la prueba, el canal de comunicación con los microservicios de SUNEDU se mantuvo estable y sin pérdidas de peticiones (Tasa de error global: 0.00%).</p>
        </div>
      </div>
    </section>`;
  }

  const rows = foundErrors.map(err => `
    <tr>
      <td style="font-family: monospace; font-weight: bold; color: #c62828; font-size: 13px; text-align: center; background: #ffebee; border: 1px solid #ffcdd2;">${err.code}</td>
      <td class="left" style="border: 1px solid #ffcdd2;">
        <strong>${escapeHtml(err.name)}</strong><br>
        <span style="font-size: 10.5px; color: #555;">${escapeHtml(err.desc)}</span>
      </td>
      <td style="font-weight: bold; text-align: center; border: 1px solid #ffcdd2;">${err.count}</td>
      <td style="font-weight: bold; color: #b71c1c; text-align: center; border: 1px solid #ffcdd2;">${err.pct.toFixed(2)}%</td>
      <td class="left" style="font-size: 11px; background: #fafafa; line-height: 1.4; color: #333; border: 1px solid #ffcdd2; padding: 6px;">
        ${escapeHtml(err.diag)}
      </td>
    </tr>
  `).join('');

  const errorSummaryStr = foundErrors.map(e => `${e.isNetwork ? 'Red/Timeout' : `HTTP ${e.code}`} (${e.count} ocur.)`).join(', ');
  const accepted = [200, 201, 202, 204].reduce((sum, code) => sum + (countMetric(data, `http_reqs{status:${code}}`) || statusCount(data, code)), 0);
  const rateLimited = globalErrorsMap[429] || 0;
  const network = globalNetworkErrors || 0;

  return `<section class="section" id="section-error-analysis">
    <div class="section-title" style="background: #b71c1c;">⚠️ Análisis y Diagnóstico Detallado de Errores HTTP (${totalErrorsCount} fallos)</div>
    <div class="section-body" style="padding: 16px;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:16px;">
        <div style="background:#e8f5e9;border:1px solid #c8e6c9;border-radius:6px;padding:10px;text-align:center;"><strong style="color:#1b5e20">Aceptadas HTTP 2xx</strong><div style="font-size:22px;font-weight:800">${accepted}</div></div>
        <div style="background:#e3f2fd;border:1px solid #bbdefb;border-radius:6px;padding:10px;text-align:center;"><strong style="color:#0d47a1">Rate Limit 429</strong><div style="font-size:22px;font-weight:800">${rateLimited}</div></div>
        <div style="background:#f3e5f5;border:1px solid #d1c4e9;border-radius:6px;padding:10px;text-align:center;"><strong style="color:#6a1b9a">Red/Timeout</strong><div style="font-size:22px;font-weight:800">${network}</div></div>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 20px; align-items: center; justify-content: center;">
        <div style="flex: 1; min-width: 300px; max-width: 450px; background: #fff; padding: 12px; border-radius: 6px; border: 1px solid #ffcdd2; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <h4 style="text-align: center; color: #b71c1c; margin: 0 0 10px; font-size:12px;">Proporción y Distribución de Errores</h4>
          <div style="width: 100%; max-height: 240px; position: relative;">
            <canvas id="chart-errores" style="max-height: 220px;"></canvas>
          </div>
        </div>
        <div style="flex: 2; min-width: 450px;">
          <p style="margin: 0 0 12px; font-size: 11.5px; color: #444; line-height: 1.5;">
            <strong>Trazabilidad de Fallos:</strong> El siguiente desglose categoriza los códigos de error HTTP registrados durante la simulación de carga. Cada código tiene un significado operacional y sugiere un cuello de botella o bloqueo específico en el ecosistema del servicio.
          </p>
          <div style="background: #fff8f8; border: 1px solid #ffcdd2; padding: 10px 14px; border-radius: 4px; font-size: 11px; color: #b71c1c; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            <span>🚨</span>
            <span><strong>Alerta SRE:</strong> Se han detectado respuestas de error específicas: <strong>${escapeHtml(errorSummaryStr)}</strong>. Evalúe las sugerencias de la columna <em>Diagnóstico y Acción Recomendada</em> para mitigar el impacto.</span>
          </div>
        </div>
      </div>

      <div style="overflow-x:auto">
        <table class="compact" style="width:100%; border-collapse: collapse; border: 1px solid #ffcdd2;">
          <thead>
            <tr style="background: #ffebee; color: #b71c1c;">
              <th style="width: 70px; text-align: center; border: 1px solid #ffcdd2; padding: 8px;">Código</th>
              <th style="text-align: left; border: 1px solid #ffcdd2; padding: 8px;">Significado y Definición</th>
              <th style="width: 100px; text-align: center; border: 1px solid #ffcdd2; padding: 8px;">Ocurrencias</th>
              <th style="width: 90px; text-align: center; border: 1px solid #ffcdd2; padding: 8px;">% del Total</th>
              <th style="text-align: left; border: 1px solid #ffcdd2; padding: 8px;">Diagnóstico y Acción Recomendada</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  </section>`;
}

function buildIpErrorBreakdownTable(data, checks, ip, endpoints) {
  const cleanIp = ip.trim();
  const errorsMap = {};
  let totalErrors = 0;

  endpoints.forEach((ep) => {
    const stats = endpointOutcomeCounts(data, ep, { source_ip: cleanIp });
    if (stats.gateway429 > 0) errorsMap[429] = (errorsMap[429] || 0) + stats.gateway429;
    if (stats.unexpected > 0) errorsMap.ERROR = (errorsMap.ERROR || 0) + stats.unexpected;
    if (stats.network > 0) errorsMap.NET = (errorsMap.NET || 0) + stats.network;
    totalErrors += stats.gateway429 + stats.unexpected + stats.network;
  });

  if (totalErrors > 0) {
    // Metrics-based evidence is preferred. Checks are only a fallback for old JSONs.
  } else {
    let networkErrors = 0;
  
    checks.forEach((c) => {
      const belongs = c.path.includes(cleanIp) || c.name.includes(`[${cleanIp}]`) || c.name.includes(cleanIp);
      if (!belongs) return;
      
      const match = c.name.match(/\[HTTP (\d{3})\]/);
      if (match) {
        const code = parseInt(match[1], 10);
        if (code !== 200) {
          const count = c.fails + c.passes;
          errorsMap[code] = (errorsMap[code] || 0) + count;
          totalErrors += count;
        }
      } else {
        const count = c.fails;
        if (count > 0) {
          networkErrors += count;
          totalErrors += count;
        }
      }
    });
    if (networkErrors > 0) {
      errorsMap.NET = networkErrors;
    }
  }
  
  if (totalErrors === 0) {
    return `<div style="margin-top: 10px; background: #e8f5e9; border: 1px solid #c8e6c9; padding: 8px 12px; border-radius: 4px; color: #2e7d32; font-size: 11px; font-weight: 500;">
      ✔ Excelente: No se registraron errores ni reintentos en este nodo.
    </div>`;
  }
  
  const rows = Object.entries(errorsMap).map(([code, count]) => {
    const isNet = code === 'NET';
    const isGeneric = code === 'ERROR';
    const lookup = isNet
      ? { name: '⚡ Sin resp. HTTP — Error de Red/Timeout', desc: 'K6 no recibió ningún byte de respuesta. Causas: ECONNREFUSED, ETIMEDOUT, ECONNRESET o socket cerrado por el gateway.' }
      : isGeneric
        ? { name: 'HTTP 5xx/4xx no clasificado', desc: 'El endpoint devolvió fallos no exitosos. Revise el desglose global por código HTTP.' }
        : (ERROR_CODES_LOOKUP[parseInt(code,10)] || { name: `HTTP ${code}`, desc: 'Código de error detectado.' });
    const codeDisplay = isNet || isGeneric ? code : code;
    return `<tr>
      <td style="font-family: monospace; font-weight: bold; color: ${isNet ? '#6a1b9a' : '#c62828'}; background: ${isNet ? '#f3e5f5' : '#ffebee'}; text-align: center; font-size: 11px; border: 1px solid #ffcdd2;">${codeDisplay}</td>
      <td class="left" style="border: 1px solid #ffcdd2;"><strong>${lookup.name}</strong><br><span style="font-size:10px;color:#666;">${lookup.desc}</span></td>
      <td style="font-weight: bold; text-align: center; color: #b71c1c; border: 1px solid #ffcdd2;">${count}</td>
    </tr>`;
  }).join('');
  
  return `<div style="margin-top: 12px;">
    <div style="font-size: 11px; font-weight: bold; color: #b71c1c; margin-bottom: 6px;">🚨 Detalle de Errores en este Nodo:</div>
    <table class="compact" style="width: 100%; border-collapse: collapse; border: 1px solid #ffcdd2;">
      <thead>
        <tr style="background: #ffebee; color: #b71c1c;">
          <th style="width: 70px; text-align: center; border: 1px solid #ffcdd2;">Código</th>
          <th class="left" style="border: 1px solid #ffcdd2;">Categoría de Falla</th>
          <th style="width: 100px; text-align: center; border: 1px solid #ffcdd2;">Ocurrencias</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>`;
}

function getIpResponseCounts(data, checks, ip, endpoints) {
  let success = 0;
  let business = 0;
  let gateway429 = 0;
  let unexpected = 0;
  endpoints.forEach((ep) => {
    const fromMetrics = endpointOutcomeCounts(data, ep, { source_ip: ip });
    const fromChecks = ipEndpointCheckStats(checks, ip, ep);
    success += fromMetrics.success || fromChecks.success;
    business += fromMetrics.business || fromChecks.business;
    gateway429 += fromMetrics.gateway429 || fromChecks.gateway429;
    unexpected += fromMetrics.unexpected + fromMetrics.network || fromChecks.unexpected;
  });
  return { success, business, gateway429, unexpected };
}

function buildGlobalStatusBlock(data, checks) {
  const codes = [200, 201, 301, 302, 304, 400, 401, 403, 404, 429, 500, 502, 503, 504];
  const httpReqs = metric(data, 'http_reqs');
  const totalReqs = num(httpReqs ? httpReqs.count : 0, 0);

  const globalCounts = {};
  codes.forEach((code) => {
    globalCounts[code] = countMetric(data, `http_reqs{status:${code}}`) || statusCount(data, code);
  });
  let globalNetworkErrors = outcomeCount(data, 'network');
  
  const cards = codes.map((code) => {
    const count = globalCounts[code] || 0;
    if (count === 0) return '';
    
    const pct = totalReqs > 0 ? (count / totalReqs) * 100 : 0;
    
    let cardBg = '#f5f5f5';
    let cardBorder = '#e0e0e0';
    let textColor = '#333';
    let icon = 'ℹ️';
    
    if (code === 200 || code === 201) {
      cardBg = '#e8f5e9';
      cardBorder = '#a5d6a7';
      textColor = '#2e7d32';
      icon = '🟢';
    } else if (code === 429) {
      cardBg = '#e3f2fd';
      cardBorder = '#90caf9';
      textColor = '#1565c0';
      icon = '⚡';
    } else if (code >= 400 && code < 500) {
      cardBg = '#fff3e0';
      cardBorder = '#ffcc80';
      textColor = '#e65100';
      icon = '⚠️';
    } else if (code >= 500) {
      cardBg = '#ffebee';
      cardBorder = '#ef9a9a';
      textColor = '#c62828';
      icon = '🚨';
    }
    
    return `<div style="flex: 1; min-width: 140px; max-width: 220px; background: ${cardBg}; border: 1px solid ${cardBorder}; border-radius: 6px; padding: 10px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
      <div style="font-size: 12px; font-weight: bold; color: ${textColor}; display: flex; align-items: center; justify-content: center; gap: 4px;">
        ${icon} HTTP ${code}
      </div>
      <div style="font-size: 18px; font-weight: bold; margin: 6px 0 2px; color: #111;">${count}</div>
      <div style="font-size: 10px; color: #666; font-weight: 600;">${pct.toFixed(2)}% del total</div>
    </div>`;
  }).filter(Boolean).join('');

  let networkCard = '';
  if (globalNetworkErrors > 0) {
    const netPct = totalReqs > 0 ? (globalNetworkErrors / totalReqs) * 100 : 0;
    networkCard = `<div style="flex: 1; min-width: 140px; max-width: 220px; background: #f3e5f5; border: 1px solid #d1c4e9; border-radius: 6px; padding: 10px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
      <div style="font-size: 12px; font-weight: bold; color: #6a1b9a; display: flex; align-items: center; justify-content: center; gap: 4px;">
        ⚡ Red/Timeout
      </div>
      <div style="font-size: 18px; font-weight: bold; margin: 6px 0 2px; color: #111;">${globalNetworkErrors}</div>
      <div style="font-size: 10px; color: #666; font-weight: 600;">${netPct.toFixed(2)}% del total</div>
    </div>`;
  }
  
  return `<section class="section">
    <div class="section-title">📊 Resumen de Respuestas HTTP de toda la Prueba (Muestra Total)</div>
    <div class="section-body" style="padding: 16px;">
      <p style="margin: 0 0 14px; font-size: 11.5px; color: #555;">
        Este bloque consolida el total de peticiones de la prueba (${totalReqs} transacciones) clasificadas por su respectivo código de estado HTTP y peso relativo:
      </p>
      <div style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: flex-start;">
        ${cards}
        ${networkCard}
      </div>
    </div>
  </section>`;
}

function buildGranularAnalysis(ips, endpoints, checks, data, SLO) {
  const nodeAccordions = ips
    .map((ip, index) => {
      const nodeName = `Nodo AUDIT-${index + 1}`;
      const displayName = `Nodo ${index + 1}`;

      const durTrend = metric(data, `http_req_duration{source_ip:${ip.ip}}`);
      const apdex = estimateIpApdex(durTrend);

      const p95Pass = num(ip.p95, Infinity) < SLO.p95;
      const p99Pass = num(ip.p99, Infinity) < SLO.p99;
      const errorPass = num(ip.errorRate, 0) < SLO.errorRate;
      const apdexPass = apdex >= SLO.apdex;
      const sloPass = p95Pass && errorPass;

      return `<details class="k6-check-ip" ${index === 0 ? 'open' : ''} style="margin-bottom: 12px; border: 1px solid #c5cae9; border-radius: 8px; overflow: hidden; background: #fff;">
      <summary style="background: #f6f7ff; color: #1a237e; font-size: 12px; border-left: 4px solid #283593; font-weight: bold; padding: 10px 16px 10px 34px;">
        🌐 ${nodeName} | IP: ${escapeHtml(ip.ip)}
      </summary>
      <div style="padding: 14px;">
        <!-- KPI Card -->
        <div class="sub-card">
          <div class="sub-card-title">📊 KPI's de Rendimiento — ${displayName}</div>
          <div style="overflow-x:auto">
            <table class="master" style="margin: 0;">
              <thead>
                <tr>
                  <th>CATEGORÍA</th>
                  <th>Total Reqs</th>
                  <th>Mediana (p50)</th>
                  <th>p95 * SLO</th>
                  <th>p99 (Cola)</th>
                  <th>Tasa Errores</th>
                  <th>TTFB (Server)</th>
                  <th>Bloqueo Red</th>
                  <th>Seguridad TLS</th>
                  <th>APDEX Score</th>
                  <th>Estado SLO</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="left strong">VALOR</td>
                  <td>${ip.reqs}</td>
                  <td>${fmtMs(ip.p50)}</td>
                  <td class="strong">${fmtMs(ip.p95)}</td>
                  <td>${fmtMs(ip.p99)}</td>
                  <td class="${ip.errorRate >= SLO.errorRate ? 'strong' : ''}" style="${ip.errorRate >= SLO.errorRate ? 'color:#c62828' : ''}">${fmtPct(ip.errorRate)}</td>
                  <td>${fmtMs(ip.ttfb)}</td>
                  <td>${fmtMs(ip.blocked)}</td>
                  <td>${fmtMs(ip.tls)}</td>
                  <td>${fmtFixed(apdex, 3)}</td>
                  <td style="color:${passColor(sloPass)};font-weight:700">${passMark(sloPass)} ${sloPass ? 'OK' : 'REV'}</td>
                </tr>
                <tr>
                  <td class="left strong">UMBRAL</td>
                  <td>—</td>
                  <td>Ref.</td>
                  <td>&lt; ${SLO.p95}ms</td>
                  <td>&lt; ${SLO.p99}ms</td>
                  <td>&lt; 1%</td>
                  <td>Server</td>
                  <td>Net</td>
                  <td>&lt; ${SLO.tls}ms</td>
                  <td>&gt; ${fmtFixed(SLO.apdex, 2)}</td>
                  <td>SLO</td>
                </tr>
                <tr>
                  <td class="left strong">ESTADO</td>
                  <td class="dot" style="color:#2e7d32">●</td>
                  <td class="dot" style="color:#2e7d32">●</td>
                  <td style="color:${passColor(p95Pass)}">${passMark(p95Pass)} ${p95Pass ? 'OK' : 'REV'}</td>
                  <td style="color:${passColor(p99Pass)}">${passMark(p99Pass)} ${p99Pass ? 'OK' : 'REV'}</td>
                  <td style="color:${passColor(errorPass)}">${passMark(errorPass)} ${errorPass ? 'OK' : 'FALLA'}</td>
                  <td class="mono">i</td>
                  <td class="mono">i</td>
                  <td class="mono">i</td>
                  <td style="color:${passColor(apdexPass)}">${passMark(apdexPass)} ${apdexPass ? 'OK' : 'REV'}</td>
                  <td style="color:${passColor(sloPass)}">${passMark(sloPass)} ${sloPass ? 'OK' : 'REV'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Distribution Card -->
        <div class="sub-card">
          <div class="sub-card-title">🔌 Distribución de Respuestas HTTP / Reglas de Negocio (Evidencia ${displayName})</div>
          ${buildIpBusinessDistribution(data, endpoints, checks, ip.ip)}
          ${buildIpErrorBreakdownTable(data, checks, ip.ip, endpoints)}
        </div>
      </div>
    </details>`;
    })
    .join('');

  return `<details class="section" open>
    <summary>🔍 Análisis Granular: Evidencia Detallada por Nodo</summary>
    <div class="section-body" style="padding: 12px 16px 4px;">
      ${nodeAccordions}
    </div>
  </details>`;
}

function buildFunctionalCaseSummary(data, endpoints) {
  const byTag = Object.fromEntries(endpoints.map((ep) => [ep.tag, ep]));
  const isCaso01 = Boolean(byTag.entidad_crear);
  const isCaso02 = Boolean(byTag.cabecerainfraccionsancion_crearcondetalles);
  const isCaso04 = Boolean(byTag.cabecerainfraccionsancion_actualizar);
  const iterations = metric(data, 'iterations');
  const visualTarget = Number(iterations.count || 0);
  const audit = recordsAudit(data, endpoints);
  const rows = isCaso01
    ? [
        {
          type: 'Creación',
          step: '1. Crear administrado',
          endpoint: byTag.entidad_crear,
          created: creationCount(data, 'administrado'),
          note: 'Alta de administrado/entidad. Los conflictos 409 deben leerse como regla de negocio, no como caída del servicio.',
        },
      ]
    : isCaso04
      ? [
          {
            type: 'Consulta',
            step: '1. Listar cabeceras sancionadas',
            endpoint: byTag.cabecerainfraccionsancion_listarpaginado,
            created: '-',
            note: 'Precondición funcional: ubica una cabecera existente candidata a reconsideración.',
          },
          {
            type: 'Actualización',
            step: '2. Actualizar cabecera de reconsideración',
            endpoint: byTag.cabecerainfraccionsancion_actualizar,
            created: creationCount(data, 'reconsideracion'),
            note: 'Registra la resolución de reconsideración con evidencia. Use este contador como evidencia de reconsideraciones actualizadas.',
          },
          {
            type: 'Consulta',
            step: '3. Listar detalle de sanción',
            endpoint: byTag.detalleinfraccionsancion_listarpaginado,
            created: '-',
            note: 'Obtiene el detalle asociado para aplicar la reconsideración sobre una sanción real.',
          },
          {
            type: 'Actualización',
            step: '4. Actualizar detalle',
            endpoint: byTag.detalleinfraccionsancion_actualizar,
            created: '-',
            note: 'Marca/actualiza el detalle para el flujo de reconsideración. Los rechazos funcionales deben revisarse como regla de negocio.',
          },
        ]
    : isCaso02
      ? [
          {
            type: 'Consulta',
            step: '1. Listar infracciones',
            endpoint: byTag.infraccion_listar,
            created: '-',
            note: 'Precondicion funcional: obtiene catalogo para construir la sancion.',
          },
          {
            type: 'Creacion transaccional',
            step: '2. Crear cabecera con detalles',
            endpoint: byTag.cabecerainfraccionsancion_crearcondetalles,
            created: audit.created,
            note: 'Endpoint unificado. Una iteracion solo cuenta como registro creado si la respuesta trae RESULTADO valido.',
          },
        ]
      : [
        {
          type: 'Consulta',
          step: '1. Listar infracciones',
          endpoint: byTag.infraccion_listar,
          created: '-',
          note: 'Precondición funcional: obtiene catálogo para construir la sanción.',
        },
        {
          type: 'Creación',
          step: '2. Crear cabecera',
          endpoint: byTag.cabecerainfraccionsancion_crear,
          created: creationCount(data, 'cabecera'),
          note: 'Operación limitada por rate limit; aquí se observan los 429.',
        },
        {
          type: 'Creación',
          step: '3. Crear medida correctiva',
          endpoint: byTag.medidacorrectiva_crear,
          created: creationCount(data, 'medida'),
          note: 'Solo se intenta si la cabecera fue creada correctamente.',
        },
        {
          type: 'Creación',
          step: '4. Crear detalle sanción',
          endpoint: byTag.detalleinfraccionsancion_crear,
          created: creationCount(data, 'detalle_sancion'),
          note: 'Cierre transaccional de la sanción; sensible a locks/deadlocks en BD.',
        },
      ];

  const finalColumnTitle = isCaso04 ? 'Procesadas al final' : 'Creadas al final';
  const totalLabel = isCaso04
    ? 'Total de operaciones de reconsideración registradas'
    : 'Total de operaciones de creación registradas';
  const totalRows = isCaso04
    ? rows.filter((row) => row.type === 'Actualización' && row.endpoint?.tag === 'cabecerainfraccionsancion_actualizar')
    : rows.filter((row) => row.type === 'Creación' || row.type === 'Creacion transaccional');

  const htmlRows = rows
    .map((row) => {
      const ep = row.endpoint;
      const counts = ep ? endpointOutcomeCounts(data, ep) : { success: 0, business: 0, gateway429: 0, unexpected: 0, network: 0 };
      const created = row.created === 0 && ep ? counts.success : row.created;
      return `<tr>
        <td class="left strong">${escapeHtml(row.type)}</td>
        <td class="left">${escapeHtml(row.step)}</td>
        <td class="left mono">${escapeHtml(ep ? ep.title : '-')}</td>
        <td style="background:#e8f5e9;color:#1b5e20;font-weight:700">${counts.success}</td>
        <td style="background:#e3f2fd;color:#0d47a1;font-weight:700">${counts.gateway429}</td>
        <td style="background:#ffebee;color:#b71c1c;font-weight:700">${counts.unexpected + counts.network}</td>
        <td class="strong">${created}</td>
        <td class="left">${escapeHtml(row.note)}</td>
      </tr>`;
    })
    .join('');

  const totalCreated = totalRows
    .reduce((sum, row) => sum + (Number(row.created) || 0), 0);

  const auditBanner = isCaso02
    ? `<div class="note" style="background:${audit.match ? '#e8f5e9' : '#ffebee'};border-left:4px solid ${audit.match ? '#2e7d32' : '#c62828'};">
        <strong>Auditoria de registros Caso 02:</strong>
        esperados ${audit.expected}, creados ${audit.created}, faltantes ${audit.missing}.
        Fuente: ${escapeHtml(audit.source)}.
        ${audit.globalCounter && audit.globalCounter !== audit.created ? ` Contador global observado: ${audit.globalCounter}; no se usa como verdad unica porque puede incluir doble conteo.` : ''}
      </div>`
    : '';

  return `<details class="section" open>
    <summary>${isCaso01 ? '📌 Lectura Funcional del Caso 01: Creación de Administrado' : (isCaso04 ? '📌 Lectura Funcional del Caso 04: Reconsideración con Sanciones' : '📌 Lectura Funcional del Caso 02: Consulta vs Creación')}</summary>
    <div class="note">
      ${isCaso01
        ? 'Este caso valida la creación de administrados. Para reportarlo, separe las aceptadas 2xx de los rechazos funcionales como duplicados/conflictos y de los errores técnicos.'
        : (isCaso04
          ? 'Este caso combina consulta de precondición, actualización de cabecera con resolución de reconsideración y actualización de detalle. Para reportarlo, separe la salud de las consultas del cierre funcional en CabeceraInfraccionSancion/Actualizar.'
          : 'Este caso combina una consulta de catálogo con una creación transaccional unificada. Para reportarlo sin mezclar conceptos, lea primero la salud de la consulta y luego la creación en CabeceraInfraccionSancion/CrearConDetalles. Una iteración solo debe considerarse creada cuando la respuesta trae RESULTADO válido.')}
    </div>
    ${auditBanner}
    <div style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th class="left">Tipo</th>
            <th class="left">Paso</th>
            <th class="left">Endpoint</th>
            <th>Aceptadas 2xx</th>
            <th>429</th>
            <th>Error/Red</th>
            <th>${finalColumnTitle}</th>
            <th class="left">Lectura</th>
          </tr>
        </thead>
        <tbody>${htmlRows}</tbody>
      </table>
    </div>
    <div class="note" style="background:#f6f7ff;border-top:1px solid #dfe3f5;">
      <strong>${totalLabel}:</strong> ${totalCreated}. ${isCaso01
        ? 'Para evidencia de administrados creados, priorice la fila Crear administrado.'
        : (isCaso04
          ? `Objetivo visual esperado: ${visualTarget} registro(s) únicos con reconsideración, equivalente a las iteraciones completadas de la corrida. Este valor cuenta operaciones aceptadas por CabeceraInfraccionSancion/Actualizar; si una misma cabecera se procesa varias veces, la cantidad de registros únicos visibles en la UI puede ser menor.`
          : (isCaso02
            ? `Objetivo audit esperado: ${audit.expected} registros creados, equivalente a las iteraciones completadas. Resultado observado: ${audit.created}; faltan ${audit.missing}.`
            : 'Para evidencia de sanciones completas, priorice la fila Crear detalle sanción, porque representa el cierre funcional del flujo.'))}
    </div>
  </details>`;
}

function detectedSourceIp(opts, ips) {
  if (ips.length === 1) return ips[0].ip;
  if (opts.sourceIp && opts.sourceIp !== 'auto') return opts.sourceIp;
  return ips.length ? ips.map((x) => x.ip).join(', ') : 'auto';
}

function executionMode(testName, opts, ips, endpoints) {
  const scenario = scenarioName(testName);
  if (scenario === 'smoke') {
    return {
      title: 'SMOKE 1-IP (Baseline mínimo)',
      mode: '1-IP Baseline',
      description: 'Esta ejecución usó 1 VU / 1 IP de origen (validación rápida de funcionalidad).',
      hint: 'Para pruebas multi-IP, use los comandos específicos por servicio o el escenario CP02.',
    };
  }
  if (scenario === 'multi_ip_audit') {
    return {
      title: 'AUDITORÍA MULTI-IP',
      mode: 'Multi-IP Audit',
      description: `Esta ejecución validó trazabilidad por IP con ${ips.length || 'N'} IP(s) de origen y ${endpoints.length || 'N'} endpoint(s).`,
      hint: 'Revise que cada IP esperada tenga métricas y sin pérdida de evidencia.',
    };
  }
  return {
    title: `${scenario.toUpperCase()} (${opts.ipMode === 'multi' ? 'Multi-IP' : 'Single-IP'})`,
    mode: opts.ipMode === 'multi' ? 'Multi-IP' : 'Single-IP',
    description: 'Ejecución de rendimiento con métricas agregadas por endpoint, SLO e indicadores SRE.',
    hint: 'Cruce estos resultados con monitoreo de API, gateway y base de datos antes de concluir causa raíz.',
  };
}

function firstEndpointUrl(endpoints) {
  if (!endpoints.length) return '-';
  return `${reportBaseUrl()}/${endpoints[0].title}`;
}

function reportBaseUrl() {
  let base = (__ENV.BASE_URL || 'https://reginsaapiqa.sunedu.gob.pe/api').replace(/\/+$/, '');
  if (!base.endsWith('/api')) base += '/api';
  return base;
}

function buildEndpointUrlList(endpoints) {
  if (!endpoints.length) return '<div class="url">-</div>';
  const base = reportBaseUrl();
  return `<div class="url" style="line-height:1.65;margin-top:8px;">
    ${endpoints
      .map((ep) => `<div><strong>${escapeHtml(ep.label)}:</strong> ${escapeHtml(`${base}/${ep.title}`)}</div>`)
      .join('')}
  </div>`;
}

function buildBusinessDistribution(data, endpoints, checks) {
  if (!endpoints.length) {
    return '<div class="empty">Sin métricas por endpoint para distribución HTTP.</div>';
  }

  const cards = endpoints
    .map((ep) => {
      const metricStats = endpointOutcomeCounts(data, ep);
      const checkStats = endpointCheckStats(checks, ep);
      const stats = {
        success: metricStats.success || checkStats.success,
        business: metricStats.business || checkStats.business,
        gateway429: metricStats.gateway429 || checkStats.gateway429,
        unexpected: metricStats.unexpected + metricStats.network || checkStats.unexpected,
        unexpectedBreakdown: checkStats.unexpectedBreakdown,
      };
      
      let unexpectedBreakdown = { ...stats.unexpectedBreakdown };
      let unexpected = stats.unexpected;
      if (endpoints.length === 1 && unexpected === 0) {
        [400, 401, 403, 404, 500, 502, 503, 504].forEach((st) => {
          const c = countMetric(data, `http_reqs{status:${st}}`);
          if (c > 0) {
            unexpectedBreakdown[st] = c;
            unexpected += c;
          }
        });
      }

      return `<div class="http-card">
      <div class="http-card-title">${escapeHtml(ep.label)}</div>
      <table class="compact">
        <tr class="ok-row"><td>&#10004; HTTP 2xx - Aceptadas</td><td>${stats.success}</td></tr>
        <tr><td>&#9888; HTTP 200 - Límite negocio</td><td>${stats.business}</td></tr>
        <tr><td>HTTP 429 - Rate Limit Gateway</td><td>${stats.gateway429}</td></tr>
        <tr><td>&#10060; HTTP 4xx/5xx - Error servidor</td><td>${formatBreakdown(unexpectedBreakdown, unexpected)}</td></tr>
      </table>
    </div>`;
    })
    .join('');

  return `<div class="note" style="width:100%;background:#f6f7ff;border:1px solid #dfe3f5;border-radius:6px;margin-bottom:12px;">
    <strong>Muestra total consolidada:</strong> estos conteos agrupan todas las peticiones del run por endpoint, sin separar por IP. Use esta vista para explicar el resultado funcional/técnico general del caso; use el análisis granular solo para atribuir diferencias a nodos/IP.
  </div>${cards}`;
}

function buildEndpointDashboard(endpoints) {
  const rows = endpoints
    .map(
      (ep) => `<tr>
    <td class="left strong">${escapeHtml(ep.label)}</td>
    <td>${ep.reqs}</td>
    <td>${fmtMs(ep.avg)}</td>
    <td>${fmtMs(ep.p50)}</td>
    <td>${fmtMs(ep.p90)}</td>
    <td class="slo-cell">${fmtMs(ep.p95)}</td>
    <td>${fmtMs(ep.p99)}</td>
    <td>${fmtPct(ep.errorRate)}</td>
    <td style="color:${passColor(ep.sloPass)};font-weight:700">${passMark(ep.sloPass)} ${passIcon(ep.sloPass)}</td>
  </tr>`,
    )
    .join('');

  return `<table>
    <thead>
      <tr>
        <th class="left">Endpoint</th><th>Reqs</th><th>avg</th><th>p50</th><th>p90</th><th class="slo-head">p95 * SLO</th><th>p99</th><th>Error %</th><th>Estado SLO</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="9" class="empty">Sin métricas por endpoint</td></tr>'}</tbody>
  </table>`;
}

function buildMasterDashboard(data) {
  const dur = metric(data, 'http_req_duration');
  const checks = metric(data, 'checks');
  const reqs = metric(data, 'http_reqs');
  const ttfb = metric(data, 'http_req_waiting');
  const blocked = metric(data, 'http_req_blocked');
  const tls = metric(data, 'http_req_tls_handshaking');
  const apdex = metric(data, 'apdex_score');
  const session = metric(data, 'session_success_rate');
  const globalErrorRate = effectiveErrorRate(data);

  const p95Pass = num(dur['p(95)'], Infinity) < SLO.p95;
  const p99Pass = num(dur['p(99)'], Infinity) < SLO.p99;
  const errorPass = globalErrorRate < SLO.errorRate;
  const apdexPass = num(apdex.avg, 0) >= SLO.apdex;
  const checksPass = (checks.rate ?? checks.value ?? 0) >= SLO.checks;
  const sessionPass = (session.rate ?? session.value ?? 0) >= SLO.session;

  return `<table class="master">
    <tr>
      <th>Categoría</th><th>Total<br>Reqs</th><th>Promedio<br>(avg)</th><th>Mediana<br>(p50)</th><th>p90</th><th class="slo-head">p95 *<br>SLO</th><th>p99<br>(Cola)</th><th>Tasa<br>Errores</th><th>TTFB<br>(Server)</th><th>Bloqueo<br>Red</th><th>Seguridad<br>TLS</th><th>APDEX<br>Score</th><th>Checks<br>OK</th><th>Sesión<br>Éxito</th>
    </tr>
    <tr>
      <td class="left strong">VALOR</td><td>${reqs.count || 0}</td><td>${fmtMs(dur.avg)}</td><td>${fmtMs(dur.med)}</td><td>${fmtMs(dur['p(90)'])}</td><td class="slo-cell">${fmtMs(dur['p(95)'])}</td><td>${fmtMs(dur['p(99)'])}</td><td>${fmtPct(globalErrorRate)}</td><td>${fmtMs(ttfb.avg)}</td><td>${fmtMs(blocked.avg)}</td><td>${fmtMs(tls.avg)}</td><td>${fmtFixed(apdex.avg)}</td><td>${fmtPct(checks.rate ?? checks.value ?? 0)}</td><td>${fmtPct(session.rate ?? session.value ?? 0)}</td>
    </tr>
    <tr>
      <td class="left strong">UMBRAL</td><td>-</td><td>Ref.</td><td>Ref.</td><td>Ref.</td><td>&lt; ${SLO.p95} ms</td><td>&lt; ${SLO.p99} ms</td><td>&lt; ${fmtPct(SLO.errorRate)}</td><td>Server</td><td>Net</td><td>&lt; ${SLO.tls} ms</td><td>&gt; ${fmtFixed(SLO.apdex, 2)}</td><td>&gt; ${fmtPct(SLO.checks)}</td><td>&gt; ${fmtPct(SLO.session)}</td>
    </tr>
    <tr>
      <td class="left strong">ESTADO</td><td class="dot">●</td><td class="dot">●</td><td class="dot">●</td><td class="dot">●</td><td style="color:${passColor(p95Pass)}">${passMark(p95Pass)} ${passIcon(p95Pass)}</td><td style="color:${passColor(p99Pass)}">${passMark(p99Pass)} ${passIcon(p99Pass)}</td><td style="color:${passColor(errorPass)}">${passMark(errorPass)} ${passIcon(errorPass)}</td><td>Info</td><td>Info</td><td>Info</td><td style="color:${passColor(apdexPass)}">${passMark(apdexPass)} ${passIcon(apdexPass)}</td><td style="color:${passColor(checksPass)}">${passMark(checksPass)} ${passIcon(checksPass)}</td><td style="color:${passColor(sessionPass)}">${passMark(sessionPass)} ${passIcon(sessionPass)}</td>
    </tr>
  </table>`;
}

function buildIpTable(ips) {
  if (!ips.length)
    return '<div class="empty">Sin métricas por IP. Para smoke single-IP puede ser esperado si K6_LOCAL_IPS no está definido.</div>';
  return `<table>
    <thead><tr><th class="left">IP</th><th>Reqs</th><th>Avg</th><th>p95</th><th>p99</th><th>Error %</th><th>TTFB avg</th></tr></thead>
    <tbody>${ips
      .map(
        (ip) => `<tr>
      <td class="left strong">${escapeHtml(ip.ip)}</td>
      <td>${ip.reqs}</td>
      <td>${fmtMs(ip.avg)}</td>
      <td>${fmtMs(ip.p95)}</td>
      <td>${fmtMs(ip.p99)}</td>
      <td>${fmtPct(ip.errorRate)}</td>
      <td>${fmtMs(ip.ttfb)}</td>
    </tr>`,
      )
      .join('')}</tbody>
  </table>`;
}

function _buildChecksTable(checks) {
  if (!checks.length) return '<div class="empty">Sin checks funcionales registrados.</div>';
  return `<table>
    <thead><tr><th class="left">Grupo</th><th class="left">Check</th><th>OK</th><th>Fail</th></tr></thead>
    <tbody>${checks
      .slice(0, 500)
      .map(
        (c) => `<tr>
      <td class="left mono">${escapeHtml(c.path)}</td>
      <td class="left">${escapeHtml(c.name)}</td>
      <td>${c.passes}</td>
      <td>${c.fails}</td>
    </tr>`,
      )
      .join('')}</tbody>
  </table>`;
}

function buildLegend() {
  return `<details class="section" open>
    <summary>Leyenda de Métricas - Por qué cada indicador importa más que el promedio</summary>
    <div class="note">El promedio puede ocultar picos: una sola respuesta de 10s eleva el avg aunque el 99% responda en milisegundos. Los percentiles p50, p90, p95 y p99 revelan la experiencia real de los usuarios.</div>
    <table>
      <thead><tr><th class="left">Métrica</th><th class="left">Qué mide</th><th class="left">Por qué importa / Criterio de evaluación</th><th>Umbral</th><th>Estándar</th></tr></thead>
      <tbody>
        <tr><td class="left mono strong">p(50) - Mediana</td><td class="left">El 50% de usuarios recibe respuesta en este tiempo o menos.</td><td class="left">Más honesto que el promedio para el usuario típico.</td><td>-</td><td>ISO/IEC 25023</td></tr>
        <tr><td class="left mono strong">p(90)</td><td class="left">El 90% de usuarios recibe respuesta en este tiempo o menos.</td><td class="left">Señal temprana de degradación antes del p99.</td><td>-</td><td>ISTQB PT</td></tr>
        <tr><td class="left mono strong">p(95) * SLO Principal</td><td class="left">El 95% de usuarios recibe respuesta en este tiempo o menos.</td><td class="left">Indicador clave para SLA/SLO; si supera 1500ms, 1 de cada 20 usuarios ya percibe degradación.</td><td>&lt; 1500 ms</td><td>Google SRE</td></tr>
        <tr><td class="left mono strong">p(99) - Cola larga</td><td class="left">El 1% peor de respuestas.</td><td class="left">Detecta timeouts y comportamientos extremos que el promedio oculta.</td><td>&lt; 2000 ms</td><td>ISTQB PT</td></tr>
        <tr><td class="left mono strong">avg - Promedio</td><td class="left">Suma de todos los tiempos dividida entre el número de requests.</td><td class="left">Engañoso como métrica principal: un solo outlier puede elevar el avg aunque p95 sea aceptable.</td><td>Secundario</td><td>ISO/IEC 25024</td></tr>
        <tr><td class="left mono strong">Error rate</td><td class="left">Porcentaje de requests HTTP fallidos.</td><td class="left">Mide fiabilidad; debe permanecer bajo antes de escalar carga.</td><td>&lt; 1%</td><td>SRE Errors</td></tr>
        <tr><td class="left mono strong">http_req_waiting (TTFB)</td><td class="left">Tiempo hasta el primer byte.</td><td class="left">Revela carga real del backend: BD, lógica de negocio y colas internas.</td><td>-</td><td>Google SRE</td></tr>
        <tr><td class="left mono strong">http_req_blocked</td><td class="left">Tiempo esperando conexión TCP disponible.</td><td class="left">Alto indica saturación de conexiones en cliente, gateway o balanceador.</td><td>-</td><td>ISO/IEC 25023</td></tr>
        <tr><td class="left mono strong">http_req_tls_handshaking</td><td class="left">Tiempo de negociación TLS/SSL.</td><td class="left">Alto puede indicar certificados, CPU saturada o configuración TLS incorrecta.</td><td>-</td><td>ISO/IEC 25010</td></tr>
        <tr><td class="left mono strong">APDEX Score</td><td class="left">Satisfacción de usuario en escala 0 a 1.</td><td class="left">Resume experiencia: 1.0 excelente, &gt;0.90 recomendado para baseline.</td><td>&gt; 0.90</td><td>Apdex / ISO</td></tr>
        <tr><td class="left mono strong">checks</td><td class="left">Validaciones funcionales sobre cuerpo y estado de respuesta.</td><td class="left">Confirma que el servicio responde correctamente, no solo rápido.</td><td>&gt; 99%</td><td>ISTQB PT</td></tr>
        <tr><td class="left mono strong">session_success_rate</td><td class="left">Porcentaje de sesiones completas sin error funcional.</td><td class="left">Indicador de disponibilidad percibida por el usuario final.</td><td>&gt; 99%</td><td>ISO/IEC 25010</td></tr>
        <tr><td class="left mono strong">source_ip</td><td class="left">IP de origen del VU en esa iteración.</td><td class="left">Confirma participación de IPs y detecta rutas con latencia anómala.</td><td>Todas activas</td><td>ISTQB PT</td></tr>
      </tbody>
    </table>
  </details>`;
}

function buildRecommendation() {
  return `<details class="section recommendation" open>
    <summary>Recomendación Técnica: Migrar a k6 + Grafana Cloud (licencia de pago)</summary>
    <div class="note strong">Las métricas actuales se generan offline por restricciones de red interna SUNEDU. Activar Grafana Cloud k6 aportaría las siguientes capacidades críticas:</div>
    <table>
      <tbody>
        <tr><td class="left strong">Tendencias históricas</td><td class="left">Compara automáticamente p95 de este release contra anteriores y detecta regresiones antes de producción.</td></tr>
        <tr><td class="left strong">Dashboards en tiempo real</td><td class="left">Identifica en qué minuto y bajo cuántos VUs ocurre el quiebre. El reporte offline solo muestra el resultado final.</td></tr>
        <tr><td class="left strong">Colaboración QA/Dev/Infra</td><td class="left">Todos los equipos ven los mismos datos en vivo sin reportes Word/Excel por correo.</td></tr>
        <tr><td class="left strong">Alertas automáticas SLO</td><td class="left">Si p95 supera 1500ms, Grafana puede alertar al equipo sin intervención manual.</td></tr>
        <tr><td class="left strong">Correlación con servidor</td><td class="left">Cruza métricas k6 con CPU/RAM/conexiones BD para identificar el cuello de botella exacto.</td></tr>
      </tbody>
    </table>
    <div class="note" style="font-size:10px;color:#6b5b00">Gestionar con infraestructura SUNEDU la apertura del puerto 443 hacia app.k6.io y prometheus-prod-XX.grafana.net.</div>
  </details>`;
}

function metricDisplayName(name) {
  const labels = {
    http_req_duration: 'http_req_duration (Duración Total)',
    http_req_waiting: 'http_req_waiting (Espera Server)',
    http_req_blocked: 'http_req_blocked (Bloqueo Red)',
    http_req_connecting: 'http_req_connecting (Conexión)',
    http_req_receiving: 'http_req_receiving (Recibiendo)',
    http_req_sending: 'http_req_sending (Enviando)',
    http_req_tls_handshaking: 'http_req_tls_handshaking (Seguridad TLS)',
    iteration_duration: 'iteration_duration (Duración Iteración)',
    apdex_score: 'apdex_score (Satisfacción)',
    ttfb_ms: 'ttfb_ms (TTFB custom)',
  };
  return labels[name] || name;
}

function metricRows(data, type) {
  const metrics = data.metrics || {};
  return Object.keys(data.metrics || {})
    .sort()
    .filter((name) => metrics[name] && metrics[name].type === type)
    .map((name) => ({ name, v: values(metrics[name]) }));
}

function buildTrendRows(data) {
  const rows = metricRows(data, 'trend')
    .filter((item) => !item.name.includes('{source_ip:'))
    .map(
      (item) => `<tr>
      <td class="left strong">${escapeHtml(metricDisplayName(item.name))}</td>
      <td>${fmtFixed(item.v.avg, 2)}</td>
      <td>${fmtFixed(item.v.min, 2)}</td>
      <td>${fmtFixed(item.v.med, 2)}</td>
      <td>${fmtFixed(item.v.max, 2)}</td>
      <td>${fmtFixed(item.v['p(90)'], 2)}</td>
      <td>${fmtFixed(item.v['p(95)'], 2)}</td>
      <td>${fmtFixed(item.v['p(99)'], 2)}</td>
      <td>${item.v.count || '-'}</td>
    </tr>`,
    )
    .join('');

  return `<h4>Trends & Times</h4>
    <table>
      <thead><tr><th class="left">Metric</th><th>AVG</th><th>MIN</th><th>MED</th><th>MAX</th><th>P(90)</th><th>P(95)</th><th>P(99)</th><th>COUNT</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="9" class="empty">Sin métricas trend.</td></tr>'}</tbody>
    </table>`;
}

function buildRateCounterRows(data) {
  const rateRows = metricRows(data, 'rate')
    .filter((item) => !item.name.includes('{source_ip:') && !item.name.startsWith('http_reqs{status:'))
    .map(
      (item) => `<tr>
      <td class="left strong">${escapeHtml(item.name)}</td>
      <td>${fmtPct(item.v.rate ?? item.v.value)}</td>
      <td>${item.v.passes ?? '-'}</td>
      <td>${item.v.fails ?? '-'}</td>
    </tr>`,
    )
    .join('');

  const counterRows = metricRows(data, 'counter')
    .concat(metricRows(data, 'gauge'))
    .filter((item) => !item.name.includes('{source_ip:') && !item.name.startsWith('http_reqs{status:'))
    .map(
      (item) => `<tr>
      <td class="left strong">${escapeHtml(item.name)}</td>
      <td>${item.v.count ?? item.v.value ?? '-'}</td>
      <td>${fmtFixed(item.v.rate ?? item.v.value, 4)}</td>
      <td>${fmtPct(item.v.rate ?? item.v.value)}</td>
    </tr>`,
    )
    .join('');

  return `<h4>Rates, Counters & Gauges</h4>
    <table>
      <thead><tr><th class="left">Metric</th><th>RATE %</th><th>PASS COUNT</th><th>FAIL COUNT</th></tr></thead>
      <tbody>${rateRows || '<tr><td colspan="4" class="empty">Sin métricas rate.</td></tr>'}</tbody>
    </table>
    <table>
      <thead><tr><th class="left">Metric</th><th>COUNT</th><th>RATE/VALUE</th><th>PCT</th></tr></thead>
      <tbody>${counterRows || '<tr><td colspan="4" class="empty">Sin métricas counter/gauge.</td></tr>'}</tbody>
    </table>`;
}

function buildRunDetails(data, testName, mode, endpoints, ips) {
  const reqs = metric(data, 'http_reqs');
  const iterations = metric(data, 'iterations');
  const vusMax = metric(data, 'vus_max');
  return `<table>
    <tbody>
      <tr><td class="left strong">Run</td><td class="left">${escapeHtml(testName)}</td></tr>
      <tr><td class="left strong">Escenario</td><td class="left">${escapeHtml(scenarioName(testName))}</td></tr>
      <tr><td class="left strong">Modo</td><td class="left">${escapeHtml(mode.mode)}</td></tr>
      <tr><td class="left strong">Endpoints observados</td><td class="left">${escapeHtml(endpoints.map((e) => e.label).join(', ') || '-')}</td></tr>
      <tr><td class="left strong">IPs activas</td><td class="left">${escapeHtml(ips.map((ip) => ip.ip).join(', ') || '-')}</td></tr>
      <tr><td class="left strong">Total requests</td><td class="left">${reqs.count || 0}</td></tr>
      <tr><td class="left strong">RPS</td><td class="left">${fmtFixed(reqs.rate, 2)}</td></tr>
      <tr><td class="left strong">Iteraciones</td><td class="left">${iterations.count || 0}</td></tr>
      <tr><td class="left strong">VUs max</td><td class="left">${vusMax.max ?? vusMax.value ?? '-'}</td></tr>
    </tbody>
  </table>`;
}

function buildRunDetailCards(data, checks) {
  const reqs = metric(data, 'http_reqs');
  const iterations = metric(data, 'iterations');
  const vus = metric(data, 'vus');
  const vusMax = metric(data, 'vus_max');
  const dataReceived = metric(data, 'data_received');
  const dataSent = metric(data, 'data_sent');
  const passedChecks = checks.reduce((sum, c) => sum + c.passes, 0);
  const failedChecks = checks.reduce((sum, c) => sum + c.fails, 0);

  return `<div class="k6-detail-grid">
    <div class="k6-detail-card">
      <h4>Checks</h4>
      <div><span>Passed</span><strong>${passedChecks}</strong></div>
      <div><span>Failed</span><strong>${failedChecks}</strong></div>
    </div>
    <div class="k6-detail-card">
      <h4>Iterations</h4>
      <div><span>Total</span><strong>${iterations.count || 0}</strong></div>
      <div><span>Rate</span><strong>${fmtRate(iterations.rate)}</strong></div>
    </div>
    <div class="k6-detail-card">
      <h4>Virtual Users</h4>
      <div><span>Min</span><strong>${vus.min ?? vus.value ?? '-'}</strong></div>
      <div><span>Max</span><strong>${vusMax.max ?? vusMax.value ?? '-'}</strong></div>
    </div>
    <div class="k6-detail-card">
      <h4>Requests</h4>
      <div><span>Total</span><strong>${reqs.count || 0}</strong></div>
      <div><span>Rate</span><strong>${fmtRate(reqs.rate)}</strong></div>
    </div>
    <div class="k6-detail-card">
      <h4>Data Received</h4>
      <div><span>Total</span><strong>${fmtMb(dataReceived.count)}</strong></div>
      <div><span>Rate</span><strong>${fmtMbRate(dataReceived.rate)}</strong></div>
    </div>
    <div class="k6-detail-card">
      <h4>Data Sent</h4>
      <div><span>Total</span><strong>${fmtMb(dataSent.count)}</strong></div>
      <div><span>Rate</span><strong>${fmtMbRate(dataSent.rate)}</strong></div>
    </div>
  </div>`;
}

function buildChecksGroups(checks) {
  if (!checks.length) return '<div class="empty">Sin checks funcionales registrados.</div>';

  const byIp = new Map();
  checks.slice(0, 500).forEach((c) => {
    const parts = String(c.path || '')
      .split('::')
      .map((part) => part.trim())
      .filter(Boolean);
    const ipLabel = parts.find((part) => part.toLowerCase().includes('ip de origen')) || 'Sin IP de origen agrupada';
    const groupLabel =
      parts.filter((part) => !part.toLowerCase().includes('ip de origen')).join(' / ') || c.path || 'Grupo';

    if (!byIp.has(ipLabel)) byIp.set(ipLabel, new Map());
    const groups = byIp.get(ipLabel);
    if (!groups.has(groupLabel)) groups.set(groupLabel, []);
    groups.get(groupLabel).push(c);
  });

  return `<div class="k6-checks">
    ${Array.from(byIp.entries())
      .map(
        ([ipLabel, groups], ipIndex) => `<details class="k6-check-ip" ${ipIndex < 2 ? 'open' : ''}>
      <summary>Grupo - ${escapeHtml(ipLabel)}</summary>
      ${Array.from(groups.entries())
        .map(
          ([groupLabel, groupChecks], groupIndex) => `<details class="k6-check-group" ${groupIndex < 3 ? 'open' : ''}>
        <summary>Grupo - ${escapeHtml(groupLabel)}</summary>
        <table>
          <thead><tr><th class="left">Check Name</th><th>Passes</th><th>Failures</th><th>% Pass</th></tr></thead>
          <tbody>${groupChecks
            .map((c) => {
              const total = (c.passes || 0) + (c.fails || 0);
              const passPct = total ? (c.passes / total) * 100 : 0;
              return `<tr>
              <td class="left">${escapeHtml(c.name)}</td>
              <td class="ok-cell">${c.passes || 0}</td>
              <td>${c.fails || 0}</td>
              <td>${fmtFixed(passPct, 2)}</td>
            </tr>`;
            })
            .join('')}</tbody>
        </table>
      </details>`,
        )
        .join('')}
    </details>`,
      )
      .join('')}
  </div>`;
}

function buildK6ReporterPanel(data, testName, mode, endpoints, ips, checks) {
  const reqs = metric(data, 'http_reqs');
  const fail = metric(data, 'http_req_failed');
  const failedChecks = checks.reduce((sum, c) => sum + c.fails, 0);
  const thresholds = data.metrics
    ? Object.values(data.metrics)
        .filter((m) => m.thresholds)
        .flatMap((m) => m.thresholds || [])
    : [];
  const breached = thresholds.filter((t) => t.ok === false).length;
  const failedReqs = Math.round((reqs.count || 0) * (fail.rate ?? fail.value ?? 0));

  return `<section class="k6-shell">
    <div class="k6-panel">
      <div class="k6-header">
        ${SUNEDU_LOGO_B64 ? `<span class="k6-logo"><img src="${SUNEDU_LOGO_B64}" alt="SUNEDU"></span>` : '<span class="k6-mark">SUNEDU</span>'}
        <span>REGINSA ${escapeHtml(testName)}</span>
      </div>
      <div class="k6-body">
        <div class="k6-cards">
          <div class="k6-card purple"><div>Total Requests</div><strong>${reqs.count || 0}</strong><span class="k6-card-icon">&#9711;</span></div>
          <div class="k6-card green"><div>Failed Requests</div><strong>${failedReqs}</strong><span class="k6-card-icon">&#10003;</span></div>
          <div class="k6-card green"><div>Breached Thresholds</div><strong>${breached}</strong><span class="k6-card-icon">&#9888;</span></div>
          <div class="k6-card green"><div>Failed Checks</div><strong>${failedChecks}</strong><span class="k6-card-icon">&#9673;</span></div>
        </div>

        <div class="k6-tabs">
          <input id="k6-tab-metrics" name="k6-tabs" type="radio" checked>
          <input id="k6-tab-run" name="k6-tabs" type="radio">
          <input id="k6-tab-checks" name="k6-tabs" type="radio">

          <label class="k6-tab-label tab-label-metrics" for="k6-tab-metrics">Detailed Metrics</label>
          <label class="k6-tab-label tab-label-run" for="k6-tab-run">Test Run Details</label>
          <label class="k6-tab-label tab-label-checks" for="k6-tab-checks">Checks &amp; Groups</label>

          <div class="k6-tab-content content-metrics">
            ${buildTrendRows(data)}
            ${buildRateCounterRows(data)}
          </div>

          <div class="k6-tab-content content-run">
            ${buildRunDetailCards(data, checks)}
            <div class="k6-subtable">${buildRunDetails(data, testName, mode, endpoints, ips)}</div>
            <h4>Desglose por IP de Origen</h4>
            ${buildIpTable(ips)}
          </div>

          <div class="k6-tab-content content-checks">
            ${buildChecksGroups(checks)}
          </div>
        </div>
        <footer>K6 Reporter local - REGINSA</footer>
      </div>
    </div>
  </section>`;
}

function buildHtml(testName, opts, data) {
  const endpointDefs = opts.endpoints || DEFAULT_ENDPOINTS;
  const endpoints = endpointSummaries(data, endpointDefs);
  const checks = allChecks(data);
  const ips = activeIps(data, opts.localIps);
  const mode = executionMode(testName, opts, ips, endpoints);
  const sourceIp = detectedSourceIp(opts, ips);
  const ts = limaDate();
  const title =
    endpoints.length === 1
      ? `REGINSA - Servicio ${endpoints[0].title}`
      : 'REGINSA - Registro de Infracciones y Sanciones';

  const scenario = scenarioName(testName);
  const isAudit = true;

  const dur = metric(data, 'http_req_duration');
  const checksMetric = metric(data, 'checks');
  const apdexMetric = metric(data, 'apdex_score');

  const globalP95 = dur ? num(dur['p(95)'], 0) : 0;
  const globalErrorRate = effectiveErrorRate(data);
  const globalChecksRate = checksMetric ? num(checksMetric.rate ?? checksMetric.value, 0) : 0;
  const globalApdex = apdexMetric ? num(apdexMetric.avg ?? apdexMetric.value, 0) : 0;

  const errorsList = [];
  const globalErrorsMap = {};
  let globalNetworkErrors = 0;
  
  checks.forEach((c) => {
    const match = c.name.match(/\[HTTP (\d+)\]/);
    if (match) {
      const code = parseInt(match[1], 10);
      if (code === 0) {
        globalNetworkErrors += c.fails;
      } else if (code !== 200) {
        globalErrorsMap[code] = (globalErrorsMap[code] || 0) + c.fails;
      }
    } else {
      if (c.fails > 0) {
        globalNetworkErrors += c.fails;
      }
    }
  });

  Object.entries(globalErrorsMap).forEach(([codeStr, count]) => {
    const code = parseInt(codeStr, 10);
    if (count > 0) {
      errorsList.push({ code, count, label: `HTTP ${code}`, isNetwork: false });
    }
  });
  if (globalNetworkErrors > 0) {
    errorsList.push({ code: 'NET', count: globalNetworkErrors, label: '⚡ Sin resp. HTTP (Red/Timeout)', isNetwork: true });
  }

  // Sort errorsList (with NET last, and other HTTP codes sorted ascending)
  errorsList.sort((a, b) => {
    if (a.isNetwork && !b.isNetwork) return 1;
    if (!a.isNetwork && b.isNetwork) return -1;
    return a.code - b.code;
  });

  const durationMs = data.state && data.state.testRunDurationMs ? data.state.testRunDurationMs : 0;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>REGINSA ${escapeHtml(testName)}</title>
  <link rel="icon" href="${faviconHref()}">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; background: #eef0fb; color: #172033; font-size: 12px; }
    .page { padding: 16px; border-top: 3px solid #283593; }
    .hero { background: linear-gradient(135deg,#1a237e,#3949ab); color: #fff; border-radius: 10px; padding: 14px 20px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .brand { display: flex; align-items: center; gap: 16px; min-width: 0; }
    .logo-box { background: #fff; border-radius: 8px; padding: 6px 10px; display: flex; align-items: center; }
    .logo-box img { height: 48px; width: auto; display: block; }
    .title { font-size: 15px; font-weight: 700; }
    .sub { font-size: 11px; opacity: .88; margin-top: 3px; }
    .std { text-align: right; font-size: 10px; opacity: .82; line-height: 1.35; white-space: nowrap; }
    .section { background: #fff; border-radius: 8px; border: 1px solid #c5cae9; overflow: hidden; margin-bottom: 14px; }
    .section-title, summary { background: #283593; color: #fff; padding: 9px 16px; font-weight: 700; font-size: 13px; cursor: default; }
    summary { list-style: none; cursor: pointer; position: relative; padding-left: 34px; }
    summary::before { content: "▾"; position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 12px; line-height: 1; }
    details:not([open]) > summary::before { content: "▸"; }
    summary::-webkit-details-marker { display: none; }
    .section-body { padding: 12px 16px; }
    .note { padding: 10px 16px; color: #455; line-height: 1.5; }
    .http-grid { display: flex; flex-wrap: wrap; gap: 14px; padding: 14px; }
    .http-card { flex: 1; min-width: 260px; border: 1px solid #66bb6a; border-radius: 8px; overflow: hidden; background: #f9fbe7; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    .http-card-title { background: #4527a0; color: #fff; padding: 10px 16px; font-size: .82rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; background: #fff; font-size: 11px; }
    th { background: #1a237e; color: #fff; padding: 9px 12px; border: 1px solid #283593; text-align: center; white-space: nowrap; }
    td { padding: 8px 12px; border: 1px solid #e4e7f4; text-align: center; }
    .compact td { padding: 8px 12px; font-size: .82rem; }
    .compact td:first-child { text-align: left; font-weight: 600; }
    .compact td:last-child { text-align: right; font-weight: 700; }
    .ok-row { background: #e8f5e9; color: #1b5e20; }
    .left { text-align: left; }
    .strong { font-weight: 700; }
    .mono { font-family: Consolas, "Courier New", monospace; }
    .slo-head, .slo-cell { background: #d1d9ff !important; color: #1a237e !important; font-weight: 700; }
    .master th, .master td { font-size: 10px; padding: 5px 6px; }
    .ip-row-toggle { display: inline-flex; align-items: center; gap: 7px; border: 0; background: transparent; color: #0d1b6f; font: inherit; font-weight: 800; padding: 0; cursor: pointer; }
    .ip-row-toggle:hover .mono { text-decoration: underline; }
    .toggle-caret { display: inline-flex; align-items: center; justify-content: center; width: 12px; color: #283593; font-size: 11px; line-height: 1; }
    .ip-row-toggle[aria-expanded="true"] .toggle-caret { transform: rotate(90deg); }
    .ip-detail-row > td { border-left: 4px solid #3949ab; }
    .ip-detail-panel { padding: 10px 12px 12px; background: #fbfcff; }
    .dot { color: #2e7d32; font-size: 16px; }
    .empty { padding: 14px; color: #666; background: #fafafa; }
    .url { margin-top: 4px; font-family: Consolas, "Courier New", monospace; font-size: 11px; color: #1a237e; }
    .recommendation summary { background: #f9a825; color: #3b2600; }
    .recommendation { border-color: #f9a825; background: #fff8e1; }
    .recommendation table tr:nth-child(odd) td { background: #fff3d7; }
    .k6-shell { margin: 14px -16px 0; padding: 22px 0 28px; background: linear-gradient(135deg,#6b6bd6,#7a4ab0); }
    .k6-panel { max-width: 1400px; width: calc(100% - 48px); margin: 0 auto; border-radius: 10px; overflow: hidden; background: #fff; box-shadow: 0 12px 36px rgba(45, 21, 100, .28); }
    .k6-header { background: linear-gradient(135deg,#7c3aed,#5b21b6); color: white; padding: 18px 28px; font-size: 24px; font-weight: 800; display: flex; align-items: center; gap: 12px; }
    .k6-mark { display: inline-flex; align-items: center; justify-content: center; min-width: 56px; height: 30px; background: white; color: #5b21b6; font-weight: 900; border-radius: 4px; font-size: 10px; padding: 0 8px; }
    .k6-logo { display: inline-flex; align-items: center; justify-content: center; height: 38px; min-width: 78px; background: #fff; border-radius: 6px; padding: 4px 8px; }
    .k6-logo img { height: 30px; width: auto; display: block; }
    .k6-body { padding: 22px; }
    .k6-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 22px; margin-bottom: 24px; }
    .k6-card { position: relative; border-radius: 8px; padding: 22px; color: white; min-height: 110px; box-shadow: 0 6px 14px rgba(0,0,0,.18); text-transform: uppercase; font-weight: 700; overflow: hidden; }
    .k6-card div { opacity: .92; font-size: 12px; }
    .k6-card strong { display: block; margin-top: 10px; font-size: 34px; line-height: 1; }
    .k6-card-icon { position: absolute; right: 22px; top: 24px; opacity: .16; font-size: 56px; line-height: 1; }
    .k6-card.purple { background: linear-gradient(135deg,#6b6bd6,#6d4bb4); }
    .k6-card.green { background: linear-gradient(135deg,#5cc98a,#48bb78); }
    .k6-tabs { position: relative; }
    .k6-tabs > input { position: absolute; opacity: 0; pointer-events: none; }
    .k6-tab-label { display: inline-flex; align-items: center; justify-content: center; min-width: 180px; min-height: 48px; padding: 12px 18px; background: #f8f9ff; color: #67738f; border: 1px solid transparent; border-radius: 8px 8px 0 0; font-weight: 700; font-size: 13px; cursor: pointer; margin-right: 4px; }
    #k6-tab-metrics:checked ~ .tab-label-metrics,
    #k6-tab-run:checked ~ .tab-label-run,
    #k6-tab-checks:checked ~ .tab-label-checks { color: #7c3aed; background: #fff; border-color: #dfe3f5; border-bottom-color: #fff; }
    .k6-tab-content { display: none; border: 1px solid #dfe3f5; border-radius: 0 8px 8px 8px; margin-top: -1px; padding: 20px 22px; overflow-x: auto; min-height: 280px; }
    #k6-tab-metrics:checked ~ .content-metrics,
    #k6-tab-run:checked ~ .content-run,
    #k6-tab-checks:checked ~ .content-checks { display: block; }
    .k6-tab-content h4 { margin: 12px 0 10px; color: #31406f; font-size: 13px; }
    .k6-tab-content table { margin: 0 0 18px; }
    .k6-tab-content th { background: linear-gradient(90deg,#6574df,#7047a8); font-size: 10px; }
    .k6-detail-grid { display: grid; grid-template-columns: repeat(4, minmax(180px, 1fr)); gap: 18px; margin-bottom: 22px; }
    .k6-detail-card { background: linear-gradient(135deg,#6874df,#7047a8); color: #fff; border-radius: 8px; min-height: 132px; padding: 18px 22px; box-shadow: 0 6px 14px rgba(0,0,0,.18); }
    .k6-detail-card h4 { margin: 0 0 14px; color: #fff; text-transform: uppercase; letter-spacing: .04em; }
    .k6-detail-card div { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 10px; }
    .k6-detail-card span { font-size: 12px; opacity: .9; }
    .k6-detail-card strong { font-size: 24px; line-height: 1; }
    .k6-subtable { margin-bottom: 12px; }
    .k6-check-ip { margin-bottom: 12px; border: 1px solid #dfe3f5; border-radius: 8px; overflow: hidden; background: #fff; }
    .k6-check-ip > summary { background: #f6f7ff; color: #1a237e; font-size: 11px; border-left: 4px solid #283593; }
    .k6-check-ip > summary::before { left: 14px; }
    .k6-check-group { margin: 10px 14px 12px; border: 1px solid #e6e9f7; border-radius: 8px; overflow: hidden; background: #fff; }
    .k6-check-group summary { background: #fbfcff; color: #1a237e; padding: 10px 14px 10px 34px; font-size: 11px; border-left: 4px solid #3949ab; }
    .k6-check-group summary::before { left: 14px; }
    .k6-check-group table { margin: 0; }
    .ok-cell { background: #59c98a; color: #fff; font-weight: 700; }
    footer { text-align: center; padding: 14px; color: #718096; font-size: 11px; border-top: 1px solid #e2e8f0; background: #f7fafc; }
    .badge-summary { float: right; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; text-transform: uppercase; margin-top: 2px; }
    .badge-summary.pass { background: #2e7d32; color: #fff; }
    .badge-summary.fail { background: #f57c00; color: #fff; }
    .pill-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 10px; text-align: center; }
    .pill-badge.pass { background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; }
    .pill-badge.fail { background: #ffebee; color: #c62828; border: 1px solid #ffcdd2; }
    .sub-card { border: 1px solid #e0e0e0; border-radius: 6px; background: #fafafa; padding: 12px; margin-bottom: 14px; }
    .sub-card-title { font-weight: bold; color: #1a237e; margin-bottom: 10px; font-size: 11px; border-bottom: 1px solid #e0e0e0; padding-bottom: 6px; }
    @media (max-width: 900px) {
      .k6-cards, .k6-detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .k6-tab-label { min-width: 0; width: 100%; margin-right: 0; border-radius: 8px; margin-bottom: 4px; }
      .k6-tab-content { border-radius: 8px; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="hero">
      <div class="brand">
        ${SUNEDU_LOGO_B64 ? `<div class="logo-box"><img src="${SUNEDU_LOGO_B64}" alt="SUNEDU"></div>` : ''}
        <div>
          <div class="title">${escapeHtml(title)}</div>
          <div class="sub">Informe de Pruebas de Rendimiento</div>
          <div class="sub">Prueba: <strong>${escapeHtml(testName)}</strong> &nbsp;|&nbsp; ${escapeHtml(ts)} (Lima) &nbsp;|&nbsp; Modo: <strong>${escapeHtml(mode.mode)}</strong></div>
        </div>
      </div>
      <div class="std">ISTQB PT · ISO/IEC 25010<br>ISO/IEC 25023 · Google SRE<br><span>SUNEDU - Área de Aseguramiento<br>de Calidad de Software</span></div>
    </header>

    <section class="section">
      <div class="section-title">Modo de Ejecución: ${escapeHtml(mode.title)}</div>
      <div class="section-body">
        ${escapeHtml(mode.description)}<br>
        IP de origen detectada: <strong class="mono" style="color:#1a237e">${escapeHtml(sourceIp)}</strong>
        ${buildEndpointUrlList(endpoints)}
        <span style="font-size:11px;color:#555;margin-top:8px;display:block">${escapeHtml(mode.hint)}</span>
      </div>
    </section>

    <section class="section" id="section-graphics" style="display:none;">
      <div class="section-title">📊 Visualización y Análisis Gráfico del Comportamiento (Chart.js)</div>
      <div class="section-body" style="display: flex; flex-wrap: wrap; gap: 20px; justify-content: space-around;">
        <div style="flex: 1; min-width: 300px; max-width: 600px; background: #fff; padding: 10px; border-radius: 6px; border: 1px solid #dfe3f5;">
          <h4 style="text-align: center; color: #1a237e; margin: 5px 0 15px;">Tiempos de Respuesta (p95 y p99) por Nodo</h4>
          <canvas id="chart-latencias" style="max-height: 280px;"></canvas>
          ${buildLatencyGraphInsights(ips)}
        </div>
        <div style="flex: 1; min-width: 300px; max-width: 600px; background: #fff; padding: 10px; border-radius: 6px; border: 1px solid #dfe3f5;">
          <h4 style="text-align: center; color: #1a237e; margin: 5px 0 15px;">Distribución y Balanceo de Peticiones</h4>
          <canvas id="chart-balanceo" style="max-height: 280px;"></canvas>
        </div>
        <div style="flex: 1 1 100%; min-width: 300px; background: #fff; padding: 10px; border-radius: 6px; border: 1px solid #dfe3f5;">
          <h4 style="text-align: center; color: #1a237e; margin: 5px 0 15px;">Muestra Total por Endpoint</h4>
          <canvas id="chart-endpoints" style="max-height: 300px;"></canvas>
        </div>
      </div>
    </section>

    ${isAudit ? buildAuditMatrix(ips, durationStr, data, endpoints, checks) : ''}
    ${isAudit ? buildAuditRecommendations(globalP95, globalErrorRate, globalChecksRate, globalApdex, SLO, testName, data) : ''}
    ${buildGlobalStatusBlock(data, checks)}
    ${buildFunctionalCaseSummary(data, endpoints)}
    ${buildGlobalEndpointSreSection(data, endpoints)}
    <section class="section">
      <div class="section-title">Muestra Total Consolidada por Endpoint - Respuestas HTTP / Reglas de Negocio</div>
      <div class="http-grid">${buildBusinessDistribution(data, endpoints, checks)}</div>
    </section>

    ${buildErrorAnalysis(data, checks)}
    ${isAudit ? buildGranularAnalysis(ips, endpoints, checks, data, SLO) : ''}

    <section class="section">
      <div class="section-title">Dashboard por Endpoint - ${endpoints.length || 0} Endpoint(s)<span style="font-size:.8rem;font-weight:400;color:#c5cae9;margin-left:10px">SLO: p95 &lt; ${SLO.p95}ms · Google SRE · ISO/IEC 25023</span></div>
      <div style="overflow-x:auto">${buildEndpointDashboard(endpoints)}</div>
    </section>

    <section class="section">
      <div class="section-title">Dashboard Maestro de Resultados - KPIs Globales (Auditoría SUNEDU)</div>
      <div style="overflow-x:auto">${buildMasterDashboard(data)}</div>
    </section>

    ${buildLegend()}
    ${buildRecommendation()}

    ${buildK6ReporterPanel(data, testName, mode, endpoints, ips, checks)}
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    function toggleIpDetail(rowId, button) {
      const row = document.getElementById(rowId);
      if (!row) return;
      const willOpen = row.style.display === 'none' || row.style.display === '';
      row.style.display = willOpen ? 'table-row' : 'none';
      if (button) button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    }

    document.addEventListener("DOMContentLoaded", function() {
      const ipsData = ${JSON.stringify(ips)};
      if (ipsData && ipsData.length > 0) {
        document.getElementById('section-graphics').style.display = 'block';
        
        // 1. Gráfico de Latencias
        const ctxLat = document.getElementById('chart-latencias').getContext('2d');
        new Chart(ctxLat, {
          type: 'line',
          data: {
            labels: ipsData.map((_, i) => 'Nodo ' + (i + 1)),
            datasets: [
              {
                label: 'Percentil 95 (ms)',
                data: ipsData.map(d => Math.round(d.p95 || 0)),
                borderColor: '#3949ab',
                backgroundColor: 'rgba(57, 73, 171, 0.1)',
                borderWidth: 2,
                tension: 0.2,
                fill: true
              },
              {
                label: 'Percentil 99 (ms) [Cola]',
                data: ipsData.map(d => Math.round(d.p99 || 0)),
                borderColor: '#b71c1c',
                backgroundColor: 'rgba(183, 28, 28, 0.05)',
                borderWidth: 2,
                tension: 0.2,
                fill: true
              },
              {
                label: 'SLO p95 < ${SLO.p95}ms',
                data: ipsData.map(() => ${SLO.p95}),
                borderColor: '#2e7d32',
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderDash: [6, 4],
                pointRadius: 0,
                tension: 0,
                fill: false
              },
              {
                label: 'SLO p99 < ${SLO.p99}ms',
                data: ipsData.map(() => ${SLO.p99}),
                borderColor: '#ef6c00',
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderDash: [3, 4],
                pointRadius: 0,
                tension: 0,
                fill: false
              }
            ]
          },
          options: {
            responsive: true,
            plugins: {
              legend: { position: 'bottom' },
              tooltip: {
                callbacks: {
                  title: function(items) {
                    const index = items && items.length ? items[0].dataIndex : 0;
                    const ip = ipsData[index] || {};
                    return 'Nodo ' + (index + 1) + (ip.ip ? ' · ' + ip.ip : '');
                  },
                  label: function(ctx) {
                    const label = ctx.dataset.label || '';
                    const value = Number(ctx.parsed.y || 0);
                    const isP95 = label.indexOf('Percentil 95') >= 0;
                    const isP99 = label.indexOf('Percentil 99') >= 0;
                    const slo = isP95 ? ${SLO.p95} : (isP99 ? ${SLO.p99} : null);
                    if (!slo) return label + ': ' + Math.round(value) + 'ms';
                    const diff = value - slo;
                    const state = diff >= 0 ? 'excede SLO por ' + Math.round(diff) + 'ms' : 'dentro de SLO por ' + Math.round(Math.abs(diff)) + 'ms';
                    return label + ': ' + Math.round(value) + 'ms · ' + state;
                  }
                }
              }
            },
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Milisegundos' } } }
          }
        });

        // 2. Gráfico de Balanceo y Peticiones (Stacked)
        const ctxBal = document.getElementById('chart-balanceo').getContext('2d');
        const ipResData = ${JSON.stringify(ips.map(ip => {
          const counts = getIpResponseCounts(data, checks, ip.ip, endpoints);
          return {
            ip: ip.ip,
            reqs: ip.reqs,
            success: counts.success,
            business: counts.business,
            gateway429: counts.gateway429,
            unexpected: counts.unexpected,
            endpoints: endpoints.map(ep => {
              const epCounts = endpointOutcomeCounts(data, ep, { source_ip: ip.ip });
              return {
                label: ep.label,
                success: epCounts.success,
                business: epCounts.business,
                gateway429: epCounts.gateway429,
                unexpected: epCounts.unexpected + epCounts.network
              };
            })
          };
        }))};

        new Chart(ctxBal, {
          type: 'bar',
          data: {
            labels: ipResData.map((_, i) => 'Nodo ' + (i + 1)),
            datasets: [
              {
                label: 'HTTP 200 - Éxito',
                data: ipResData.map(d => d.success),
                backgroundColor: '#43a047',
              },
              {
                label: 'HTTP 200 - Límite Negocio',
                data: ipResData.map(d => d.business),
                backgroundColor: '#fb8c00',
              },
              {
                label: 'HTTP 429 - Rate Limit',
                data: ipResData.map(d => d.gateway429),
                backgroundColor: '#1e88e5',
              },
              {
                label: 'HTTP 4xx/5xx - Error',
                data: ipResData.map(d => d.unexpected),
                backgroundColor: '#e53935',
              }
            ]
          },
          options: {
            responsive: true,
            plugins: {
              legend: {
                position: 'bottom',
                labels: { boxWidth: 12, font: { size: 10 } }
              },
              tooltip: {
                callbacks: {
                  title: function(items) {
                    const idx = items && items.length ? items[0].dataIndex : 0;
                    const node = ipResData[idx] || {};
                    return ['Nodo ' + (idx + 1), 'IP: ' + (node.ip || '-')];
                  },
                  label: function(ctx) {
                    return ctx.dataset.label + ': ' + ctx.parsed.y;
                  },
                  afterLabel: function(ctx) {
                    const node = ipResData[ctx.dataIndex] || {};
                    const keys = ['success', 'business', 'gateway429', 'unexpected'];
                    const key = keys[ctx.datasetIndex];
                    const rows = (node.endpoints || [])
                      .filter(ep => (ep[key] || 0) > 0)
                      .map(ep => '  ' + ep.label + ': ' + ep[key]);
                    return rows.length ? ['Desglose por endpoint:', ...rows] : ['Sin ocurrencias por endpoint'];
                  },
                  footer: function(items) {
                    const idx = items && items.length ? items[0].dataIndex : 0;
                    const node = ipResData[idx] || {};
                    return 'Total del nodo: ' + (node.reqs || 0) + ' requests';
                  }
                }
              }
            },
            scales: {
              x: { stacked: true },
              y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Cantidad de Requests' } }
            }
          }
        });

        // 3. Gráfico consolidado por endpoint (muestra total sin separar IPs)
        const endpointResData = ${JSON.stringify(endpoints.map(ep => {
          const counts = endpointOutcomeCounts(data, ep);
          return {
            endpoint: ep.label,
            success: counts.success,
            business: counts.business,
            gateway429: counts.gateway429,
            unexpected: counts.unexpected + counts.network
          };
        }))};
        const endpointCanvas = document.getElementById('chart-endpoints');
        if (endpointCanvas && endpointResData.length > 0) {
          const ctxEndpoints = endpointCanvas.getContext('2d');
          new Chart(ctxEndpoints, {
            type: 'bar',
            data: {
              labels: endpointResData.map(d => d.endpoint),
              datasets: [
                {
                  label: 'HTTP 2xx - Aceptadas',
                  data: endpointResData.map(d => d.success),
                  backgroundColor: '#43a047',
                },
                {
                  label: 'Regla negocio / 4xx controlado',
                  data: endpointResData.map(d => d.business),
                  backgroundColor: '#fb8c00',
                },
                {
                  label: 'HTTP 429 - Rate Limit',
                  data: endpointResData.map(d => d.gateway429),
                  backgroundColor: '#1e88e5',
                },
                {
                  label: 'HTTP 4xx/5xx/Red - Error',
                  data: endpointResData.map(d => d.unexpected),
                  backgroundColor: '#e53935',
                }
              ]
            },
            options: {
              responsive: true,
              plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } }
              },
              scales: {
                x: { stacked: true, ticks: { maxRotation: 20, minRotation: 0 } },
                y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Cantidad de Requests' } }
              }
            }
          });
        }

        // 4. Gráfico de Errores (Doughnut)
        const canvasErrores = document.getElementById('chart-errores');
        if (canvasErrores) {
          const errData = ${JSON.stringify(errorsList)};
          if (errData && errData.length > 0) {
            const ctxErr = canvasErrores.getContext('2d');
            const errorColors = {
              400: '#ef5350',
              401: '#ab47bc',
              403: '#7e57c2',
              404: '#26a69a',
              429: '#ff7043',
              500: '#d32f2f',
              502: '#e91e63',
              503: '#f57c00',
              504: '#7b1fa2',
              NET: '#6a1b9a'
            };
            const bgColors = errData.map(d => errorColors[d.code] || '#78909c');
            const chartLabels = errData.map(d => d.label || (d.isNetwork ? '⚡ Sin resp. HTTP (Red/Timeout)' : 'HTTP ' + d.code));
            new Chart(ctxErr, {
              type: 'doughnut',
              data: {
                labels: chartLabels,
                datasets: [{
                  data: errData.map(d => d.count),
                  backgroundColor: bgColors,
                  borderWidth: 2,
                  borderColor: '#fff'
                }]
              },
              options: {
                responsive: true,
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: { boxWidth: 14, font: { size: 11 }, padding: 10 }
                  },
                  tooltip: {
                    callbacks: {
                      label: function(ctx) {
                        const val = ctx.parsed;
                        const total = ctx.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                        const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                        return ' ' + ctx.label + ': ' + val + ' (' + pct + '%)';
                      }
                    }
                  }
                },
                cutout: '55%'
              }
            });
          }
        }
      }
    });
  </script>
</body>
</html>`;
}

function buildEndpointCSV(data, endpointDefs = DEFAULT_ENDPOINTS) {
  const rows = [['endpoint', 'requests', 'p50_ms', 'p90_ms', 'p95_ms', 'p99_ms', 'max_ms', 'avg_ms', 'error_rate_pct']];
  endpointSummaries(data, endpointDefs).forEach((ep) => {
    rows.push([
      ep.tag,
      ep.reqs,
      Math.round(ep.p50 || 0),
      Math.round(ep.p90 || 0),
      Math.round(ep.p95 || 0),
      Math.round(ep.p99 || 0),
      Math.round(ep.max || 0),
      Math.round(ep.avg || 0),
      ((ep.errorRate || 0) * 100).toFixed(2),
    ]);
  });
  return rows.map((r) => r.join(',')).join('\n');
}

function buildStdout(testName, data) {
  const dur = metric(data, 'http_req_duration');
  const checks = metric(data, 'checks');
  const reqs = metric(data, 'http_reqs');
  const errorRate = effectiveErrorRate(data);
  const audit = recordsAudit(data);
  const lines = [
    '',
    '============================================================',
    `REGINSA ${testName}`,
    '============================================================',
    `Requests : ${reqs.count || 0}`,
    `RPS      : ${reqs.rate ? reqs.rate.toFixed(2) : '-'}`,
    `p50      : ${fmtMs(dur.med)}`,
    `p95      : ${fmtMs(dur['p(95)'])}`,
    `p99      : ${fmtMs(dur['p(99)'])}`,
    `Errores  : ${fmtPct(errorRate)}`,
    `Checks   : ${fmtPct(checks.rate ?? checks.value ?? 0)}`,
    `Registros: ${audit.created}/${audit.expected}${audit.match ? '' : ` (faltan ${audit.missing})`}`,
    '============================================================',
    '',
  ];
  return lines.join('\n');
}

export function buildHandleSummary(testName, opts = {}) {
  return function handleSummary(data) {
    const ts = limaTimestampForFile();
    return {
      [`reports/${testName}-${ts}.html`]: buildHtml(testName, opts, data),
      [`reports/${testName}-${ts}.json`]: JSON.stringify(data),
      [`reports/${testName}-${ts}.csv`]: buildEndpointCSV(data, opts.endpoints || DEFAULT_ENDPOINTS),
      stdout: buildStdout(testName, data),
    };
  };
}
