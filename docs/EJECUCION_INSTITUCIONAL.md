# Ejecución Institucional

## Requisitos

- Node.js 20+
- Playwright dependencies
- Variables de entorno configuradas (`.env`)

## Comandos

- Smoke: `npm run test:smoke`
- Functional: `npm run test:functional:suite`
- Regression: `npm run test:regression`
- Performance: `npm run test:performance`
- Security: `npm run test:security`

## Escalamiento

Ejemplo: `npm run test:02:scale -- --workers=5 --repeat-each=5 --project=chromium`
