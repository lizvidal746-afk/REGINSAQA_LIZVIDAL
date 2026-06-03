// cases/caso02_registrar_sancion.js
import { check, sleep } from 'k6';
import { getToken } from '../src/api/auth.js';
import { getSourceIp } from '../src/api/client.js';
import { 
  listarInfracciones, 
  crearCabecera, 
  crearMedida, 
  crearDetalle 
} from '../src/services/sancion.js';
import { buildOptions, buildSummaryHandler } from '../src/config/k6Options.js';
import { createdRecordsCounter } from '../lib/metrics.js';

const CASE_NAME = 'caso02_registrar_sancion';
const RUN_LABEL = String(__ENV.K6_RUN_LABEL || 'K6 00').trim();
const RUN_SLUG = String(__ENV.K6_RUN_SLUG || RUN_LABEL.replace(/\s+/g, '-')).trim();

export const options = buildOptions(CASE_NAME);
export const handleSummary = buildSummaryHandler(CASE_NAME);

function safeBody(body) {
  return String(body || '')
    .replace(/Authorization:\s*Bearer\s+[A-Za-z0-9._-]+/gi, 'Authorization: Bearer [REDACTED]')
    .slice(0, 900);
}

// Helper to validate required fields in a payload
function validatePayload(payload, requiredFields, context) {
  const missing = [];
  requiredFields.forEach((field) => {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      missing.push(field);
    }
  });
  if (missing.length) {
    console.error(`⚠️ [${context}] Missing required fields: ${missing.join(', ')}`);
    return false;
  }
  return true;
}

// -------------------------------------------------------
// Catálogo de tipos de sanción válidos según el CHECK
// constraint CK_DETALLE_INFRACCION_DES_SANCION de la BD.
// Rotamos entre iteraciones para mayor cobertura.
// -------------------------------------------------------
const CATALOGO_SANCIONES = [
  { desSancion: 'Multa',              bitCancelacion: 0, canSuspension: 0, tipoMulta: 'SOLES', numMonto: 5000  },
  { desSancion: 'Suspensión',         bitCancelacion: 0, canSuspension: 2, tipoMulta: null,    numMonto: 0     },
  { desSancion: 'Cancelación',        bitCancelacion: 1, canSuspension: 0, tipoMulta: null,    numMonto: 0     },
  { desSancion: 'Multa + Suspensión', bitCancelacion: 0, canSuspension: 3, tipoMulta: 'SOLES', numMonto: 2500  },
  { desSancion: 'Multa + Cancelación',bitCancelacion: 1, canSuspension: 0, tipoMulta: 'SOLES', numMonto: 1500  },
];

export default function () {
  // 1️⃣ Autenticación
  let token;
  try {
    token = getToken();
  } catch (e) {
    console.error('Login Error:', e.message);
    return;
  }
  check(token, { 'obtain token': (t) => !!t });

  const idRis = 1;
  // Rotar idEntidad entre los administrados disponibles para evitar duplicados
  const idEntidad = String((__ITER % 5) + 1 || 3);
  
  // 2️⃣ Listar Infracciones
  const resInfracciones = listarInfracciones(idRis);
  check(resInfracciones, { 'POST Infraccion/Listar (200)': (r) => r.status === 200 });
  
  let infracciones = [];
  try {
    infracciones = resInfracciones.json('oData') || [];
  } catch(e) {}
  
  if (infracciones.length === 0) {
    console.error('No se encontraron infracciones.');
    sleep(1);
    return;
  }
  
  const infraccion = infracciones[__ITER % infracciones.length];
  
  // 3️⃣ Crear Cabecera
  // Usar timestamp + VU + ITER para garantizar unicidad de expediente/resolución
  const ts = Date.now();
  const correlativo = `${String(__VU).padStart(2, '0')}${String(__ITER).padStart(4, '0')}${String(ts % 10000).padStart(4, '0')}`;
  const payloadCabecera = {
    IdEntidad: idEntidad,
    NumeroExpediente: `EXP-${RUN_SLUG}-${correlativo}`,
    NumeroResolucion: `RES-${RUN_SLUG}-${correlativo}`,
    FechaResolucion: '2026-05-13',
    RutaResolucionSancion: 'GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf',
    ArchivoResolucion: ''
  };
  if (!validatePayload(payloadCabecera, ['IdEntidad','NumeroExpediente','NumeroResolucion','FechaResolucion','RutaResolucionSancion'], 'Cabecera')) { sleep(1); return; }
  const resCabecera = crearCabecera(payloadCabecera);
  if (resCabecera.status >= 400) {
    console.error(`Error Cabecera (${resCabecera.status}):`, safeBody(resCabecera.body));
  }
  check(resCabecera, { 'POST Cabecera/Crear (200/201)': (r) => r.status === 200 || r.status === 201 });
  
  // ⚠️ Si la cabecera falló (incluyendo después de retries de 429), abortar la iteración.
  // No tiene sentido crear Medida/Detalle sin un idCabecera válido.
  if (resCabecera.status !== 200 && resCabecera.status !== 201) {
    sleep(1);
    return;
  }

  let idCabecera = null;
  try {
    const oData = resCabecera.json('oData');
    if (typeof oData === 'object' && oData !== null) {
      idCabecera = oData.idCabeceraInfraccionSancion || oData[0]?.idCabeceraInfraccionSancion;
    } else if (typeof oData === 'number') {
      idCabecera = oData;
    } else if (oData) {
      idCabecera = oData; // Fallback: la API puede devolver el ID directamente
    }
  } catch(e) {}

  if (!idCabecera) {
    console.error('idCabeceraInfraccionSancion no encontrado en oData. Body:', resCabecera.body);
    sleep(1);
    return;
  }
  createdRecordsCounter.add(1, {
    operation: 'cabecera',
    endpoint: 'cabecerainfraccionsancion_crear',
    source_ip: getSourceIp(),
  });

  // 4️⃣ Crear Medida Correctiva
  const payloadMedida = {
    idCabeceraInfraccionSancion: idCabecera,
    descripcionMedidaCorrectiva: 'MEDIDA CORRECTIVA 1',
    orden: 1
  };
  
  const resMedida = crearMedida(payloadMedida);
  if (resMedida.status >= 400) {
    console.error(`Error Medida (${resMedida.status}):`, safeBody(resMedida.body));
  }
  check(resMedida, { 'POST Medida/Crear (200/201)': (r) => r.status === 200 || r.status === 201 });

  // 5️⃣ Crear Detalle Sanción
  // FIX: Usar valores del catálogo que respetan el CHECK constraint CK_DETALLE_INFRACCION_DES_SANCION.
  // Rotamos entre tipos de sanción para mayor cobertura de datos.
  const sancion = CATALOGO_SANCIONES[__ITER % CATALOGO_SANCIONES.length];

  const payloadDetalle = {
    idCabeceraInfraccionSancion: idCabecera,
    IdInfraccion: infraccion.IdInfraccion,
    desInfraccion: infraccion.DisplayInfraccion || '1.1 - Ofrecer y/o prestar',
    idRis: idRis,
    tempId: -2,
    desHechoInfractor: `Hecho infractor ${RUN_LABEL} VU${__VU} ITER${__ITER}`,
    numCorrelativo: 1,
    bitMedida: 1,
    desMedidaCorrectivaGen: 'Medida Correctiva k6',
    bitReconsidera: 0,
    bitReincidente: 0,
    bitPago: 0,
    desSancion:     sancion.desSancion,
    bitCancelacion: sancion.bitCancelacion,
    canSuspension:  sancion.canSuspension,
    tipoMulta:      sancion.tipoMulta,
    numMonto:       sancion.numMonto
  };

  const resDetalle = crearDetalle(payloadDetalle);
  if (resDetalle.status >= 400) {
    console.error(`Error Detalle (${resDetalle.status}):`, safeBody(resDetalle.body));
  }
  check(resDetalle, { 'POST Detalle/Crear (200/201)': (r) => r.status === 200 || r.status === 201 });

  // Pausa (Think Time)
  sleep(1);
}
