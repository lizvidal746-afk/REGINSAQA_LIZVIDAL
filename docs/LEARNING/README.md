# REGINSA LEARNING GUIDE

Guía completa (principiante a experto) para construir, ejecutar y evolucionar este framework QA.

## 1. ¿Qué hace cada bloque?

- `tests/casos-prueba`: casos legacy actualmente operativos.
- `tests/smoke|functional|regression`: organización objetivo por tipo de prueba.
- `core/config`: configuración centralizada.
- `core/security`: validación de secretos/pool de usuarios.
- `tests/performance/k6`: pruebas de carga.
- `tests/security/zap`: escaneo de seguridad.
- `pipelines/*`: CI/CD multiplataforma.

## 2. Crear proyecto desde cero (enfoque recomendado)

1. Inicializa Node + Playwright.
2. Crea `.env` desde `.env.example`.
3. Define slots de credenciales (`REGINSA_USER_1..8`, `REGINSA_PASS_1..8`).
4. Ejecuta `npm ci`.
5. Ejecuta smoke: `npm run test:smoke`.
6. Ejecuta funcional: `npm run test:functional:suite`.

## 3. Comandos clave

- `npm run test:01`, `npm run test:02`, `npm run test:03`, `npm run test:04`
- `npm run test:02:scale -- --workers=5 --repeat-each=5 --project=chromium`
- `npm run report:html`
- `npm run report:allure:generate`
- `npm run test:performance`
- `npm run test:security`

## 4. Buenas prácticas

- Evita `waitForTimeout` salvo fallback controlado.
- Prefiere verificación por API/estado real de persistencia.
- No hardcodear credenciales.
- Mantén trazabilidad por worker y run-id.
- Separa lógica de negocio (services) de scripts de test.

## 5. Ejemplo rápido de operación profesional

1. `npm run clean:run`
2. `npm run test:smoke`
3. `npm run test:functional:suite -- --workers=4 --repeat-each=2`
4. `npm run test:performance`
5. `npm run test:security`
6. Publica reportes HTML + Allure + k6 + ZAP
