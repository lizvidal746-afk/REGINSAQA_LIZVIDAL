# Guía: configuración de runner self-hosted (Windows) para REGINSA

## 1) Objetivo

Esta guía documenta, paso a paso, cómo registrar un runner self-hosted en GitHub para ejecutar pipelines REGINSA dentro de red interna SUNEDU.

Se usa cuando un runner público no puede resolver la URL interna (por ejemplo, `ERR_NAME_NOT_RESOLVED`).

---

## 2) Dónde encontrar cada opción en GitHub

En el repositorio objetivo (ejemplo: `lizvidal746-afk/REGINSAQA_LIZVIDAL`):

1. Entrar a **Settings**.
2. Menú izquierdo: **Actions** > **Runners**.
3. Clic en **New self-hosted runner**.
4. Seleccionar:
    - Runner image: **Windows**
    - Architecture: **x64**
5. En la misma pantalla verás bloques con títulos:
    - **Download**
    - **Configure**
    - **Using your self-hosted runner**

El token que necesitas está en el bloque **Configure**, dentro del comando `config.cmd`.

---

## 3) Ejecutar en PowerShell como administrador

### 3.1 Abrir terminal correcta

1. En Windows, buscar **PowerShell**.
2. Clic derecho > **Run as administrator / Ejecutar como administrador**.

### 3.2 Crear carpeta del runner

```powershell
mkdir C:\actions-runner
cd C:\actions-runner
```

### 3.3 Ejecutar bloque Download (copiar desde GitHub)

Copiar y pegar el bloque **Download** de la UI de GitHub.

Ejemplo típico:

```powershell
Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v2.331.0/actions-runner-win-x64-2.331.0.zip -OutFile actions-runner-win-x64-2.331.0.zip
if((Get-FileHash -Path actions-runner-win-x64-2.331.0.zip -Algorithm SHA256).Hash.ToUpper() -ne '473e74b86cd826e073f1c1f2c004d3fb9e6c9665d0d51710a23e5084a601c78a'.ToUpper()){ throw 'Computed checksum did not match' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory("$PWD/actions-runner-win-x64-2.331.0.zip", "$PWD")
```

### 3.4 Ejecutar bloque Configure (copiar desde GitHub)

Usar el comando con `\.\config.cmd` y token real.

Ejemplo:

```powershell
.\config.cmd --url https://github.com/lizvidal746-afk/REGINSAQA_LIZVIDAL --token TOKEN_REAL_DE_GITHUB
```

Importante:

- No escribir `config.cmd` solo; usar `\.\config.cmd`.
- No poner `<` ni `>` en el token.
- Si el token expira, volver a **New self-hosted runner** y copiar uno nuevo.

### 3.5 Responder preguntas interactivas

Cuando el asistente pregunte:

- `Enter the name of runner group` -> presionar **Enter** (Default)
- `Enter the name of runner` -> `reginsa-sunedu-runner`
- `Enter any additional labels` -> `reginsa,sunedu` (sin espacios)
- `Enter name of work folder` -> presionar **Enter** (`_work`)
- `Would you like to run the runner as service?` -> `Y`
- `User account to use for the service` -> presionar **Enter** (cuenta por defecto)

Si aparece error de label inválido, revisar que no tenga espacios al inicio/fin (ejemplo incorrecto: `reginsa, sunedu`).

---

## 4) Confirmar que el servicio quedó activo

Al finalizar configuración, validar en PowerShell:

```powershell
Get-Service actions.runner*
```

Debe mostrarse en estado `Running`.

Si necesitas reiniciar manualmente:

```powershell
.\svc install
.\svc start
```

---

## 5) Verificar en GitHub (online)

Volver a:

- **Settings** > **Actions** > **Runners**

Validar que el runner aparezca:

- **Online**
- Con labels base: `self-hosted`, `Windows`, `X64`
- Y labels adicionales (si se agregaron): `reginsa`, `sunedu`

---

## 6) Ejecutar workflow self-hosted

Workflow objetivo:

- `.github/workflows/reginsa-funcional-selfhosted.yml`

Pasos:

1. Ir a **Actions**.
2. Abrir **REGINSA Functional Scale (Self-hosted)**.
3. Clic en **Run workflow**.
4. Cargar parámetros de prueba (smoke recomendado):
    - `workers=2`
    - `repeat_each=2`
    - `pool_target=20`
5. Ejecutar.

Si había un job viejo en cola desde antes del runner, cancelarlo y lanzar uno nuevo.

---

## 7) Secrets requeridos

En **Settings** > **Secrets and variables** > **Actions**, definir:

- `REGINSA_URL`
- `REGINSA_USER_1` ... `REGINSA_USER_6`
- `REGINSA_PASS_1` ... `REGINSA_PASS_6`

Opcional:

- `REGINSA_USER`
- `REGINSA_PASS`

---

## 8) Problemas frecuentes y solución

- `Waiting for a runner to pick up this job...`
- No hay runner online con labels compatibles.
- `config.cmd no se reconoce`
- Ejecutar con `\.\config.cmd`.
- `El operador '<' está reservado...`
- Se escribió `<TOKEN>` literal; usar token real sin `<` `>`.
- `Label ' sunedu' is not valid`
- Quitar espacios: usar `reginsa,sunedu`.
- Runner aparece offline
- Revisar servicio con `Get-Service actions.runner*` y levantarlo.
- Error en `Install dependencies` con `PSSecurityException` / `UnauthorizedAccess`
- Causa: política de ejecución de PowerShell del host bloquea scripts temporales.
- Solución aplicada en este repo: en el workflow self-hosted se usa `cmd` por defecto para pasos `run`.
- Si persiste en otro workflow, configurar `defaults.run.shell: cmd` o fijar `shell: cmd` en los pasos `npm`.

---

## 9) Seguridad operativa

- El token de registro de runner es temporal y sensible.
- Si se expone en captura/chat, regenerarlo de inmediato desde **New self-hosted runner**.
- Evitar publicar logs con secretos o credenciales.
