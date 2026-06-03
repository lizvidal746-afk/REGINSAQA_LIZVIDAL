// src/services/reconsideracion.js
import http from 'k6/http';
import { sleep } from 'k6';
import { apiRequest, getSourceIp, recordResponseMetrics } from '../api/client.js';
import { getAuthHeaders } from '../api/auth.js';
import { config } from '../config/index.js';
import { createdRecordsCounter } from '../../lib/metrics.js';

export function listarCabeceras(payload = {}) {
  return apiRequest('POST', '/CabeceraInfraccionSancion/ListarPaginado', payload, {
    headers: getAuthHeaders(),
    tags: { name: 'CabeceraInfraccionSancion/ListarPaginado', endpoint: 'cabecerainfraccionsancion_listarpaginado' },
  });
}

export function listarDetalles(payload = {}) {
  return apiRequest('POST', '/DetalleInfraccionSancion/ListarPaginado', payload, {
    headers: getAuthHeaders(),
    tags: { name: 'DetalleInfraccionSancion/ListarPaginado', endpoint: 'detalleinfraccionsancion_listarpaginado' },
  });
}

export function actualizarDetalle(idDetalle, payload = {}) {
  return apiRequest('PUT', `/DetalleInfraccionSancion/Actualizar/${idDetalle}`, payload, {
    headers: getAuthHeaders(),
    tags: { name: 'DetalleInfraccionSancion/Actualizar', endpoint: 'detalleinfraccionsancion_actualizar' },
  });
}

function jsonValue(response, path) {
  try {
    return response && response.json ? response.json(path) : undefined;
  } catch (e) {
    return undefined;
  }
}

function isAcceptedBusinessResponse(response) {
  if (!response || response.status < 200 || response.status >= 300) return false;
  return jsonValue(response, 'bSuccess') !== false;
}

export function actualizarCabeceraReconsideracion(idCabecera, payload = {}) {
  const url = `${config.baseUrl}/CabeceraInfraccionSancion/Actualizar/${idCabecera}`;
  const sourceIp = getSourceIp();
  const params = {
    headers: {
      Authorization: getAuthHeaders().Authorization,
      Accept: 'application/json',
    },
    tags: {
      name: 'CabeceraInfraccionSancion/Actualizar',
      endpoint: 'cabecerainfraccionsancion_actualizar',
      source_ip: sourceIp,
    },
    timeout: config.timeoutMs,
  };

  let response;
  const retries = config.maxRetries || 3;
  let waitSecs = 1.5;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    params.tags.retry = String(attempt);
    response = http.put(url, payload, params);
    recordResponseMetrics(response, sourceIp, params.tags);

    if (response.status !== 429) break;
    if (attempt < retries) {
      console.warn(`[WARN] 429 Rate Limit en CabeceraInfraccionSancion/Actualizar. Intento ${attempt + 1}/${retries}. Esperando ${waitSecs}s...`);
      sleep(waitSecs);
      waitSecs *= 2.0;
    }
  }

  if (isAcceptedBusinessResponse(response)) {
    createdRecordsCounter.add(1, {
      operation: 'reconsideracion',
      endpoint: 'cabecerainfraccionsancion_actualizar',
      source_ip: getSourceIp(),
    });
  }
  return response;
}
