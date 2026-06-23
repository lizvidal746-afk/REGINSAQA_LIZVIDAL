// cases/caso02_registrar_sancion.js
// v2.0 — Usa el nuevo endpoint unificado CabeceraInfraccionSancion/CrearConDetalles
// Reemplaza las 3 llamadas separadas (Cabecera + Medida + Detalle) por 1 sola transaccional.

import { check, sleep } from 'k6';
import { getToken } from '../src/api/auth.js';
import { listarInfracciones, crearConDetalles } from '../src/services/sancion.js';
import { buildOptions, buildSummaryHandler } from '../src/config/k6Options.js';

const CASE_NAME = 'caso02_registrar_sancion';
const RUN_LABEL = String(__ENV.K6_RUN_LABEL || 'K6 00').trim();
const RUN_SLUG  = String(__ENV.K6_RUN_SLUG  || RUN_LABEL.replace(/\s+/g, '-')).trim();

export const options      = buildOptions(CASE_NAME);
export const handleSummary = buildSummaryHandler(CASE_NAME);

// ── Cargar el PDF en la fase de init (fuera de default) ─────────────────────
// K6 requiere que open() se llame en el contexto de inicialización.
let pdfBytes;
try {
  pdfBytes = open('../test-files/GENERAL_N_00001-2026-SUNEDU-SG-OTI.pdf', 'b');
} catch (e) {
  console.warn('[WARN] PDF no encontrado en test-files/. Se usará contenido vacío.');
  pdfBytes = new Uint8Array(0);
}

const PDF_NOMBRE = 'GENERAL_N_00001-2026-SUNEDU-SG-OTI.pdf';

// ── Catálogo de sanciones (v2.0: TipoMulta = 'S' Soles, 'U' UIT) ───────────
const CATALOGO_SANCIONES = [
  { desSancion: 'Multa',               bitCancelacion: false, canSuspension: 0, tipoMulta: 'S', numMonto: 5000  },
  { desSancion: 'Suspensión',          bitCancelacion: false, canSuspension: 2, tipoMulta: '',   numMonto: 0     },
  { desSancion: 'Cancelación',         bitCancelacion: true,  canSuspension: 0, tipoMulta: '',   numMonto: 0     },
  { desSancion: 'Multa + Suspensión',  bitCancelacion: false, canSuspension: 3, tipoMulta: 'S', numMonto: 2500  },
  { desSancion: 'Multa + Cancelación', bitCancelacion: true,  canSuspension: 0, tipoMulta: 'S', numMonto: 1500  },
];

function safeBody(body) {
  return String(body || '').slice(0, 900);
}

// ── Función principal ────────────────────────────────────────────────────────
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

  const idRis      = 1;
  const idEntidad  = String((__ITER % 5) + 1);

  // 2️⃣ Listar Infracciones (GET con query param — v2.0)
  const resInfracciones = listarInfracciones(idRis);
  check(resInfracciones, { 'GET Infraccion/Listar (200)': (r) => r.status === 200 });

  let infracciones = [];
  try {
    const oData = resInfracciones.json('oData');
    infracciones = Array.isArray(oData) ? oData : [];
  } catch (_) {}

  if (infracciones.length === 0) {
    console.error('No se encontraron infracciones para idRis=' + idRis);
    sleep(1);
    return;
  }

  const infraccion = infracciones[__ITER % infracciones.length];
  const sancion    = CATALOGO_SANCIONES[__ITER % CATALOGO_SANCIONES.length];

  // 3️⃣ Construir correlativo único por VU+ITER
  const ts          = Date.now();
  const correlativo = `${String(__VU).padStart(2,'0')}${String(__ITER).padStart(4,'0')}${String(ts % 10000).padStart(4,'0')}`;

  // 4️⃣ Preparar datos para la llamada unificada
  const cabecera = {
    idEntidad,
    numeroExpediente:     `EXP-${RUN_SLUG}-${correlativo}`,
    numeroResolucion:     `RES-${RUN_SLUG}-${correlativo}`,
    fechaResolucion:      '2026-05-13',
    rutaResolucionSancion: PDF_NOMBRE,
  };

  const medidas = [
    { desMedidaCorrectiva: `MEDIDA CORRECTIVA K6 VU${__VU} ITER${__ITER}` }
  ];

  const detalles = [
    {
      idInfraccion:         infraccion.IdInfraccion || infraccion.idInfraccion || '91',
      idRis,
      desSancion:           sancion.desSancion,
      desHechoInfractor:    `Hecho infractor ${RUN_LABEL} VU${__VU} ITER${__ITER}`,
      bitMedida:            true,
      desMedidaCorrectivaGen: `Medida Correctiva K6 ${RUN_LABEL}`,
      bitReconsidera:       false,
      bitReincidente:       false,
      bitPago:              false,
      bitCancelacion:       sancion.bitCancelacion,
      canSuspension:        sancion.canSuspension,
      desSuspension:        '',
      tipoMulta:            sancion.tipoMulta,
      numMonto:             sancion.numMonto,
    }
  ];

  const archivo = {
    contenido: pdfBytes,
    nombre:    PDF_NOMBRE,
  };

  // 5️⃣ Llamada única transaccional a CrearConDetalles
  const resCrear = crearConDetalles(cabecera, medidas, detalles, archivo);

  if (resCrear.status >= 400) {
    console.error(`Error CrearConDetalles (${resCrear.status}):`, safeBody(resCrear.body));
  }

  check(resCrear, {
    'POST CrearConDetalles (200)': (r) => r.status === 200 || r.status === 201,
    'CrearConDetalles bSuccess=true': (r) => {
      try { return r.json('bSuccess') === true; } catch (_) { return false; }
    },
    'CrearConDetalles tiene RESULTADO': (r) => {
      try {
        const id = r.json('oData')?.RESULTADO;
        return !!id && id > 0;
      } catch (_) { return false; }
    },
  });

  // 6️⃣ Loguear ID creado si es exitoso
  if (resCrear.status === 200 || resCrear.status === 201) {
    try {
      const resultado = resCrear.json('oData')?.RESULTADO;
      if (resultado) {
        console.log(`[OK] Registro creado. ID=${resultado} VU=${__VU} ITER=${__ITER}`);
      }
    } catch (_) {}
  }

  sleep(1);
}
