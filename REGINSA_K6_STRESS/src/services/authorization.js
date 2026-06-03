// src/services/authorization.js
import { apiRequest } from '../api/client.js';
import { getAuthHeaders } from '../api/auth.js';

export function getSesionAllData() {
  return apiRequest('POST', '/Authorization/SesionAllData', null, {
    headers: getAuthHeaders(),
    tags: { name: 'Authorization/SesionAllData' }
  });
}
