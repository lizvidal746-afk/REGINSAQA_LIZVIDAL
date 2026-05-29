# PLAN DE IMPLEMENTACIÓN REGINSA QA 2026

## De QA Automation Senior → AI QA Engineer / DevSecOps AI Specialist

**Entidad:** SUNEDU | **Sistema:** SI-091 REGINSA | **Autora:** Liz Vidal  
**Fecha base:** 2026-05-06 | **Herramientas:** 100% Free / Open Source

---

## ESTADO ACTUAL (baseline)

| Capa | Estado | Herramientas |
| --- | --- | --- |
| Funcional E2E | ✅ Operativa | Playwright + TypeScript, 4 casos |
| API | ✅ Operativa | Newman + Postman, 4 colecciones |
| Seguridad | ✅ Operativa | 19 herramientas orquestadas por `run-all-security.ps1` |
| Calidad código | ✅ Operativa | SonarQube, 3 proyectos |
| Rendimiento | 🟡 Parcial | k6 con IP Pool, 4 casos, sin orquestador único |
| Reportes | ✅ Operativa | Word, Excel, HTML, JSON consolidado |
| Notificaciones | 🟡 Parcial | n8n notifica pero no orquesta; Teams deshabilitado |
| Pipelines | 🔴 Problema | GitHub Actions roto, 3 plataformas más activas |
| IA / RAG | ❌ No iniciado | Planificado |

---

## FASE 0 — CORRECCIONES BASE (Semana 1–2)

> **Prioridad: BLOQUEANTE** — Resolver antes de cualquier incremento

### 0.1 Arreglar GitHub Actions (PRIORIDAD #1)

**Problema detectado:** El workflow `reginsa-enterprise.yml` falla en GitHub Actions hosted runner porque:

- No tiene IPs SUNEDU bindeadas → `localAddress` de k6 falla
- Falta runner self-hosted configurado para load/stress
- Secrets mal mapeados

**Solución aplicada (implementar):**

| Job | Runner | Scope |
| --- | --- | --- |
| `smoke-test` | `ubuntu-latest` + `grafana/k6:latest` (container) | Sin IP binding, 1 VU, 1 min |
| `load-test` | `[self-hosted, windows, sunedu-perf]` | Con IPs bindeadas, perfil configurable |
| `e2e-test` | `ubuntu-latest` | Playwright chromium headless |
| `sonarqube` | `ubuntu-latest` | Análisis estático 3 repos |

**Secrets requeridos en GitHub (Settings → Secrets → Actions):**

```text
REGINSA_URL          → https://reginsaqa.sunedu.gob.pe
K6_CLOUD_TOKEN       → token de Grafana Cloud k6
K6_LOCAL_IPS         → 192.168.28.48,192.168.28.49,...
K6_PROJECT_ID        → id proyecto Grafana Cloud
ADMIN_USER           → usuario QA
ADMIN_PASS           → contraseña QA
SONAR_TOKEN          → token SonarQube local
SONAR_HOST_URL       → http://localhost:9000 (via self-hosted runner)
```

### 0.2 Limpiar pipelines obsoletos/duplicados

**Inventario actual:**

| Archivo | Estado | Acción |
| --- | --- | --- |
| `pipelines/github-actions/reginsa-enterprise.yml` | 🔴 Roto | **Reparar** con split smoke/load |
| `pipelines/azure/azure-pipelines-enterprise.yml` | ✅ Activo | Actualizar paths k6 |
| `pipelines/azure/azure-security-pipeline.yml` | ✅ Activo | Mantener |
| `pipelines/jenkins/Jenkinsfile` | ✅ Activo | Actualizar con `run-k6-suite.ps1` |
| `pipelines/jenkins/Jenkinsfile-security` | ✅ Activo | Mantener |
| `pipelines/aws/buildspec-functional.yml` | ✅ Activo | Actualizar |
| `pipelines/aws/buildspec-k6.yml` | ✅ Activo | Actualizar con orquestador |
| `pipelines/aws/buildspec-security.yml` | ✅ Activo | Mantener |

**Regla:** Todos los pipelines deben invocar el mismo orquestador `scripts/run-k6-suite.ps1`.

### 0.3 Correcciones de código completadas

| Script | Warning/Error | Fix aplicado |
| --- | --- | --- |
| `scripts/extraer-hallazgos.ps1` | Param `$Hallazgo` no usado en `Get-ExplicacionSimple` | ✅ Eliminado de firma y call site |
| `scripts/extraer-hallazgos.ps1` | `catch {}` vacío (línea 763, TruffleHog JSONL) | ✅ Reemplazado con `Write-Verbose` |
| `scripts/comparar-corridas.ps1` | COM error "valor fuera de intervalo" (anchos columna) | ✅ Corregido: 9000 twips total |
| `scripts/security/notificar-criticos-n8n.ps1` | n8n Teams/Slack POST: undefined | ✅ Slack directo vía `SLACK_WEBHOOK_URL` |

---

## FASE 1 — CAPA DE SEGURIDAD COMPLETA (Semana 2–4)

> **Estado actual:** Mayoría operativa. Completar los gaps.

### 1.1 Cuadro de herramientas de seguridad

| Herramienta | Categoría | Estado | Acción |
| --- | --- | --- | --- |
| Bearer | SAST | ✅ Operativa | Mantener |
| Semgrep | SAST | ✅ Operativa | Mantener |
| Gitleaks | SAST | ✅ Operativa | Mantener |
| TruffleHog | SAST | ✅ Operativa | Mantener |
| Checkov | SAST/IaC | ✅ Operativa | Mantener |
| CodeQL | SAST (deep) | 🟡 Opcional | Solo en release |
| OWASP DepCheck | SCA | ✅ Operativa | Mantener |
| OSV-Scanner | SCA | ✅ Operativa | Mantener |
| RetireJS | SCA | ✅ Operativa | Mantener |
| Syft + Grype | SCA/SBOM | ✅ Operativa | Mantener |
| Trivy | Container | ✅ Operativa | Mantener |
| OWASP ZAP | DAST | ✅ Operativa | Mantener |
| Nikto | DAST | ✅ Operativa | Mantener |
| Wapiti | DAST | ✅ Operativa | Mantener |
| Nuclei | DAST | ✅ Operativa | Mantener |
| RESTler | DAST/Fuzzing | 🟡 Parcial | Validar config |
| Lynis | Infra | ✅ Operativa | Mantener |
| SonarQube | Calidad | ✅ Operativa | Mantener 3 proyectos |
| Nmap + Vulners | Network | 🟡 Requiere auth | Solo con autorización SUNEDU |

### 1.2 Lanes de ejecución (priorización)

| Lane | Trigger | Herramientas | Tiempo estimado |
| --- | --- | --- | --- |
| **Fast** | Cada commit | Semgrep, Gitleaks, Newman smoke, Playwright smoke | 5–8 min |
| **Risk** | Cada PR/push a develop | ZAP baseline, Trivy, DepCheck, k6 smoke | 15–25 min |
| **Full Audit** | Release/semanal | Todo el arsenal (19 herramientas) | 45–90 min |

### 1.3 Hallazgos multidimensionales (captura en k6)

Además de rendimiento, k6 debe detectar hallazgos de:

| ID | Tipo | Qué detecta | Severidad |
| --- | --- | --- | --- |
| FUNC-01 | Funcional | Backend acepta campos vacíos que el front rechaza | Alta |
| FUNC-03 | Seguridad | XSS básico almacenado | Crítica |
| NEG-01 | Negocio | Sanciones duplicadas en < 1 segundo | Crítica |
| NEG-03 | Negocio | fechaFin < fechaInicio aceptado | Media |
| NEG-07 | Negocio | Sin rate limiting (50 req/min por token) | Media |
| DATA-01 | Datos/PII | PII devuelto sin enmascarar en GET | Alta |
| DATA-03 | Seguridad | Stack trace Java expuesto en error 500 | Crítica |
| INFRA-02 | Infra | Certificado SSL próximo a vencer | Alta |

---

## FASE 2 — ORQUESTADOR k6 (Semana 4–6)

> **Entregable principal:** `scripts/run-k6-suite.ps1`

### 2.1 Parámetros del orquestador

```powershell
.\scripts\run-k6-suite.ps1 `
    -Profile smoke|load|stress|spike|soak|breakpoint `
    -Caso 01|02|03|04 `
    -CompareWith reportes/k6/latest/summary.json `
    -DryRun `
    -OutputDir reportes/k6/<stamp>
```

### 2.2 Perfiles de carga (thresholds SUNEDU)

| Perfil | VUs | Duración | Uso |
| --- | --- | --- | --- |
| smoke | 1 | 1 min | CI/CD gate post-deploy |
| load | 50 | 5 min | Validación QA normal |
| stress | ramp 50→300 | 10 min | Release validation |
| spike | 0→200→0 | 2 min | Simulación pico |
| soak | 10 | 1 hora | Detección memory leak |
| breakpoint | ramp-to-fail | hasta quiebre | Benchmark capacidad |

### 2.3 Casos de negocio críticos (hero metrics)

| Caso | Endpoint | SLA p95 | SLA p99 |
| --- | --- | --- | --- |
| Login | POST /api/auth/login | 800ms | 1500ms |
| Crear Sanción | POST /api/sancion | 2000ms | 3500ms |
| Consultas | GET /api/administrado | 1500ms | 3000ms |
| General | * | 1500ms | 3000ms |

### 2.4 Hallazgos de rendimiento traducidos a negocio

```text
Si p95 CrearSancion > 3000ms → abandono estimado 18%
Con 500 sanciones/dia → 90 tramites perdidos/dia
A S/47 por tramite → S/4,230/dia → S/1.1M/año
```

### 2.5 Scripts npm a agregar a `package.json`

```json
{
  "perf:smoke":   "pwsh scripts/run-k6-suite.ps1 -Profile smoke -Caso 01",
  "perf:load":    "pwsh scripts/run-k6-suite.ps1 -Profile load -Caso 02",
  "perf:stress":  "pwsh scripts/run-k6-suite.ps1 -Profile stress -Caso 02",
  "perf:compare": "pwsh scripts/run-k6-suite.ps1 -Profile load -Caso 02 -CompareWith reportes/k6/latest/summary.json",
  "perf:dry":     "pwsh scripts/run-k6-suite.ps1 -Profile load -Caso 02 -DryRun"
}
```

### 2.6 Multi-IP con macvlan Docker (escalado free)

```bash
# Crear red macvlan con pool de IPs (escala a 50+ IPs sin netsh)
docker network create -d macvlan \
  --subnet=192.168.28.0/24 \
  --ip-range=192.168.28.48/28 \
  --gateway=192.168.28.1 \
  -o parent="Ethernet" k6_pool_network
```

---

## FASE 3 — n8n COMO ORQUESTADOR (Semana 6–8)

> **Estado actual:** Solo notifica. Meta: orquesta + clasifica con IA.

### 3.1 Evolución del workflow n8n

**Workflow actual:**

```text
Webhook → Clasificar Hallazgos → IF critico? → Notificar Teams❌ / Slack❌ → Responder
```

**Workflow objetivo:**

```text
[Webhook / Trigger Pipeline]
  ↓
[Switch: Tipo de Cambio]
  ├── frontend → Playwright + Newman + ZAP baseline
  ├── backend  → Newman + SonarQube + k6 smoke
  ├── release  → Suite completa (19 tools)
  └── manual   → Selector de suites
  ↓
[Consolidar JSON canónico]
  ↓
[AI Agent: Clasificar + Recomendar]  ← DeepSeek R1 via OpenRouter (FREE)
  ↓
[IF Críticos?]
  ├── true → Email Office365 + Slack directo + Crear issue Azure DevOps
  └── false → Log silencioso
  ↓
[Generar Reporte Ejecutivo Word/Excel]
  ↓
[Guardar en /reportes/<runId>/]
```

### 3.2 Configuración n8n para Slack

En `.env` del proyecto:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...
# Teams: DESHABILITADO por política institucional SUNEDU
```

El nodo "Notificar Teams" en n8n debe **deshabilitarse** (click derecho → Disable).  
El nodo "Notificar Slack" debe configurarse con la URL del Incoming Webhook de Slack.

---

## FASE 4 — IA APLICADA A QA (Semana 8–11)

> **Todo gratuito:** OpenRouter + DeepSeek R1 free tier / Llama 3.1 local

### 4.1 Clasificador inteligente de hallazgos

**LLM free recomendado:** `deepseek/deepseek-r1:free` via OpenRouter (sin costo, sin límite diario en horario valle)

**Prompt base (versionado en `core/config/prompts/clasificador-hallazgos.md`):**

```text
Eres QA Architect experto en Spring Boot + Angular + SUNEDU.
Analiza hallazgos y para cada uno devuelve:
- severidad_real: critical/high/medium/low (basada en impacto, no solo en la herramienta)
- componente: frontend-angular | backend-spring | base-de-datos | infraestructura
- tipo: rendimiento | funcional | seguridad | regla-negocio | datos
- remediation: 2 líneas concretas para Spring Boot / Angular
- esfuerzo: bajo(<4h) | medio(1-3d) | alto(>1 sprint)
- riesgo_negocio: traducción a impacto en trámites/día y S/. si aplica
```

### 4.2 Herramientas free para IA

| Herramienta | Uso | Costo |
| --- | --- | --- |
| OpenRouter + DeepSeek R1 | LLM clasificador de hallazgos | Gratis (cuota diaria) |
| Llama 3.1 8B (Ollama local) | LLM offline para datos sensibles | Gratis (~6GB RAM) |
| Supabase Free (pgvector) | Vector DB para RAG | Gratis (500MB, 2 proyectos) |
| Qdrant Docker local | Vector DB alternativa on-prem | Gratis (sin límite) |
| n8n Community | Orquestador de workflows | Gratis (self-hosted) |

---

## FASE 5 — RAG SOBRE DOCUMENTACIÓN (Semana 11–14)

> **Input:** 40+ documentos en `docs/` + reportes históricos

### 5.1 Pipeline de ingestión

```text
docs/*.md + docs/*.docx + reportes/informes/*.json
  → Extracción de texto (pandoc / python-docx)
  → Chunking (500 tokens, overlap 50)
  → Embeddings (OpenRouter text-embedding-3-small)
  → Supabase pgvector o Qdrant local
  → Workflow n8n "Pregúntale a REGINSA QA"
```

### 5.2 Consultas tipo

- "¿Cómo se valida el flujo de sanciones E2E?"
- "¿Qué controles aplican para CVE CVSS ≥7 en Spring Boot?"
- "¿Qué evidencias necesita jefatura para auditoría?"
- "¿Cuál fue el hallazgo más frecuente en los últimos 3 meses?"

---

## FASE 6 — AGENTES ESPECIALIZADOS (Semana 14–20)

> **Arquitectura multi-agente en n8n AI Agent node**

```text
QA Supervisor Agent
  ├── Playwright Agent  → interpreta fallos E2E, sugiere causa
  ├── Security Agent    → consolida SAST/SCA/DAST
  ├── API Agent         → valida Newman, detecta anomalías de contrato
  ├── Performance Agent → analiza summary.json, genera executive-summary.md
  └── Report Agent      → genera Word/Excel/PDF ejecutivo
```

---

## FASE 7 — PRUEBAS FUNCIONALES Y USABILIDAD (Semana 18–24)

> **Al final, una vez que las capas base estén estabilizadas**

### 7.1 Expansión Playwright

| Caso | Flujo | Estado |
| --- | --- | --- |
| Caso 01 | Login + navegación | ✅ Existente |
| Caso 02 | Registro de sanciones (CRUD) | ✅ Existente |
| Caso 03 | Consultas y filtros | ✅ Existente |
| Caso 04 | Gestión administrados | ✅ Existente |
| Caso 05 | Validaciones frontend vs backend | 🔴 Pendiente |
| Caso 06 | Accesibilidad (Lighthouse + axe) | 🔴 Pendiente |
| Caso 07 | Mobile / responsive (viewport) | 🔴 Pendiente |

### 7.2 Hallazgos funcionales a capturar

| ID | Tipo | Check en Playwright/Newman |
| --- | --- | --- |
| FUNC-01 | Campo vacío no validado | POST sin campo → expect 400 |
| FUNC-02 | Regla negocio no aplicada | fecha inválida → expect 400 |
| FUNC-05 | IDs inconsistentes | POST → GET mismo ID → same resource |
| FUNC-06 | Race conditions | 2 req simultáneos → no duplicados |
| UX-01 | Usabilidad | Lighthouse Performance ≥ 80 |
| UX-02 | Accesibilidad | axe-core: 0 violaciones críticas |

---

## ROADMAP RESUMEN (90 días)

| Semana | Fase | Entregable clave |
| --- | --- | --- |
| 1–2 | **Fase 0** | GitHub Actions reparado, pipelines limpiados, warnings corregidos |
| 2–4 | **Fase 1** | Security suite completa + hallazgos multidimensionales en k6 |
| 4–6 | **Fase 2** | `scripts/run-k6-suite.ps1` orquestador completo + npm scripts perf |
| 6–8 | **Fase 3** | n8n workflow maestro (orquesta, no solo notifica) + Slack configurado |
| 8–11 | **Fase 4** | AI Agent clasificador + executive-summary.md automático |
| 11–14 | **Fase 5** | RAG sobre 40+ docs + workflow "Pregúntale a REGINSA QA" |
| 14–20 | **Fase 6** | Agentes especializados (Playwright, Security, Report) |
| 18–24 | **Fase 7** | Funcional expandido + usabilidad + accesibilidad |

---

## PROGRESO DE IMPLEMENTACIÓN

| # | Tarea | Estado |
| --- | --- | --- |
| 0.1 | Reparar GitHub Actions enterprise.yml | 🔴 Pendiente |
| 0.2 | Limpiar pipelines obsoletos | 🔴 Pendiente |
| 0.3a | Fix `extraer-hallazgos.ps1` warnings | ✅ Completado 2026-05-06 |
| 0.3b | Fix `comparar-corridas.ps1` COM columnas | ✅ Completado 2026-05-06 |
| 0.3c | Fix n8n Teams/Slack POST undefined | ✅ Completado 2026-05-06 |
| 0.4 | Validar `comparar-corridas.ps1` con Word | 🟡 Listo para test |
| 1.1 | Configurar lanes Fast/Risk/Full | 🔴 Pendiente |
| 2.1 | Crear `scripts/run-k6-suite.ps1` | 🔴 Pendiente |
| 2.2 | Actualizar Azure/Jenkins/AWS con orquestador | 🔴 Pendiente |
| 2.3 | Agregar scripts perf a package.json | 🔴 Pendiente |
| 3.1 | Rediseñar workflow n8n maestro | 🔴 Pendiente |
| 3.2 | Configurar SLACK_WEBHOOK_URL en .env | 🟡 Código listo |
| 4.1 | Integrar AI Agent (OpenRouter/DeepSeek) | 🔴 Pendiente |
| 5.1 | Ingestión RAG docs → Qdrant/Supabase | 🔴 Pendiente |
| 6.1 | Agentes especializados n8n | 🔴 Pendiente |
| 7.1 | Playwright casos 05-07 | 🔴 Pendiente |

---

## POSICIONAMIENTO DE MERCADO

Con este stack 100% free completamente implementado:

| Antes | Después |
| --- | --- |
| QA Automation Senior | AI QA Engineer + DevSecOps AI Specialist |
| Scripts secuenciales | Plataforma orquestada por riesgo e IA |
| Reportes manuales | Análisis automático con clasificación IA |
| 4 casos E2E | Suite multidimensional (rendimiento + seguridad + negocio) |
| Notificaciones básicas | Orquestación inteligente con agentes especializados |
| 40+ docs estáticos | Base RAG consultable en tiempo real |

**Sectores objetivo:** Banca, minería, retail, gobierno (SUNEDU, SUNAT, RENIEC, SBS)  
**Diferenciador:** Único stack en Perú que combina DevSecOps + IA aplicada a QA + trazabilidad de auditoría + cumplimiento normativo demostrable.
