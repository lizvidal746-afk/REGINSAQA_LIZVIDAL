// src/services/sancion.js
import http from 'k6/http';
import { sleep } from 'k6';
import { apiRequest, getSourceIp, isFunctionalSuccessResponse, recordResponseMetrics } from '../api/client.js';
import { getAuthHeaders } from '../api/auth.js';
import { config } from '../config/index.js';
import { createdRecordsCounter } from '../../lib/metrics.js';

export function listarInfracciones(idRis) {
  return apiRequest('POST', '/Infraccion/Listar', { idRis }, {
    headers: getAuthHeaders(),
    tags: { name: 'Infraccion/Listar', endpoint: 'infraccion_listar' }
  });
}

export function crearCabecera(payload) {
  // ⚠️ CabeceraInfraccionSancion/Crear requiere multipart/form-data, NO JSON.
  // Se envía el objeto plano sin Content-Type para que K6 lo codifique como form-data.
  // Esto coincide con el modo form_pascal del script de referencia.
  const url = `${config.baseUrl}/CabeceraInfraccionSancion/Crear`;
  const sourceIp = getSourceIp();
  const params = {
    headers: {
      'Authorization': getAuthHeaders().Authorization
    },
    tags: { name: 'CabeceraInfraccionSancion/Crear', endpoint: 'cabecerainfraccionsancion_crear', source_ip: sourceIp },
    timeout: config.timeoutMs
  };

  // Asegurar que IdEntidad sea string para form-data
  const formPayload = {
    IdEntidad:              String(payload.IdEntidad || payload.idEntidad || ''),
    NumeroExpediente:       String(payload.NumeroExpediente || payload.numeroExpediente || ''),
    NumeroResolucion:       String(payload.NumeroResolucion || payload.numeroResolucion || ''),
    FechaResolucion:        String(payload.FechaResolucion || payload.fechaResolucion || ''),
    RutaResolucionSancion:  String(payload.RutaResolucionSancion || payload.rutaResolucionSancion || ''),
    ArchivoResolucion:      String(payload.ArchivoResolucion || payload.archivoResolucion || '')
  };

  let response;
  const retries = config.maxRetries || 3;
  let waitSecs = 1.5;

  for (let attempt = 0; attempt <= retries; attempt++) {
    params.tags.retry = String(attempt);
    response = http.post(url, formPayload, params);
    recordResponseMetrics(response, sourceIp, params.tags);

    if (response.status !== 429) {
      break;
    }

    if (attempt < retries) {
      console.warn(`[WARN] 429 Rate Limit en CabeceraInfraccionSancion/Crear. Intento ${attempt + 1}/${retries}. Esperando ${waitSecs}s...`);
      sleep(waitSecs);
      waitSecs *= 2.0;
    }
  }

  return response;
}

export function crearMedida(payload) {
  const response = apiRequest('POST', '/MedidaCorrectiva/Crear', payload, {
    headers: getAuthHeaders(),
    tags: { name: 'MedidaCorrectiva/Crear', endpoint: 'medidacorrectiva_crear' }
  });
  if (isFunctionalSuccessResponse(response, true)) {
    createdRecordsCounter.add(1, {
      operation: 'medida',
      endpoint: 'medidacorrectiva_crear',
      source_ip: getSourceIp(),
    });
  }
  return response;
}

export function crearDetalle(payload) {
  const response = apiRequest('POST', '/DetalleInfraccionSancion/Crear', payload, {
    headers: getAuthHeaders(),
    tags: { name: 'DetalleInfraccionSancion/Crear', endpoint: 'detalleinfraccionsancion_crear' }
  });
  if (isFunctionalSuccessResponse(response, true)) {
    createdRecordsCounter.add(1, {
      operation: 'detalle_sancion',
      endpoint: 'detalleinfraccionsancion_crear',
      source_ip: getSourceIp(),
    });
  }
  return response;
}
