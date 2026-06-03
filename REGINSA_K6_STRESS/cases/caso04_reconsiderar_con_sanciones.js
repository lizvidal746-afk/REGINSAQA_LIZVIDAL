// cases/caso04_reconsiderar_con_sanciones.js
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { getToken } from '../src/api/auth.js';
import { getSourceIp, isFunctionalSuccessResponse } from '../src/api/client.js';
import {
  actualizarCabeceraReconsideracion,
  actualizarDetalle,
  listarCabeceras,
  listarDetalles,
} from '../src/services/reconsideracion.js';
import { buildOptions, buildSummaryHandler } from '../src/config/k6Options.js';
import { config } from '../src/config/index.js';
import { businessValidationHits } from '../lib/metrics.js';

const CASE_NAME = 'caso04_reconsiderar_con_sanciones';
const RUN_LABEL = String(__ENV.K6_RUN_LABEL || 'K6 00').trim();
const RUN_SLUG = String(__ENV.K6_RUN_SLUG || RUN_LABEL.replace(/\s+/g, '-')).trim();
const DEBUG_BUSINESS_ERRORS = (__ENV.K6_DEBUG_BUSINESS_ERRORS || '1') !== '0';
const DEBUG_BUSINESS_LIMIT = Number.parseInt(__ENV.K6_DEBUG_BUSINESS_MAX || '5', 10) || 5;
let businessDebugCount = 0;
const pdfFile = open('../assets/GENERAL_N_00001-2026-SUNEDU-SG-OTI.pdf', 'b');

export const options = buildOptions(CASE_NAME);
export const handleSummary = buildSummaryHandler(CASE_NAME);

function safeJsonValue(response, path) {
  try {
    return response && response.json ? response.json(path) : undefined;
  } catch (e) {
    return undefined;
  }
}

function oDataArray(response) {
  const data = safeJsonValue(response, 'oData');
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.Results)) return data.Results;
  if (data && Array.isArray(data.results)) return data.results;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.rows)) return data.rows;
  const results = safeJsonValue(response, 'Results') || safeJsonValue(response, 'results');
  if (Array.isArray(results)) return results;
  return [];
}

function firstDefined(obj, names) {
  for (const name of names) {
    if (obj && obj[name] !== undefined && obj[name] !== null && obj[name] !== '') return obj[name];
  }
  return null;
}

function hasTextValue(value) {
  if (value === undefined || value === null) return false;
  return String(value).trim() !== '';
}

function isTruthyFlag(value) {
  if (value === true || value === 1) return true;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'si' || normalized === 's';
}

function isCabeceraReconsiderada(cabecera) {
  const reconsideracionFields = [
    'NumeroReconsideracion',
    'numeroReconsideracion',
    'FechaReconsideracion',
    'fechaReconsideracion',
    'DesResolucionReconsideracion',
    'desResolucionReconsideracion',
    'FechaResolucionReconsideracion',
    'fechaResolucionReconsideracion',
    'RutaResolucionReconsideracion',
    'rutaResolucionReconsideracion',
    'RutaResolReconsidera',
    'rutaResolReconsidera',
  ];
  if (reconsideracionFields.some((field) => hasTextValue(cabecera?.[field]))) return true;
  return isTruthyFlag(firstDefined(cabecera, ['BitReconsidera', 'bitReconsidera', 'Reconsidera', 'reconsidera']));
}

function isDetalleReconsiderado(detalle) {
  return isTruthyFlag(firstDefined(detalle, ['BitReconsidera', 'bitReconsidera', 'Reconsidera', 'reconsidera']));
}

function buildCabeceraListPayload() {
  const ipCount = Math.max(config.localIps.length || 9, 1);
  const iterPerVu = Number.parseInt(__ENV.K6_ITER_PER_VU || '4', 10) || 4;
  const expectedAuditCandidates = ipCount * iterPerVu;
  const configuredPageSize = Number.parseInt(__ENV.K6_CASO04_PAGE_SIZE || '0', 10) || 0;
  const pageSize = Math.max(configuredPageSize, expectedAuditCandidates, 50);
  return {
    nPageNumber: 1,
    nPageSize: pageSize,
    sSortColumnName: 'FECHA_REGISTRO',
    sSortOrder: 'DESC',
    sFilterValue: '',
    numeroExpediente: null,
    numeroResolucion: null,
    fechaRegistroIni: null,
    fechaRegistroFin: null,
    filtroEstado: null,
  };
}

function buildDetalleListPayload(idCabecera) {
  return {
    idCabeceraInfraccionSancion: idCabecera,
    nPageNumber: 1,
    nPageSize: 50,
    sSortColumnName: 'ID_INFRACCION',
    sSortOrder: 'ASC',
    sFilterValue: '',
  };
}

function buildDetallePayload(detalle, idCabecera) {
  const idDetalle = firstDefined(detalle, [
    'idDetalleInfraccionSancion',
    'IdDetalleInfraccionSancion',
    'idDetalle',
    'IdDetalle',
  ]);
  return {
    idCabeceraInfraccionSancion: idCabecera,
    IdInfraccion: firstDefined(detalle, ['IdInfraccion', 'idInfraccion']) || 0,
    desSancion: firstDefined(detalle, ['Sancion', 'desSancion', 'sancion']) || '',
    bitReconsidera: 1,
    bitReincidente: firstDefined(detalle, ['BitReincidente', 'bitReincidente']) === 1 ? 1 : 0,
    bitPago: firstDefined(detalle, ['BitPago', 'bitPago']) === 1 ? 1 : 0,
    desSuspension: firstDefined(detalle, ['DesSuspension', 'desSuspension']),
    bitCancelacion: firstDefined(detalle, ['BitCancelacion', 'bitCancelacion']) === 1 ? 1 : 0,
    canSuspension: Number(firstDefined(detalle, ['CanSuspension', 'canSuspension']) || 0),
    tipoMulta: firstDefined(detalle, ['TipoMulta', 'tipoMulta']),
    numMonto: Number(firstDefined(detalle, ['Monto', 'numMonto']) || 0),
    idRis: firstDefined(detalle, ['IdRis', 'idRis']) || 0,
    desHechoInfractor: firstDefined(detalle, ['HechoInfractor', 'desHechoInfractor']) || '',
    numCorrelativo: firstDefined(detalle, ['NumCorrelativo', 'numCorrelativo']) || 1,
    bitMedida: firstDefined(detalle, ['BitMedida', 'bitMedida']) === 1 ? 1 : 0,
    desMedidaCorrectivaGen: firstDefined(detalle, ['DesMedidaCorrectivaGen', 'desMedidaCorrectivaGen']) || '',
    idDetalleInfraccionSancion: idDetalle,
    bitActivo: 1,
  };
}

function buildCabeceraReconsideracionPayload(cabecera, idCabecera, ordinal) {
  const fileName = 'GENERAL_N_00001-2026-SUNEDU-SG-OTI.pdf';
  const numeroReconsideracion = `${RUN_LABEL} REC ${8800 + ordinal}-2026`;
  const pdf = http.file(pdfFile, fileName, 'application/pdf');
  return {
    IdCabeceraInfraccionSancion: idCabecera,
    IdEntidad: String(firstDefined(cabecera, ['IdEntidad', 'idEntidad']) || ''),
    NumeroExpediente: String(firstDefined(cabecera, ['NumeroExpediente', 'numeroExpediente']) || ''),
    NumeroResolucion: String(firstDefined(cabecera, ['NumeroResolucion', 'numeroResolucion']) || ''),
    FechaResolucion: String(firstDefined(cabecera, ['FechaResolucion', 'fechaResolucion']) || ''),
    NumeroReconsideracion: numeroReconsideracion,
    FechaReconsideracion: new Date().toISOString(),
    DesResolucionReconsideracion: numeroReconsideracion,
    FechaResolucionReconsideracion: new Date().toISOString(),
    LimpiarReconsideracion: 'false',
    RutaResolucionSancion: String(firstDefined(cabecera, ['RutaResolucionSancion', 'rutaResolucionSancion', 'RutaResolSancion', 'rutaResolSancion']) || ''),
    GuidCabecera: String(firstDefined(cabecera, ['GuidCabecera', 'guidCabecera']) || ''),
    RutaResolucionReconsideracion: fileName,
    ArchivoResolucionReconsideracion: pdf,
    rutaResolucionSancionAnterior: String(firstDefined(cabecera, ['RutaResolucionSancion', 'rutaResolucionSancion', 'RutaResolSancion', 'rutaResolSancion']) || ''),
    rutaResolucionReconsideracionAnterior: String(firstDefined(cabecera, ['RutaResolucionReconsideracion', 'rutaResolucionReconsideracion', 'RutaResolReconsidera', 'rutaResolReconsidera']) || ''),
  };
}

function responseMessage(response) {
  return String(
    safeJsonValue(response, 'sMessage')
    || safeJsonValue(response, 'message')
    || safeJsonValue(response, 'Message')
    || '',
  ).slice(0, 300);
}

function responseData(response) {
  const data = safeJsonValue(response, 'oData');
  if (data === undefined || data === null) return '';
  return JSON.stringify(data).slice(0, 300);
}

function evidenceBase(status, idCabecera, numeroReconsideracion, extra = {}) {
  return {
    run: RUN_LABEL,
    runSlug: RUN_SLUG,
    status,
    sourceIp: getSourceIp(),
    vu: __VU || 0,
    iterVu: __ITER || 0,
    iterGlobal: Number(exec.scenario.iterationInTest || 0),
    ordinal: selectionOrdinal(),
    idCabecera: idCabecera ? String(idCabecera) : '',
    numeroReconsideracion: numeroReconsideracion || '',
    ...extra,
  };
}

function logEvidence(status, idCabecera, numeroReconsideracion, extra = {}) {
  console.log(`[CASO04_EVIDENCE] ${JSON.stringify(evidenceBase(status, idCabecera, numeroReconsideracion, extra))}`);
}

function selectionOrdinal() {
  const poolSize = Math.max(config.localIps.length || 9, 1);
  const vuIndex = Math.max((__VU || 1) - 1, 0);
  const iterationByVu = Math.max(__ITER || 0, 0);
  return vuIndex + (iterationByVu * poolSize);
}

function vuPoolIndex() {
  const poolSize = Math.max(config.localIps.length || 9, 1);
  return Math.max((__VU || 1) - 1, 0) % poolSize;
}

function isAcceptedBusinessResponse(response) {
  if (!response || response.status < 200 || response.status >= 300) return false;
  const bSuccess = safeJsonValue(response, 'bSuccess');
  return bSuccess !== false;
}

function logBusinessFailure(response, context) {
  if (!DEBUG_BUSINESS_ERRORS || businessDebugCount >= DEBUG_BUSINESS_LIMIT) return;
  if (isFunctionalSuccessResponse(response, true)) return;
  businessDebugCount += 1;
  const message = safeJsonValue(response, 'sMessage') || safeJsonValue(response, 'message') || safeJsonValue(response, 'Message') || '';
  const data = safeJsonValue(response, 'oData');
  businessValidationHits.add(1, { reason: 'caso04_reconsideracion', endpoint: context });
  console.warn(
    `[CASO04][VALIDACION] endpoint=${context} status=${response?.status || 0} msg="${String(message || '').slice(0, 260)}" oData=${JSON.stringify(data ?? '').slice(0, 260)}`,
  );
}

function logPrecondition(message, context, extra = {}) {
  businessValidationHits.add(1, { reason: 'caso04_precondicion', endpoint: context });
  console.warn(`[CASO04][PRECONDICION] ${message}`);
  logEvidence('precondicion', extra.idCabecera || '', extra.numeroReconsideracion || '', {
    endpoint: context,
    message,
    ...extra,
  });
}

export default function () {
  try {
    getToken();
  } catch (e) {
    console.error('Login Error:', e.message);
    return;
  }

  const resCabeceras = listarCabeceras(buildCabeceraListPayload());
  check(resCabeceras, {
    'POST CabeceraInfraccionSancion/ListarPaginado HTTP 200': (r) => r.status === 200,
  });

  const iterationInTest = Number(exec.scenario.iterationInTest || 0);
  const ordinal = selectionOrdinal();
  const candidateIndex = vuPoolIndex();
  const cabeceras = oDataArray(resCabeceras);
  const cabecerasElegibles = cabeceras.filter((item) => !isCabeceraReconsiderada(item));

  if (cabecerasElegibles.length === 0) {
    logPrecondition(
      `ListarPaginado devolvio ${cabeceras.length} cabecera(s), pero todas ya tienen reconsideracion. No se reutilizan registros visuales reconsiderados.`,
      'cabecerainfraccionsancion_listarpaginado',
      { cabecerasRecibidas: cabeceras.length, cabecerasElegibles: cabecerasElegibles.length },
    );
    sleep(1);
    return;
  }

  if (candidateIndex >= cabecerasElegibles.length) {
    logPrecondition(
      `No hay suficientes cabeceras sin reconsideracion para cubrir la IP/VU ${candidateIndex + 1}. Elegibles=${cabecerasElegibles.length}; recibidas=${cabeceras.length}.`,
      'cabecerainfraccionsancion_listarpaginado',
      { candidateIndex, cabecerasRecibidas: cabeceras.length, cabecerasElegibles: cabecerasElegibles.length },
    );
    sleep(1);
    return;
  }

  const cabecera = cabecerasElegibles[candidateIndex];
  const idCabecera = firstDefined(cabecera, [
    'idCabeceraInfraccionSancion',
    'IdCabeceraInfraccionSancion',
    'idCabecera',
    'IdCabecera',
  ]) || __ENV.K6_CASO04_ID_CABECERA;

  if (!idCabecera) {
    console.error('[CASO04] No se encontro idCabeceraInfraccionSancion. Configure K6_CASO04_ID_CABECERA o revise Cabecera/ListarPaginado.');
    logEvidence('sin_id_cabecera', '', '', {
      endpoint: 'cabecerainfraccionsancion_listarpaginado',
      cabecerasRecibidas: cabeceras.length,
      cabecerasElegibles: cabecerasElegibles.length,
    });
    sleep(1);
    return;
  }

  const cabeceraPayload = buildCabeceraReconsideracionPayload(cabecera || {}, idCabecera, ordinal || iterationInTest);
  const resCabecera = actualizarCabeceraReconsideracion(
    idCabecera,
    cabeceraPayload,
  );
  logEvidence(isAcceptedBusinessResponse(resCabecera) ? 'cabecera_actualizada' : 'cabecera_no_confirmada', idCabecera, cabeceraPayload.NumeroReconsideracion, {
    endpoint: 'cabecerainfraccionsancion_actualizar',
    httpStatus: resCabecera?.status || 0,
    bSuccess: safeJsonValue(resCabecera, 'bSuccess'),
    message: responseMessage(resCabecera),
    oData: responseData(resCabecera),
    numeroExpediente: String(firstDefined(cabecera, ['NumeroExpediente', 'numeroExpediente']) || ''),
    numeroResolucion: String(firstDefined(cabecera, ['NumeroResolucion', 'numeroResolucion']) || ''),
    cabecerasRecibidas: cabeceras.length,
    cabecerasElegibles: cabecerasElegibles.length,
  });
  logBusinessFailure(resCabecera, 'cabecerainfraccionsancion_actualizar');
  check(resCabecera, {
    'PUT CabeceraInfraccionSancion/Actualizar aceptado': (r) => r.status === 200 || r.status === 201 || r.status === 204,
    'PUT CabeceraInfraccionSancion/Actualizar negocio confirmado': (r) => isAcceptedBusinessResponse(r),
  });
  if (!isAcceptedBusinessResponse(resCabecera)) {
    sleep(1);
    return;
  }

  const resDetalles = listarDetalles(buildDetalleListPayload(idCabecera));
  check(resDetalles, {
    'POST DetalleInfraccionSancion/ListarPaginado HTTP 200': (r) => r.status === 200,
  });

  const detalles = oDataArray(resDetalles);
  const detallesElegibles = detalles.filter((item) => !isDetalleReconsiderado(item));
  if (detalles.length > 0 && detallesElegibles.length === 0) {
    logPrecondition(
      `La cabecera ${idCabecera} ya no tiene detalles pendientes de marcar con reconsideracion. Detalles recibidos=${detalles.length}.`,
      'detalleinfraccionsancion_listarpaginado',
      { idCabecera, numeroReconsideracion: cabeceraPayload.NumeroReconsideracion, detallesRecibidos: detalles.length, detallesElegibles: detallesElegibles.length },
    );
    sleep(1);
    return;
  }

  const detallePool = detallesElegibles.length > 0 ? detallesElegibles : detalles;
  const detalle = detallePool[ordinal % Math.max(detallePool.length, 1)] || {};
  const idDetalle = firstDefined(detalle, [
    'idDetalleInfraccionSancion',
    'IdDetalleInfraccionSancion',
    'idDetalle',
    'IdDetalle',
  ]) || __ENV.K6_CASO04_ID_DETALLE;

  if (idDetalle) {
    const resActualizar = actualizarDetalle(idDetalle, buildDetallePayload(detalle, idCabecera));
    logEvidence(isAcceptedBusinessResponse(resActualizar) ? 'detalle_actualizado' : 'detalle_no_confirmado', idCabecera, cabeceraPayload.NumeroReconsideracion, {
      endpoint: 'detalleinfraccionsancion_actualizar',
      idDetalle: String(idDetalle),
      httpStatus: resActualizar?.status || 0,
      bSuccess: safeJsonValue(resActualizar, 'bSuccess'),
      message: responseMessage(resActualizar),
      oData: responseData(resActualizar),
      detallesRecibidos: detalles.length,
      detallesElegibles: detallesElegibles.length,
    });
    logBusinessFailure(resActualizar, 'detalleinfraccionsancion_actualizar');
    check(resActualizar, {
      'PUT DetalleInfraccionSancion/Actualizar aceptado': (r) => r.status === 200 || r.status === 201 || r.status === 204,
      'PUT DetalleInfraccionSancion/Actualizar negocio confirmado': (r) => isAcceptedBusinessResponse(r),
    });
  } else {
    logEvidence('sin_id_detalle', idCabecera, cabeceraPayload.NumeroReconsideracion, {
      endpoint: 'detalleinfraccionsancion_listarpaginado',
      detallesRecibidos: detalles.length,
      detallesElegibles: detallesElegibles.length,
    });
  }

  sleep(1);
}
