// src/services/estado.js
import { apiRequest } from '../api/client.js';
import { getAuthHeaders } from '../api/auth.js';

export function listarEstados() {
  return apiRequest('GET', '/Estado/Lista', null, {
    headers: getAuthHeaders(),
    tags: { name: 'Estado/Lista' }
  });
}
