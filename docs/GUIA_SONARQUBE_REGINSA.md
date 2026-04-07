# GUIA SONARQUBE REGINSA

## Estado del documento

Este documento queda en estado **deprecado** para evitar duplicidad.

Guia canonica vigente:

- `docs/manuales/GUIA_SONARQUBE.md`

Uso recomendado:

1. Seguir la guia canonica para ejecucion operativa.
2. Mantener este archivo solo como referencia historica.

Documento exclusivo para analisis estatico de codigo (SAST) con SonarQube.

## 1. Objetivo

Evaluar calidad de codigo, mantenibilidad, code smells, vulnerabilidades y hotspots de seguridad en el repositorio REGINSA.

## 2. Configuracion actual en repo

Archivos usados:

- `sonar-project.properties`
- `pipelines/azure/azure-pipelines-enterprise.yml`
- `pipelines/jenkins/Jenkinsfile`
- `package.json` (script `test:sonar`)

Parametros principales (`sonar-project.properties`):

- `sonar.projectKey=reginsa-qa-framework`
- `sonar.sources=tests,core,scripts`
- `sonar.tests=tests`
- `sonar.test.inclusions=tests/**/*.spec.ts`

## 3. Ejecucion por pipeline (recomendada)

Pipelines vigentes:

- Azure DevOps: stage `SonarQubeAnalysis` en `pipelines/azure/azure-pipelines-enterprise.yml`.
- Jenkins: parametro `RUN_SONAR=true` en `pipelines/jenkins/Jenkinsfile`.

Inputs requeridos:

- `sonar_host_url` (ej: `https://sonar.mi-entidad.gob.pe`)
- `sonar_token` (token de usuario/proyecto SonarQube)

Salida esperada:

1. Job `sonarqube` exitoso.
2. Resultado visible en dashboard SonarQube del proyecto.

## 4. Ejecucion por terminal local

Pre requisitos:

### 1. Tener acceso a servidor SonarQube: acceso

### 2. Definir variables de entorno: variables

```powershell
$env:SONAR_HOST_URL="https://sonar.mi-entidad.gob.pe"
$env:SONAR_TOKEN="TU_TOKEN"
```

### 3. Instalar dependencias si aun no estan: dependencias

```powershell
npm ci
```

### 4. Ejecutar analisis: analisis

```powershell
npm run test:sonar
```

Nota:

- El script usa `sonar-scanner` (ya declarado en `devDependencies`).

## 5. Requisitos de plataforma

Para SonarQube (este repo):

- No necesitas Docker Desktop para ejecutar `sonar-scanner` local.
- Si usas instancia SonarQube propia en contenedor, Docker aplica del lado servidor, no necesariamente del cliente.

## 5.1 Que debes tener abierto

Para ejecutar Sonar localmente:

1. Terminal en `d:\SUNEDU\AUTOMATIZACION\REGINSA`.
2. Acceso web al servidor SonarQube (para revisar resultados).
3. No es obligatorio abrir Docker Desktop para `sonar-scanner` cliente.

## 5.2 Checklist de ejecucion rapida

```powershell
npm ci
$env:SONAR_HOST_URL="https://sonar.mi-entidad.gob.pe"
$env:SONAR_TOKEN="TU_TOKEN"
npm run test:sonar
```

Validacion final:

1. Job/scan sin errores en terminal.
2. Proyecto visible en SonarQube.
3. Quality Gate evaluado.

## 6. Interpretacion de resultados

Revisar en SonarQube:

1. Quality Gate (pass/fail).
2. Vulnerabilities y Security Hotspots.
3. Code Smells y Deuda Tecnica.
4. Coverage (si esta configurada en pipeline futuro).

## 7. Recomendacion operativa

1. Ejecutar Sonar en cada release candidate.
2. Bloquear promocion si Quality Gate falla por vulnerabilidades High/Critical.
3. Adjuntar URL del analisis Sonar en Jira/Confluence junto con evidencias Newman y OWASP.
