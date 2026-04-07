# Guia Postman/Newman REGINSA

Validacion funcional de APIs REST por caso de negocio con colecciones versionadas.

---

## 1. Colecciones disponibles

| Coleccion | Caso | Endpoints | Archivo |
| ----------- | ------ | ----------- | --------- |
| Caso 01 | Agregar Administrado | Entidad CRUD | `reginsa-caso01-api-test.collection.json` |
| Caso 02 | Registrar Sancion | Sancion CRUD + Detalle | `reginsa-caso02-api-test.collection.json` |
| Caso 03 | Reconsiderar sin Sanciones | Reconsideracion basica | `reginsa-caso03-api-test.collection.json` |
| Caso 04 | Reconsiderar con Sanciones | Reconsideracion + Sanciones | `reginsa-caso04-api-test.collection.json` |
| Master | Todos los endpoints | Suite completa | `reginsa-master.collection.json` |
| Filtros/Operacion | Filtros + operaciones | Buscar, filtrar, paginar | `reginsa-flow-filtros-operacion.json` |
| Regresion | Flujo completo | End-to-end API | `reginsa-flow-regresion.json` |
| Login Punku | Autenticacion | Obtener token SSO | `reginsa-login-punku.collection.json` |

Ubicacion: `API_TEST/postman/`

Ambiente compartido: `reginsa-shared.environment.json`

---

## 2. Ejecucion por caso

```bash
npm run api:test:caso01
npm run api:test:caso02
npm run api:test:caso03
npm run api:test:caso04
```

### Suite completa

```bash
npm run api:test:all
```

### Master (todos los endpoints)

```bash
npm run api:test:master
```

### Con autenticacion automatica (recomendado)

```bash
npm run api:test:all:autoauth
npm run api:test:all:autoauth:pool   # Usa pool de credenciales
```

---

## 3. Newman completo (reportes avanzados)

Los scripts `newman:*` generan reportes mas detallados:

```bash
npm run newman:01     # Caso 01 con reportes completos
npm run newman:02     # Caso 02
npm run newman:03     # Caso 03
npm run newman:04     # Caso 04
npm run newman:all    # Todos
npm run newman:master # Master collection
```

### Con rate-limit testing

```bash
npm run api:individual:con-limites    # Espera throttling
npm run api:individual:sin-limites    # Exige 100% ok
```

### Por ambiente

```bash
npm run newman:prod    # Ambiente produccion
npm run newman:local   # Ambiente local
```

---

## 4. Reportes

Salida automatica en `reportes/newman/`:

| Formato | Archivo | Uso |
| --------- | --------- | ----- |
| XML (JUnit) | `caso01-api-test.xml` | Integracion CI/CD |
| JSON | `caso01-api-test.json` | Procesamiento programatico |
| CLI | Consola | Verificacion rapida |

---

## 5. Crear nuevos tests en Postman

1. Abrir Postman Desktop (gratis).
2. Importar la coleccion del caso correspondiente.
3. Duplicar un request existente como plantilla.
4. Configurar:
   - URL: usar variables de entorno (`{{baseUrl}}/api/...`)
   - Headers: `Authorization: Bearer {{token}}`
   - Body: JSON con datos del caso
5. Agregar assertions en la pestana **Tests**:

```javascript
pm.test("Status 200", function () {
  pm.response.to.have.status(200);
});

pm.test("Respuesta tiene data", function () {
  var json = pm.response.json();
  pm.expect(json.data).to.not.be.null;
});
```

1. Exportar coleccion como JSON v2.1.
2. Copiar a `API_TEST/postman/`.
3. Agregar script npm si es nuevo flujo.

---

## 6. Variables de ambiente

El archivo `reginsa-shared.environment.json` contiene:

| Variable | Descripcion |
| ---------- | ------------ |
| `baseUrl` | URL base de la API |
| `token` | Bearer token para autenticacion |
| `userId` | ID usuario para requests |

Para produccion: crear un environment separado o usar `--env prod`.

---

## 7. Integracion CI/CD

### GitHub Actions

Workflows dedicados por caso, delegando al reusable:

```text
reginsa-postman-caso01-selfhosted.yml → reusable-postman-caso-selfhosted.yml
reginsa-postman-caso02-selfhosted.yml → reusable-postman-caso-selfhosted.yml
reginsa-postman-caso03-selfhosted.yml → reusable-postman-caso-selfhosted.yml
reginsa-postman-caso04-selfhosted.yml → reusable-postman-caso-selfhosted.yml
```

Suite consolidada: `reginsa-postman-selfhosted.yml`

### Artefactos CI

- Reportes XML y JSON publicados como artifacts.
- Secretos por entorno en runner self-hosted.

---

## 8. Buenas practicas

- Mantener ambiente compartido estable en el repositorio.
- No hardcodear credenciales en colecciones.
- Alinear endpoints con el Swagger QA vigente del proveedor.
- Versionar colecciones JSON en git tras cada cambio.
- Usar `pre-request scripts` para datos dinamicos (timestamps, IDs aleatorios).
