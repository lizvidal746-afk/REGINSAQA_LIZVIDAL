// src/services/infraccion.js
import { apiRequest } from '../api/client.js';
import { getAuthHeaders } from '../api/auth.js';

export function listarInfracciones(page = 1, pageSize = 10) {
  const payload = { page, pageSize };
  return apiRequest('POST', '/Infraccion/Listar', payload, {
    headers: getAuthHeaders(),
    tags: { name: 'Infraccion/Listar', endpoint: 'infraccion_listar' }
  });
}
