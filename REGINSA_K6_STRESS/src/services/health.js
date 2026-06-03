// src/services/health.js
import { apiRequest } from '../api/client.js';

export function checkHealth() {
  // Nota: Health-check normalmente no requiere auth, por eso omitimos headers de auth
  return apiRequest('GET', '/Health', null, {
    tags: { name: 'HealthCheck' }
  });
}
