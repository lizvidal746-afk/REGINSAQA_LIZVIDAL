# Guía: Self-hosted runner para REGINSA (GitHub Actions)

## 1) Qué resuelve

Cuando la URL de REGINSA es interna (red SUNEDU), el runner público de GitHub no puede resolver el dominio (`ERR_NAME_NOT_RESOLVED`).

Solución:

- Ejecutar el workflow en un runner **self-hosted** dentro de la red SUNEDU (o conectado por VPN institucional).

---

## 2) Resultado esperado

Seguirás ejecutando desde la misma UI de GitHub Actions, pero el job correrá en tu máquina interna.

Workflow recomendado para este caso:

- `.github/workflows/reginsa-funcional-selfhosted.yml`

---

## 3) Crear runner self-hosted (paso a paso)

Ruta en GitHub:

1. Repo `REGINSAQA_LIZVIDAL`.
2. **Settings** > **Actions** > **Runners**.
3. **New self-hosted runner**.
4. Elegir sistema: **Windows**.
5. Copiar los comandos que muestra GitHub.

En tu máquina SUNEDU (PowerShell), ejecutar esos comandos en una carpeta dedicada, por ejemplo:

```powershell
mkdir C:\actions-runner
cd C:\actions-runner
```

Luego ejecutar los comandos que te da GitHub (download + config).

Durante `config.cmd`, usar estos valores:

- Runner name: `reginsa-sunedu-runner`
- Labels: `self-hosted,windows,reginsa,sunedu`

Después:

```powershell
./run.cmd
```

Para dejarlo persistente como servicio (recomendado):

```powershell
./svc install
./svc start
```

---

## 4) Verificar runner en línea

En GitHub > Settings > Actions > Runners:

- Debe aparecer **Online**.
- Debe mostrar label `windows` (y los personalizados si los agregaste).

---

## 5) Ejecutar pipeline self-hosted

Ruta:

1. **Actions**.
2. Workflow **REGINSA Functional Scale (Self-hosted)**.
3. **Run workflow**.
4. Completar:
   - `workers`
   - `repeat_each`
   - `pool_target`
5. Ejecutar.

Ejemplos:

- 10 registros: `workers=6`, `repeat_each=10`, `pool_target=360`
- 30 registros: `workers=6`, `repeat_each=30`, `pool_target=1080`
- 50 registros: `workers=6`, `repeat_each=50`, `pool_target=1800`

---

## 6) Secrets obligatorios

En el repo donde correrás el workflow (`personal` y/o `sunedu`), crear:

- `REGINSA_URL`
- `REGINSA_USER_1..6`
- `REGINSA_PASS_1..6`

Opcional:

- `REGINSA_USER`
- `REGINSA_PASS`

---

## 7) Troubleshooting rápido

- **Runner offline**: iniciar servicio `actions.runner.*` en Windows.
- **No encuentra workflow self-hosted**: confirmar push a `main`.
- **Sin credenciales**: revisar nombres exactos de Secrets.
- **URL no resuelve**: validar que la máquina runner realmente navega a `REGINSA_URL`.

---

## 8) Cuándo pedir apoyo de Infra

Pide apoyo si necesitas:

- host dedicado permanente para runner,
- apertura de puertos/proxy corporativo,
- instalación con cuenta de servicio institucional,
- hardening y monitoreo del runner.
