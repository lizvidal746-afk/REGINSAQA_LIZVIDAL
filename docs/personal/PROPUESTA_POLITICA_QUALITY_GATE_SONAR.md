# Propuesta de Politica Quality Gate SonarQube

Fecha: 2026-03-12
Alcance: SI091 REGINSA FRONTEND, BACKEND, ENLINEA, CONFIG

## Contexto

En SonarQube, la vista **New Code** controla calidad de cambios recientes y la vista **Overall Code** muestra deuda historica acumulada.

Recomendacion institucional: usar gate sobre New Code como control obligatorio de ingreso, y gobernar Overall Code con plan de remediacion por sprint.

## Perfil Minimo (operacion inicial)

Objetivo: no bloquear adopcion inicial y evitar introducir deuda critica nueva.

Condiciones sugeridas:

- New Bugs = 0
- New Vulnerabilities = 0
- New Security Hotspots Reviewed >= 80%

Uso recomendado:

- Inicio de adopcion.
- Equipos que recien incorporan SonarQube.

## Perfil Balanceado (recomendado)

Objetivo: controlar riesgo y mantenibilidad sin frenar entregas.

Condiciones sugeridas:

- New Bugs = 0
- New Vulnerabilities = 0
- New Security Hotspots Reviewed >= 80%
- New Code Smells <= 10
- New Duplicated Lines Density <= 3%
- New Coverage >= 60% (si existen pruebas automatizadas del repo)

Uso recomendado:

- Operacion continua en ramas principales.
- Equipos con pipeline estable y pruebas basicas.

## Perfil Estricto (madurez alta)

Objetivo: exigir estandar alto para releases y ramas criticas.

Condiciones sugeridas:

- New Bugs = 0
- New Vulnerabilities = 0
- New Security Hotspots Reviewed = 100%
- New Code Smells <= 5
- New Duplicated Lines Density <= 2%
- New Coverage >= 80%
- Reliability Rating en New Code = A
- Security Rating en New Code = A
- Maintainability Rating en New Code = A

Uso recomendado:

- Ramas de release.
- Componentes criticos o regulados.

## Politica de transicion sugerida

1. Sprint 1-2: Perfil Minimo.
2. Sprint 3-6: Perfil Balanceado.
3. Desde estabilidad comprobada: Perfil Estricto en release y Balanceado en desarrollo.

## Criterio para Overall Code

No usar Overall Code como bloqueo inmediato al inicio. En su lugar:

- Crear backlog de remediacion por severidad.
- Corregir primero vulnerabilidades y bugs de mayor impacto.
- Medir tendencia mensual de deuda tecnica.

## Verificacion operativa

- Control de paso (gate): New Code.
- Control de mejora: tendencia de Overall Code por sprint.
