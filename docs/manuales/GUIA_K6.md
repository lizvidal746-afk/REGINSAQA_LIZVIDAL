# Guia k6 REGINSA

Medicion de rendimiento de APIs y flujos de negocio con k6 OSS + Grafana Cloud free tier.

---

## 1. Arquitectura de archivos

| Carpeta | Proposito | Estado |
| --------- | ----------- | -------- |
| `tests/performance/k6-grafana/` | Scripts k6 con soporte Grafana Cloud (activo) | Canonico |
| `tests/performance/k6/` | Scripts k6 locales (legacy) | Mantenido |
| `scripts/run-caso0X-local.ps1` | Runners PowerShell orquestadores | Canonico |
| `tests/performance/k6-grafana/helpers/ip-pool.js` | Round-robin multi-IP | Opcional |

### Scripts k6 por caso

| Script | Caso | Endpoint principal |
| -------- | ------ | ------------------- |
| `k6_caso_00_login.js` | Login Punku SSO | Auth/Login |
| `k6_caso_01_agregar_administrado.js` | Agregar Administrado | Entidad/Crear |
| `k6_caso_02_registrar_sancion.js` | Registrar Sancion | Sancion/Guardar |
| `k6_caso_03_reconsiderar_sin_sanciones.js` | Reconsiderar sin Sanciones | Reconsiderar/Guardar |
| `k6_caso_04_reconsiderar_con_sanciones.js` | Reconsiderar con Sanciones | Reconsiderar/Guardar |
| `k6_operaciones_api.js` | Operaciones on-demand | Buscar/Eliminar/Limpiar/Ocultar |

---

## 2. Comandos base

### Cantidad como parametro principal

```bash
npm run k6:01:local -- --cantidad=5
npm run k6:02:local -- --cantidad=3
npm run k6:03:local -- --cantidad=3
npm run k6:04:local -- --cantidad=3
```

### Salida local vs Cloud

```bash
# Local (consola + JSON)
npm run k6:01:local -- --cantidad=5

# Cloud (Grafana dashboards)
npm run k6:01:cloud -- --cantidad=5

# Alias grafana
npm run k6:01:grafana -- --cantidad=5
```

### Caso 00 Login (sin cantidad)

```bash
npm run k6:00:local
npm run k6:00:cloud
```

### Operaciones API on-demand

```bash
npm run k6:op:local
npm run k6:op:cloud
```

### Presentacion completa (casos 00-04 secuencial)

```bash
npm run k6:presentacion -- --cantidad=3
npm run k6:presentacion:grafana -- --cantidad=3
```

---

## 3. Diferencia local vs cloud (Grafana)

| Aspecto | Local | Cloud (Grafana) |
| --------- | ------- | ---------------- |
| Salida | Consola + `reportes/k6-*-summary.json` | Dashboard web Grafana |
| Historico | Solo ultima ejecucion | Historico acumulado |
| Costo | Gratis | Gratis (free tier: 500 runs/mes) |
| Requisitos | Solo k6 instalado | `K6_CLOUD_TOKEN` + `K6_CLOUD_PROJECT_ID` |
| Ideal para | Debug, ajustes rapidos | Reportes formales, comparativos |

### Configurar Grafana Cloud

1. Crear cuenta gratuita en <https://grafana.com/products/cloud/>
2. Ir a Testing & synthetics > Performance testing > k6
3. Crear proyecto y copiar Project ID
4. Generar token en Settings > API tokens
5. Agregar a `.env`:

```text
K6_CLOUD_TOKEN=tu-token
K6_CLOUD_PROJECT_ID=tu-project-id
```

---

## 4. HTTP Detail Mode

Controla como aparecen las APIs en Grafana:

| Modo | Comportamiento | Uso |
| ------ | --------------- | ----- |
| `all` (default) | Cada API con nombre individual | Ver metricas por endpoint |
| `guardar_only` | Solo el endpoint principal con nombre | Cuando solo importa la accion core |

```bash
# Forzar modo especifico
npm run k6:02:local -- --cantidad=3 --k6-http-detail=all
```

Variable de entorno: `K6_HTTP_DETAIL_MODE=all`

---

## 5. Interpretacion de resultados

### Indicadores clave (KPIs)

| Metrica | Que significa | Umbral tipico |
| --------- | -------------- | -------------- |
| `http_req_duration` p(95) | 95% de requests completan en este tiempo | < 2000ms |
| `http_req_failed` | % de requests con error HTTP | < 5% |
| `checks` | % de validaciones de respuesta exitosas | > 95% |
| `iterations` | Total de flujos completados | = cantidad solicitada |
| `vus` | Usuarios virtuales simultaneos | Segun configuracion |

### Leer consola k6

```text
     http_req_duration..: avg=345ms min=180ms med=320ms max=890ms p(90)=650ms p(95)=780ms
     http_req_failed....: 0.00%  ✓ 0  ✗ 15
     checks.............: 100.00% ✓ 45  ✗ 0
```

- `p(95) < threshold` = rendimiento aceptable
- `http_req_failed > 0` = investigar errores HTTP

---

## 6. Thresholds

Definidos en cada script k6 por caso. Ejemplo caso 02:

```javascript
export const options = {
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.10'],
    checks: ['rate>0.90'],
  },
};
```

### Ajustar umbrales

Editar directamente en `tests/performance/k6-grafana/k6_caso_XX_*.js`.

Para rate-limit esperado (APIs con throttling):

```bash
npm run k6:02:con-limites   # Espera 429, no penaliza
npm run k6:02:sin-limites   # Exige 100% ok rate
```

---

## 7. Pool compartido funcional/k6 (Caso 01)

El caso 01 de k6 reutiliza el pool de administrados de las pruebas funcionales:

```text
Playwright caso 01 → crea administrados → reportes/administrados-pool.json
                                              ↓
scripts/generar-k6-caso01-dataset.js → reportes/k6-caso01-dataset.json
                                              ↓
k6 caso 01 → consume dataset
```

Generar dataset manualmente:

```bash
node scripts/generar-k6-caso01-dataset.js
```

---

## 8. IP Pool (multi-IP load testing)

Para simular trafico desde multiples IPs:

```bash
# Activar pool de IPs secundarias (requiere admin)
npm run k6:ips:on

# Verificar estado
npm run k6:ips:status

# Ejecutar k6 con deteccion automatica de IPs
npm run k6:02:cloud -- --cantidad=10

# Desactivar
npm run k6:ips:off
```

Scripts involucrados:

- `scripts/k6-ips-toggle.ps1` — Activar/desactivar IPs secundarias
- `scripts/shared/detect-k6-ips.ps1` — Detectar IPs activas automaticamente
- `tests/performance/k6-grafana/helpers/ip-pool.js` — Round-robin en requests

---

## 9. Referencia rapida de comandos npm

| Comando | Descripcion |
| --------- | ------------ |
| `npm run k6:00:local` | Login k6 local |
| `npm run k6:01:local -- --cantidad=N` | Caso 01 local |
| `npm run k6:01:cloud -- --cantidad=N` | Caso 01 Grafana Cloud |
| `npm run k6:02:local -- --cantidad=N` | Caso 02 local |
| `npm run k6:02:cloud -- --cantidad=N` | Caso 02 Grafana Cloud |
| `npm run k6:03:local -- --cantidad=N` | Caso 03 local |
| `npm run k6:04:local -- --cantidad=N` | Caso 04 local |
| `npm run k6:op:local` | Operaciones API local |
| `npm run k6:presentacion` | Secuencia 00-04 |
| `npm run k6:ips:status` | Ver IPs activas |

---

## 10. Recomendaciones

- Probar local antes de cloud.
- Usar `--cantidad` como control principal de carga.
- Si ves `http_req_failed > 0`, verificar primero si es rate-limit (429) o error real (5xx).
- Para comparaciones formales, siempre usar Grafana Cloud (historico persistente).
- Conservar parametrizacion uniforme entre workflows y pipelines.
