# 📋 AUDITORÍA DE WORKFLOWS - REGINSA 2026-04-02

## 🎯 Resumen Ejecutivo

- **Total de workflows**: 31 (antes) → 31 (después)
- **CRIADOS**: 1 nuevo workflow
- **ACTUALIZADOS**: 0 (no se han hecho cambios aún, esperando aprobación)
- **CONSOLIDADOS/ELIMINADOS**: 0
- **PENDIENTE**: Actualizar workflows existentes para coherencia y eliminar duplicados innecesarios

---

## 📦 INVENTARIO ACTUAL (POST-CREACIÓN K6-CASO00)

### ✅ FUNCIONALES (4 casos + 1 agregado) - SELFHOSTED

```text
reginsa-funcional-pro-caso01-selfhosted.yml ✅ Existe
reginsa-funcional-pro-caso02-selfhosted.yml ✅ Existe
reginsa-funcional-pro-caso03-selfhosted.yml ✅ Existe
reginsa-funcional-pro-caso04-selfhosted.yml ✅ Existe
reginsa-funcional-selfhosted.yml           ✅ Existe
```

### ✅ K6 PERFORMANCE (5 casos: 00-04) - SELFHOSTED

```text
reginsa-k6-caso00-selfhosted.yml ✅ CREADO (nuevo)
reginsa-k6-caso01-selfhosted.yml ✅ Existe
reginsa-k6-caso02-selfhosted.yml ✅ Existe
reginsa-k6-caso03-selfhosted.yml ✅ Existe
reginsa-k6-caso04-selfhosted.yml ✅ Existe
```

### ✅ POSTMAN/NEWMAN (4 casos) - SELFHOSTED

```text
reginsa-postman-caso01-selfhosted.yml ✅ Existe
reginsa-postman-caso02-selfhosted.yml ✅ Existe
reginsa-postman-caso03-selfhosted.yml ✅ Existe
reginsa-postman-caso04-selfhosted.yml ✅ Existe
reginsa-postman-selfhosted.yml          ✅ Existe
```

### ✅ VALIDACIONES/QUALITY (4 casos) - SELFHOSTED

```text
reginsa-validaciones-caso01-selfhosted.yml ✅ Existe
reginsa-validaciones-caso02-selfhosted.yml ✅ Existe
reginsa-validaciones-caso03-selfhosted.yml ✅ Existe
reginsa-validaciones-caso04-selfhosted.yml ✅ Existe
```

### ✅ SMOKE TESTS (4 casos) - CLOUD SELFHOSTED

```text
reginsa-smoke-caso01-cloud-selfhosted.yml ✅ Existe
reginsa-smoke-caso02-cloud-selfhosted.yml ✅ Existe
reginsa-smoke-caso03-cloud-selfhosted.yml ✅ Existe
reginsa-smoke-caso04-cloud-selfhosted.yml ✅ Existe
```

### ✅ SEGURIDAD & CALIDAD - MIXTO

```text
reginsa-owasp-selfhosted.yml              ✅ Existe
reginsa-sonarqube-selfhosted.yml          ✅ Existe
reginsa-sonarqube.yml                     ✅ Existe (versión cloud)
reginsa-security.yml                      ✅ Existe
reginsa-quality-gate-selfhosted.yml       ✅ Existe
```

### ✅ PERFORMANCE & ENTERPRISE (GENÉRICOS)

```text
reginsa-performance-selfhosted.yml ✅ Existe
reginsa-performance.yml            ✅ Existe (escala sin selfhosted)
reginsa-funcional.yml              ✅ Existe (scale sin selfhosted)
reginsa-enterprise.yml             ✅ Existe
```

---

## 🔍 ANÁLISIS DE DUPLICADOS POSIBLES

### Pareja 1: Performance

- `reginsa-performance.yml` (escala, workers=6, repeat=30)
- `reginsa-performance-selfhosted.yml`
- **Status**: ⏳ REVISAR - ¿Son realmente diferentes? Posible consolidación

### Pareja 2: SonarQube Security

- `reginsa-sonarqube.yml` (no-selfhosted, GitHub runners)
- `reginsa-sonarqube-selfhosted.yml` (self-hosted runners)
- **Status**: ✅ VÁLIDOS - Diferentes plataformas de ejecución

### Pareja 3: Funcional Scale

- `reginsa-funcional.yml` (workers=6, repeat=30, pool_target=1200)
- `reginsa-funcional-pro-casoXX-selfhosted.yml` (workers=3, repeat=3)
- **Status**: ✅ VÁLIDOS - Diferentes propósitos (carga vs. humo)

---

## 📝 CAMBIOS REALIZADOS

### ✅ COMPLETADO

1. **Creado**: `reginsa-k6-caso00-selfhosted.yml`
   - Workflow para K6 smoke test (login/logout)
   - VUs por defecto: 2
   - Iteraciones por defecto: 5
   - Timeout: 30 minutos
   - Usa `tests/performance/k6/k6_caso_00_login.js`

---

## 🛠️ PRÓXIMOS PASOS SUGERIDOS (SIN HACER COMMITS AÚN)

### OPCIÓN 1: Consolidación Agresiva (No duplicar)

- ❌ Eliminar `reginsa-performance.yml` (mantener solo selfhosted)
- ❌ Eliminar `reginsa-funcional.yml` (mantener solo pro-casoXX)
- ✅ Mantener ambas versiones de SonarQube (diferentes runners)

**Resultado**: 28 workflows (reducción de 31)

### OPCIÓN 2: Mantener Flexibilidad (Usuario puede elegir)

- ✅ Mantener todas las variantes (escala, pro, cloud, selfhosted)
- ✅ Máxima flexibilidad para diferentes casos de uso
- ⚠️ Más workflows pero sin duplicación real

**Resultado**: 31 workflows (actual)

### OPCIÓN 3: Híbrida (Recomendada)

- ❌ Fusionar workflows con parámetros `workflow_call` reutilizables
- ✅ Mantener workflows específicos por caso (funcional-pro, k6-casoXX, postman-casoXX)
- ✅ Consolidar genéricos (enterprise, performance, security en uno)

**Resultado**: ~20 workflows optimizados

---

## 📊 ESTADO DE SINCRONIZACIÓN

| Categoría | Count | Consistencia | Estado |
| ----------- | ------- | -------------- | -------- |
| Funcionales | 5 | ✅ Consistent | Listos |
| K6 Performance | 5 | ✅ Consistent | **Listos (incluido caso00)** |
| Postman/Newman | 5 | ⏳ Review | Verificar endpoints paginado |
| Validaciones | 4 | ✅ Consistent | Listos |
| Smoke Tests | 4 | ✅ Consistent | Listos |
| Security/Quality | 5 | ⏳ Review | ConsolidableL |
| Generic/Scale | 3 | ⚠️ Duplicates | Revisar |
| **TOTAL** | **31** | **Mixed** | **Ready for Review** |

---

## 🎬 RECOMENDACIÓN FINAL

✅ **SIGUIENTE ACCIÓN**:

1. Confirmar `OPCIÓN 1`, `OPCIÓN 2` u `OPCIÓN 3` arriba
2. Una vez confirmado, procederé a:
   - Actualizar triggers y nombres consistentemente
   - Consolidar variables duplicadas en todos los workflows
   - Crear archivos `_templates` reutilizables si aplica
   - Sincronizar versiones de Node.js, k6, Playwright en todos
   - **NO COMITEAR** hasta que usuario apruebe

**Nota**: El workflow `reginsa-k6-caso00-selfhosted.yml` está listo para usar sin commits adicionales.
