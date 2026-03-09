# GUIA OWASP ZAP MANUAL/AUTENTICADO REGINSA

Esta guia complementa el baseline automatizado y sirve para cubrir flujos reales de negocio navegando manualmente REGINSA.

## 1. Cuando usar esta guia

Usar cuando necesites cobertura real sobre:

1. Flujos autenticados.
2. Modales y pasos que no aparecen por crawling automatico.
3. Acciones sensibles (crear, editar, eliminar, confirmar, buscar).

## 2. Requisitos previos

1. Docker Desktop abierto (si luego correras baseline/full por script).
2. OWASP ZAP Desktop instalado.
3. Navegador Chrome/Edge.
4. Credenciales QA de REGINSA.
5. URL objetivo QA.

## 3. Estrategia recomendada (hibrida)

1. Ejecutar baseline automatico primero.
2. Ejecutar exploracion manual autenticada con ZAP Desktop.
3. Ejecutar active scan sobre endpoints criticos descubiertos.
4. Exportar reporte y traducir resumen para equipo.

## 4. Configuracion rapida en ZAP Desktop

## 4.1 Iniciar sesion de trabajo

1. Abrir ZAP Desktop.
2. Crear nueva sesion: `File > New Session`.
3. Definir nombre: `REGINSA-QA-MANUAL-YYYYMMDD`.

## 4.2 Definir contexto

1. Ir a `Contexts`.
2. Crear contexto: `REGINSA-QA`.
3. Incluir URL regex:
   - `https://reginsaapiqa.sunedu.gob.pe.*`
4. Excluir recursos estaticos pesados si hace falta:
   - `.*\\.png$`, `.*\\.jpg$`, `.*\\.css$`, `.*\\.woff2?$`

## 4.3 Configurar autenticacion (si aplica)

Opciones recomendadas:

1. Form-based auth (si login por formulario web).
2. Script-based auth (si login via API token).
3. Header auth manual (Bearer token en requests API).

Para API con token:

1. Obtener token de QA.
2. En ZAP, agregar header `Authorization: Bearer <token>`.
3. Validar que requests autenticados devuelven 200 y no 401.

## 4.4 Usuario del contexto

1. En contexto `REGINSA-QA`, crear usuario de prueba.
2. Asociar credenciales/token.
3. Marcarlo para ejecucion de scans autenticados.

## 5. Navegacion manual guiada (coverage real)

Con navegador proxificado por ZAP, recorrer minimo:

1. Login y home.
2. Caso 02: registrar sancion completo.
3. Caso 03: reconsiderar sin sanciones.
4. Caso 04: reconsiderar con sanciones.
5. Busquedas, filtros, paginacion.
6. Edicion/eliminacion de detalle de sanciones.
7. Confirmaciones y acciones de cierre.

Objetivo: que ZAP capture todo request/response real del flujo.

## 6. Active scan focalizado

1. Desde `Sites`, seleccionar rutas criticas API capturadas.
2. Ejecutar `Attack > Active Scan` por carpeta/endpoint.
3. Priorizar:
   - endpoints de escritura (crear/editar/eliminar)
   - endpoints con parametros de busqueda
   - endpoints de autenticacion y autorizacion

## 7. Que valida realmente

OWASP ZAP manual/autenticado ayuda a detectar:

1. Inyecciones comunes (SQLi/XSS en superficie evaluable).
2. Configuraciones inseguras de headers.
3. Exposicion de informacion sensible.
4. Problemas de control de acceso en endpoints.

No reemplaza:

1. Reglas de negocio funcionales (Postman/Newman/Playwright).
2. SAST (SonarQube).
3. Analisis de dependencias (SCA).

## 8. Exportar reportes

Desde ZAP Desktop exportar:

1. HTML report.
2. JSON report.
3. Markdown summary.

Guardar en:

- `reportes/security/` (misma convencion del baseline)

## 9. Traduccion ejecutiva

Si cuentas con JSON compatible, usar:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/security/translate-zap-report.ps1 -InputJson reportes/security/zap-baseline-report.json -OutputMdEs reportes/security/zap-baseline-report.es.md
```

Nota:

- Si el archivo proviene de manual scan con otro nombre, ajusta `-InputJson` y `-OutputMdEs`.

## 10. Criterio de cierre recomendado

1. Sin hallazgos High explotables.
2. Medium con ticket y fecha comprometida.
3. Re-test obligatorio tras remediacion.
4. Evidencia cruzada: ZAP + Newman + Sonar.
