// lib/requests/entidad.js
import { request } from '../http.js';
import { config } from '../../config/env.js';

export function crearEntidad(token, entidadData) {
  const url = `${config.baseUrl}/Entidad/Crear`;
  const params = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  return request('POST', url, entidadData, params);
}
