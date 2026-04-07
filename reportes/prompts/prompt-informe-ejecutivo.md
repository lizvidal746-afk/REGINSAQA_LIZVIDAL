# PROMPT EJECUTIVO QA — REGINSA

## Autora: Liz Vidal | Sistema: REGINSA | Estándares: ISTQB · ISO/IEC 25010 · NTP ISO/IEC 12207

## ¿Cómo usar este prompt?

1. Abre [Perplexity](https://www.perplexity.ai) o ChatGPT
2. Copia el PROMPT COMPLETO (desde la linea de guiones)
3. Pega el contenido del archivo `reportes/informes/hallazgos-consolidados-YYYY-MM-DD.json`
   donde dice `[PEGAR JSON AQUÍ]`
4. Envía — obtendrás el análisis ejecutivo completo en minutos

---

## PROMPT COMPLETO — COPIAR DESDE AQUÍ

Eres un consultor senior de Calidad de Software, certificado ISTQB nivel Avanzado,
con especialización en ISO/IEC 25010, ISO/IEC 25000 y NTP ISO/IEC 12207.
Asesoras al equipo de desarrollo del Sistema REGINSA (Registro Nacional de Sanciones a Docentes
del Ministerio de Educación del Perú / SUNEDU).

DATOS DEL INFORME:

- Sistema:  REGINSA
- Autora:   Liz Vidal
- Área:     Aseguramiento de Calidad de Software
- Fecha:    [FECHA ACTUAL - reemplazar]
- Ciclo:    [SPRINT / MES - reemplazar]
- Estándares aplicados: ISTQB · ISO/IEC 25010 · NTP ISO/IEC 12207

DATOS DE HALLAZGOS (pegar el contenido JSON):
[PEGAR JSON AQUÍ — contenido de hallazgos-consolidados-YYYY-MM-DD.json]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GENERA EL SIGUIENTE INFORME EJECUTIVO ESTRUCTURADO:

── 1. RESUMEN EJECUTIVO (para gerencia no técnica, máx 250 palabras) ──────────

- Estado general con semáforo: 🔴 CRÍTICO / 🟡 ADVERTENCIA / 🟢 ACEPTABLE
- 1 párrafo de conclusión clara en lenguaje de negocio
- TOP 3 hallazgos que requieren atención INMEDIATA (sin tecnicismos)
- TOP 3 fortalezas identificadas en el sistema

── 2. ANÁLISIS POR CARACTERÍSTICA ISO/IEC 25010 ──────────────────────────────

Para cada característica aplica y documenta solo las que tienen hallazgos:
Funcionalidad | Rendimiento | Seguridad | Usabilidad | Mantenibilidad | Fiabilidad

Por cada característica incluir:

- Estado actual: 🔴 / 🟡 / 🟢
- Descripción en 2-3 oraciones
- Hallazgos específicos (IDs del JSON)
- Tendencia respecto al ciclo anterior (si hay info histórica: ↑ mejora / ↓ empeora / → estable)
- 1 recomendación concreta con esfuerzo estimado en horas

── 3. TABLA DE HALLAZGOS DETALLADA ───────────────────────────────────────────

Formato MARKDOWN con columnas:
| ID | Herramienta | Hallazgo | Significado (lenguaje claro) | Impacto Negocio | Severidad | Responsable | Recomendación Accionable | Esfuerzo (h) |

Reglas:

- Severidad en MAYÚSCULAS: CRÍTICA / ALTA / MEDIA / BAJA
- "Significado" debe ser comprensible para un analista funcional, no un programador
- "Impacto Negocio" explica la consecuencia para el usuario o la institución
- Ordenar: CRÍTICA → ALTA → MEDIA → BAJA
- Para hallazgos de seguridad: incluir el tipo de vulnerabilidad (OWASP Top 10 si aplica)

── 4. TOP 5 RIESGOS PARA EL NEGOCIO ──────────────────────────────────────────

Tabla con:
| # | Riesgo | Probabilidad (Alta/Media/Baja) | Impacto (Alto/Medio/Bajo) | Plan de Mitigación | Responsable |

── 5. PLAN DE ACCIÓN RECOMENDADO ─────────────────────────────────────────────

Tabla con:
| Prioridad | Acción Específica | Responsable Sugerido | Sprint/Plazo | Criterio de Éxito | Esfuerzo (h) |

Prioridades:
🔴 INMEDIATA — resolver antes del próximo deploy
🟠 ALTA — resolver en el sprint siguiente
🟡 MEDIA — planificar en los próximos 2 sprints
🟢 BAJA — incluir en el backlog de mejoras

── 6. CONCLUSIONES Y RECOMENDACIONES ESTRATÉGICAS ─────────────────────────────

- Conclusión general del ciclo (2-3 párrafos)
- ¿El sistema está listo para producción? Justificar con los hallazgos
- 3 recomendaciones estratégicas de largo plazo para mejorar la calidad del sistema
- ¿Qué tipo de prueba agregar o fortalecer en el siguiente ciclo?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FORMATO DE SALIDA:

- Markdown estructurado con tablas
- Idioma: Español formal técnico
- Listo para copiar y pegar en Word o Confluence
- Incluir sección de firma al final:

---
Elaborado por: Liz Vidal

Área: Aseguramiento de Calidad de Software

Sistema: REGINSA

Fecha: [FECHA]

Estándares: ISTQB · ISO/IEC 25010 · NTP ISO/IEC 12207

---
---

## VARIANTES DEL PROMPT

### Solo Seguridad (para el área de seguridad / DevOps)

Modificar el bloque 3 con:
> "Enfócate ÚNICAMENTE en los hallazgos de tipo Seguridad (herramientas OWASP ZAP,
> SonarQube, Trivy, Gitleaks, Semgrep, CodeQL, Dependency Check). Para cada hallazgo
> de seguridad indica si corresponde a alguna categoría del OWASP Top 10 2021."

### Solo Performance (para el área de arquitectura)

Modificar el bloque 3 con:
> "Enfócate ÚNICAMENTE en los hallazgos de Performance (k6) y Accesibilidad (Lighthouse).
> Indica umbrales concretos, porcentaje de cumplimiento y recomendaciones de optimización
> específicas (cache, índices de BD, CDN, lazy loading, etc.)"

### Resumen para Gerencia (no técnico, 1 página)

Reemplazar todo con:
> "Con base en estos hallazgos QA del sistema REGINSA, genera un resumen ejecutivo
> en lenguaje de negocio NO técnico, máximo 400 palabras, para presentar a un
> director o gerente que no conoce de tecnología. Usa el semáforo 🔴🟡🟢.
> Explica qué significa cada hallazgo en términos de riesgo para la institución."

---

## COMANDOS PARA GENERAR EL JSON BASE

```powershell
# Todo el ciclo completo
npm run report:extraer

# Solo seguridad
npm run report:extraer:seguridad

# Solo performance
npm run report:extraer:performance

# Solo funcional
npm run report:extraer:funcional

# Todo + generar Word + Excel en un comando
npm run report:completo
```

El archivo JSON se guarda en: `reportes/informes/hallazgos-consolidados-YYYY-MM-DD.json`
