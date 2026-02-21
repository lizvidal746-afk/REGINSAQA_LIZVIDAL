# Checklist operativo: Runner self-hosted (Windows) REGINSA

Uso: guía corta para ejecutar la configuración sin pasos de contexto.

---

## 1) GitHub (obtener comandos y token)

1. Repo: `lizvidal746-afk/REGINSAQA_LIZVIDAL`
2. `Settings` > `Actions` > `Runners`
3. `New self-hosted runner`
4. Seleccionar `Windows` + `x64`
5. Copiar bloques `Download` y `Configure`

---

## 2) PowerShell (Administrador)

Abrir **PowerShell como administrador** y ejecutar:

```powershell
mkdir C:\actions-runner
cd C:\actions-runner
```

Pegar bloque `Download` de GitHub (completo).

Pegar bloque `Configure` de GitHub con token real, ejemplo:

```powershell
.\config.cmd --url https://github.com/lizvidal746-afk/REGINSAQA_LIZVIDAL --token TOKEN_REAL
```

Reglas rápidas:

- Usar `\.\config.cmd` (no `config.cmd` solo).
- No usar `<TOKEN>` con símbolos `<` `>`.
- Si el token falla por expiración, regenerarlo en GitHub.

---

## 3) Respuestas en `config.cmd`

- Runner group: `Enter` (Default)
- Runner name: `reginsa-sunedu-runner`
- Additional labels: `reginsa,sunedu` (sin espacios)
- Work folder: `Enter` (`_work`)
- Run as service: `Y`
- User account service: `Enter` (por defecto)

---

## 4) Servicio y validación

```powershell
.\svc install
.\svc start
Get-Service actions.runner*
```

Estado esperado: `Running`.

En GitHub > `Settings` > `Actions` > `Runners`:

- Runner en estado `Online`.

---

## 5) Ejecutar pipeline

1. Ir a `Actions`
2. Abrir `REGINSA Functional Scale (Self-hosted)`
3. `Run workflow`
4. Smoke recomendado:
   - `workers=2`
   - `repeat_each=2`
   - `pool_target=20`
   - `install_browser=false`
   - `prepare_data=false`

Si hay runs antiguos en cola, cancelarlos y lanzar uno nuevo.

Para ejecución completa/masiva:

- `install_browser=true` (solo cuando toque actualizar navegador)
- `prepare_data=true` (cuando sí quieras reset + prewarm)

---

## 6) Troubleshooting exprés

- `Waiting for a runner...`: no hay runner online con labels compatibles.
- `config.cmd no se reconoce`: usar `\.\config.cmd`.
- `Label ' sunedu' is not valid`: quitar espacios, usar `reginsa,sunedu`.
- Runner offline: revisar/levantar servicio `actions.runner*`.
- `PSSecurityException` en `npm ci`: usar `shell cmd` en el workflow para pasos `run`/`npm`.
- `PSSecurityException` en validación de credenciales: evitar pasos con `pwsh/powershell`; usar validación en `cmd`.
