// src/services/entidad.js
import { apiRequest, isFunctionalSuccessResponse } from '../api/client.js';
import { getAuthHeaders } from '../api/auth.js';
import { createdRecordsCounter } from '../../lib/metrics.js';
import { getSourceIp } from '../api/client.js';

export function listarEntidades() {
  return apiRequest('GET', '/Entidad/Listar', null, {
    headers: getAuthHeaders(),
    tags: { name: 'Entidad/Listar', endpoint: 'entidad_listar' }
  });
}

export function crearEntidad(payload) {
  const response = apiRequest('POST', '/Entidad/Crear', payload, {
    headers: getAuthHeaders(),
    tags: { name: 'Entidad/Crear', endpoint: 'entidad_crear' }
  });
  if (isFunctionalSuccessResponse(response, true)) {
    createdRecordsCounter.add(1, {
      operation: 'administrado',
      source_ip: getSourceIp(),
    });
  }
  return response;
}
