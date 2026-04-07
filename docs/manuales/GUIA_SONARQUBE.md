# Guia SonarQube REGINSA

## 1. Objetivo

Analizar calidad y deuda tecnica de:

- frontend
- backend
- enlinea

Script canonico:

- scripts/security/escanear-repos-sonar.ps1

## 2. Levantar SonarQube con Docker

```bash
docker compose -f sonar/docker-compose.yml up -d
```

Validar acceso:

- http://localhost:9000

## 3. Ejecutar analisis

```bash
npm run test:sonar:repos
```

Por repositorio:

```bash
npm run test:sonar:repos:frontend
npm run test:sonar:repos:backend
npm run test:sonar:repos:enlinea
```

Reportes:

```bash
npm run report:sonar:dated
npm run report:sonar:issues
npm run report:sonar:accionable
```

## 4. Interpretar dashboard

Revisar:

- Bugs
- Vulnerabilities
- Code Smells
- Coverage
- Duplications

## 5. Quality Gates

- Definir umbrales minimos por proyecto.
- Fallar pipeline si gate no pasa.
- Usar workflow de gate consolidado para veredicto final.

## 6. Buenas practicas

- Ejecutar escaneo desde raiz REGINSA.
- No versionar .scannerwork.
- Mantener project keys estables.
