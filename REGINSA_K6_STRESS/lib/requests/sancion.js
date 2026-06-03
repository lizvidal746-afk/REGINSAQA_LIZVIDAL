// lib/requests/sancion.js
import { request } from '../http.js';
import { config } from '../../config/env.js';

export function listarInfracciones(token) {
  const url = `${config.baseUrl}/Infraccion/Listar`;
  const params = { headers: { Authorization: `Bearer ${token}` } };
  return request('POST', url, {}, params);
}

export function crearCabeceraSancion(token, data) {
  const url = `${config.baseUrl}/CabeceraInfraccionSancion/Crear`;
  const params = { headers: { Authorization: `Bearer ${token}` } };
  return request('POST', url, data, params);
}

export function crearMedidaCorrectiva(token, data) {
  const url = `${config.baseUrl}/MedidaCorrectiva/Crear`;
  const params = { headers: { Authorization: `Bearer ${token}` } };
  return request('POST', url, data, params);
}

export function crearDetalleInfraccionSancion(token, data) {
  const url = `${config.baseUrl}/DetalleInfraccionSancion/Crear`;
  const params = { headers: { Authorization: `Bearer ${token}` } };
  return request('POST', url, data, params);
}
