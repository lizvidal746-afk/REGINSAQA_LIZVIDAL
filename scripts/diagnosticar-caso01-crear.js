const fs = require('node:fs');
const path = require('node:path');

const baseUrl = String(process.env.BASE_URL || process.env.REGINSA_API_BASE || '').trim().replace(/\/+$/, '');
const endpoint = String(process.env.K6_CASO01_CREAR || '/Entidad/Crear').trim();
const authHeader = String(process.env.K6_AUTH_HEADER || '').trim();
const datasetPath = path.resolve(process.cwd(), 'reportes', 'k6-caso01-dataset.json');

function readDatasetRow() {
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`No existe dataset: ${datasetPath}. Ejecuta pool:k6:dataset:fresh primero.`);
  }
  const raw = fs.readFileSync(datasetPath, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Dataset vacío.');
  }
  return data[0];
}

function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };

  if (authHeader) {
    headers.Authorization = authHeader.startsWith('Bearer ') ? authHeader : `Bearer ${authHeader}`;
  }

  return headers;
}

function extractResult(body, status) {
  return {
    status,
    bSuccess: body && Object.prototype.hasOwnProperty.call(body, 'bSuccess') ? Boolean(body.bSuccess) : null,
    sMessage: body && typeof body === 'object' ? (body.sMessage || body.message || '') : '',
    raw: body
  };
}

async function postVariant(url, headers, label, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return {
    label,
    payload,
    ...extractResult(json, response.status)
  };
}

async function main() {
  if (!baseUrl) throw new Error('Falta BASE_URL o REGINSA_API_BASE.');
  if (!authHeader) throw new Error('Falta K6_AUTH_HEADER para diagnosticar.');

  const row = readDatasetRow();
  const ruc = String(row.ruc || '').trim();
  const razonSocial = String(row.razonSocial || '').trim();
  const nombreComercial = String(row.nombreComercial || row.razonSocial || '').trim();
  const estadoNum = Number.isFinite(Number(row.estado)) ? Number(row.estado) : 1;

  const variants = [
    {
      label: 'camel + estado número',
      payload: { ruc, razonSocial, nombreComercial, estado: estadoNum }
    },
    {
      label: 'Pascal + estado número',
      payload: { Ruc: ruc, RazonSocial: razonSocial, NombreComercial: nombreComercial, Estado: estadoNum }
    },
    {
      label: 'camel + idEstado número',
      payload: { ruc, razonSocial, nombreComercial, idEstado: estadoNum }
    },
    {
      label: 'Pascal + IdEstado número',
      payload: { Ruc: ruc, RazonSocial: razonSocial, NombreComercial: nombreComercial, IdEstado: estadoNum }
    },
    {
      label: 'camel + estado texto',
      payload: { ruc, razonSocial, nombreComercial, estado: 'ACTIVO' }
    },
    {
      label: 'Pascal + Estado texto',
      payload: { Ruc: ruc, RazonSocial: razonSocial, NombreComercial: nombreComercial, Estado: 'ACTIVO' }
    },
    {
      label: 'Pascal + bitActivo + IdEstado',
      payload: { Ruc: ruc, RazonSocial: razonSocial, NombreComercial: nombreComercial, IdEstado: estadoNum, BitActivo: true }
    }
  ];

  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const headers = buildHeaders();

  console.log(`[diag] Endpoint: ${url}`);
  console.log(`[diag] RUC test: ${ruc}`);
  console.log(`[diag] Razón social test: ${razonSocial}`);

  const results = [];
  for (const variant of variants) {
    const result = await postVariant(url, headers, variant.label, variant.payload);
    results.push(result);
    console.log(`\n[${variant.label}] status=${result.status} bSuccess=${String(result.bSuccess)} msg=${result.sMessage || '(sin mensaje)'}`);
  }

  const success = results.find((item) => (item.status === 200 || item.status === 201) && item.bSuccess === true);
  if (success) {
    console.log(`\n✅ Variante válida encontrada: ${success.label}`);
  } else {
    console.log('\n❌ Ninguna variante devolvió bSuccess=true. Revisar permisos de token o reglas de backend.');
  }
}

main().catch((error) => {
  console.error(`[diag] ${error.message}`);
  process.exit(1);
});
