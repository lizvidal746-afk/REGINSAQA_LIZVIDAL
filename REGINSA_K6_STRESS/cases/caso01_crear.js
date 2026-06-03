// cases/caso01_crear.js
// Caso 01 migrado a la nueva arquitectura modular (Escalable, Auditable)

import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import { getToken } from '../src/api/auth.js';
import { isFunctionalSuccessResponse } from '../src/api/client.js';
import { crearEntidad } from '../src/services/entidad.js';
import { buildOptions, buildSummaryHandler } from '../src/config/k6Options.js';
import { businessValidationHits } from '../lib/metrics.js';

const CASE_NAME = 'caso01_agregar_administrado';
const RUN_SEED = String(__ENV.K6_RUN_SEED || Date.now()).replace(/\D/g, '') || String(Date.now());
const RUN_SEQUENCE = String(__ENV.K6_RUN_SEQUENCE || '0').replace(/\D/g, '');
const RUN_LABEL = String(__ENV.K6_RUN_LABEL || `K6 ${RUN_SEQUENCE.padStart(2, '0')}`).trim();
const DEBUG_BUSINESS_ERRORS = (__ENV.K6_DEBUG_BUSINESS_ERRORS || '1') !== '0';
const DEBUG_BUSINESS_LIMIT = Number.parseInt(__ENV.K6_DEBUG_BUSINESS_MAX || '5', 10) || 5;
const COMPAT_PAYLOAD_MODE = (__ENV.K6_CASO01_COMPAT_PAYLOAD || '1') !== '0';
const ESTADO_TEXTO = String(__ENV.K6_CASO01_ESTADO || 'Licenciada').trim() || 'Licenciada';
const ESTADO_ID = Number.parseInt(__ENV.K6_CASO01_ESTADO_ID || '1', 10) || 1;
let businessDebugCount = 0;

export const options = buildOptions(CASE_NAME);
export const handleSummary = buildSummaryHandler(CASE_NAME);

const DATASET = new SharedArray('reginsa-caso01-administrados', () => {
  try {
    const raw = open('../reports/k6-caso01-dataset.json');
    const rows = JSON.parse(raw || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.warn(`[CASO01][DATASET] No se pudo leer reports/k6-caso01-dataset.json: ${e.message}`);
    return [];
  }
});

function buildValidRuc(firstTenDigits) {
  const cleaned = String(firstTenDigits || '').replace(/\D/g, '').slice(0, 10).padEnd(10, '0');
  const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(cleaned[i]) * factors[i];
  }
  const diff = 11 - (sum % 11);
  const checkDigit = diff === 10 ? 0 : (diff === 11 ? 1 : diff);
  return `${cleaned}${checkDigit}`;
}

function cleanNombreComercial(razonSocial) {
  return String(razonSocial || '')
    .replace(/\bS\.?\s*A\.?\s*C\.?\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildUniqueAdministradoPayload() {
  const seed = Number(RUN_SEED.slice(-8)) || (Date.now() % 100000000);
  const sequence = (seed + ((__VU || 0) * 100000) + (__ITER || 0)) % 100000000;
  const correlativo = String(sequence).padStart(8, '0');
  const ruc = buildValidRuc(`20${correlativo}`);
  const razonSocial = `${RUN_LABEL} EMPRESA QA REGINSA ${ruc}`;

  return {
    ruc,
    razonSocial,
    nombreComercial: cleanNombreComercial(razonSocial),
    estado: ESTADO_TEXTO,
    estadoId: ESTADO_ID,
  };
}

function datasetPayload() {
  const iterationInTest = Number(exec.scenario.iterationInTest || 0);
  const row = DATASET[iterationInTest] || DATASET[((__VU || 1) - 1) * 100000 + (__ITER || 0)] || DATASET[__ITER || 0];
  if (!row) return buildUniqueAdministradoPayload();

  return buildCreatePayload({
    ruc: String(row.ruc || '').trim(),
    razonSocial: String(row.razonSocial || '').trim(),
    estado: String(row.estado || ESTADO_TEXTO).trim() || ESTADO_TEXTO,
    estadoId: Number.parseInt(String(row.estadoId || ESTADO_ID), 10) || ESTADO_ID,
  });
}

function buildCreatePayload(row) {
  const ruc = String(row.ruc || '').trim();
  const razonSocial = String(row.razonSocial || '').trim();
  const nombreComercial = cleanNombreComercial(razonSocial);
  const estado = String(row.estado || ESTADO_TEXTO).trim() || ESTADO_TEXTO;
  const idEstado = Number.parseInt(String(row.estadoId || ESTADO_ID), 10) || ESTADO_ID;

  if (!COMPAT_PAYLOAD_MODE) {
    return { ruc, razonSocial, nombreComercial, estado, idEstado };
  }

  return {
    ruc,
    Ruc: ruc,
    razonSocial,
    RazonSocial: razonSocial,
    nombreComercial,
    NombreComercial: nombreComercial,
    estado,
    Estado: estado,
    idEstado,
    IdEstado: idEstado,
    desEstado: estado,
    DesEstado: estado,
    bitActivo: true,
    BitActivo: true,
  };
}

function safeJsonValue(response, path) {
  try {
    return response && response.json ? response.json(path) : undefined;
  } catch (e) {
    return undefined;
  }
}

function logBusinessFailure(response, payload) {
  if (!DEBUG_BUSINESS_ERRORS || businessDebugCount >= DEBUG_BUSINESS_LIMIT) return;
  if (isFunctionalSuccessResponse(response, true)) return;

  businessDebugCount += 1;
  const message = safeJsonValue(response, 'sMessage') || safeJsonValue(response, 'message') || safeJsonValue(response, 'Message') || '';
  const bSuccess = safeJsonValue(response, 'bSuccess');
  const data = safeJsonValue(response, 'oData');
  const dataText = data === undefined ? '' : JSON.stringify(data);
  const reason = classifyBusinessReason(message, dataText);
  businessValidationHits.add(1, { reason, endpoint: 'entidad_crear' });
  console.warn(
    `[CASO01][VALIDACION] status=${response?.status || 0} bSuccess=${bSuccess} ruc=${payload.ruc} razonSocial="${payload.razonSocial}" msg="${String(message || '').slice(0, 260)}" oData=${dataText.slice(0, 260)}`,
  );
}

function classifyBusinessReason(message, dataText) {
  const text = `${message || ''} ${dataText || ''}`.toLowerCase();
  if (text.includes('ruc')) return 'ruc';
  if (text.includes('razon') || text.includes('razón')) return 'razon_social';
  if (text.includes('nombre')) return 'nombre_comercial';
  if (text.includes('estado') || text.includes('activo')) return 'estado';
  if (text.includes('oblig') || text.includes('requer') || text.includes('required')) return 'campo_obligatorio';
  if (text.includes('token') || text.includes('auth') || text.includes('permiso')) return 'autorizacion';
  if (text.includes('duplic') || text.includes('existe')) return 'duplicado';
  return 'otro';
}

export default function () {
  // 1️⃣ Obtener Token automáticamente
  let token;
  try {
    token = getToken();
  } catch (e) {
    console.error('Login Error:', e.message);
    return;
  }
  check(token, { 'obtain token': (t) => !!t });

  // 2️⃣ Preparar Payload Dinámico (RUC y razón social únicos por corrida/VU/ITER)
  const payload = DATASET.length ? datasetPayload() : buildCreatePayload(buildUniqueAdministradoPayload());

  // 3️⃣ Realizar la petición HTTP usando la arquitectura limpia
  const response = crearEntidad(payload);
  logBusinessFailure(response, payload);

  // 4️⃣ Validaciones (Checks)
  check(response, {
    'POST Entidad/Crear HTTP aceptado (200/201/409)': (r) => r.status === 200 || r.status === 201 || r.status === 409,
    'POST Entidad/Crear creación confirmada (bSuccess + oData)': (r) => isFunctionalSuccessResponse(r, true),
  });

  // Pausa (Think Time)
  sleep(1);
}
