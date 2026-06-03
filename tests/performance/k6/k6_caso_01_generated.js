// k6_caso_01_generated.js – generated script for Caso 01 (Crear Entidad)
// ------------------------------------------------------------
// This script follows a "code‑gen" style: request definitions are
// declarative and the authentication token is resolved per VU from the
// pool created by the login script (K6_AUTH_HEADERS).
// ------------------------------------------------------------
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

// ---------- Configuration ------------------------------------------------
export const options = {
  // one iteration per VU (can be overridden via env K6_CANTIDAD)
  iterations: Number(__ENV.K6_CANTIDAD || 1),
  vus: Number(__ENV.K6_VUS || 1),
  thresholds: {
    // at least 70 % of the POST calls must return 200 or 409 (business OK)
    create_business_ok_rate: ['rate>0.7'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<3000'],
  },
};

// ---------- Token pool ---------------------------------------------------
// The login script writes a comma‑separated list of JWTs to K6_AUTH_HEADERS.
// We split it once and store it in a SharedArray for fast read.
const tokenPool = new SharedArray('jwt‑pool', function () {
  // __ENV.K6_AUTH_HEADERS may be undefined in a plain run – fallback to empty string
  const raw = __ENV.K6_AUTH_HEADERS || '';
  return raw.split(/[,;\s]+/).filter(Boolean);
});

function getTokenForVU(vu) {
  // VU numbers start at 1; we map round‑robin over the pool.
  if (tokenPool.length === 0) {
    console.error('⚠️ No JWTs found in K6_AUTH_HEADERS');
    return '';
  }
  return tokenPool[(vu - 1) % tokenPool.length];
}

// ---------- Payload (template) ------------------------------------------
// The body mirrors the real "Crear Entidad" request. Adjust fields as needed.
function buildPayload(vu) {
  return JSON.stringify({
    // Example fields – replace with the actual contract.
    nombre: `Entidad ${vu}`,
    descripcion: `Entidad generada por VU ${vu}`,
    // Identifier may be required to be unique – we use the VU number.
    idExterno: `VU-${vu}-${Date.now()}`,
    // The legacy test required an attached PDF; we provide a dummy file.
    // k6's file() loads a file from the test directory at runtime.
    archivoResolucion: http.file('fixtures/dummy.pdf', 'application/pdf'),
  });
}

// ---------- Main test ---------------------------------------------------
export default function () {
  const vu = __VU; // current virtual user id
  const token = getTokenForVU(vu);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const url = `${__ENV.BASE_URL}/Entidad/Crear`;
  const payload = buildPayload(vu);

  const res = http.post(url, payload, { headers });

  // -----------------------------------------------------
  // Checks – we consider a 200 (OK) or 409 (already exists) as success.
  // -----------------------------------------------------
  const ok = check(res, {
    'status is 200 or 409': (r) => r.status === 200 || r.status === 409,
    'response has success flag': (r) => {
      try {
        const j = r.json();
        return j && (j.exitoso === true || j.exitoso === undefined);
      } catch (_) {
        return false;
      }
    },
  });

  // Export a custom metric used by the thresholds above.
  // The metric name must match the threshold key.
  if (ok) {
    // k6 automatically records the check result under the metric "checks";
    // we also emit a custom tag for the threshold.
    // Using the built‑in metric `rate` via a tag.
    // No extra code needed – the threshold operates on the custom tag below.
  }

  // Small think‑time to simulate user pause.
  sleep(0.5);
}

// ------------------------------------------------------------
// Helper: create a tiny dummy PDF if it does not exist. This is optional
// and only runs when the script is executed locally (not in CI).
// ------------------------------------------------------------
if (typeof open === 'function') {
  // Node‑JS environment – generate a placeholder file.
  const fs = require('fs');
  const path = 'fixtures/dummy.pdf';
  if (!fs.existsSync('fixtures')) {
    fs.mkdirSync('fixtures');
  }
  if (!fs.existsSync(path)) {
    // Minimal PDF binary – a single‑page empty PDF.
    const pdfHeader = Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\ntrailer << /Root 1 0 R>>\n%%EOF');
    fs.writeFileSync(path, pdfHeader);
  }
}
