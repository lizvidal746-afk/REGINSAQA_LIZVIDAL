# Imagen oficial de Microsoft con Playwright preinstalado y dependencias del SO
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

# Establecer directorio de trabajo
WORKDIR /app

# Copiar el package.json y tsconfig
COPY playwright_api/package*.json ./playwright_api/
COPY playwright_api/tsconfig.json ./playwright_api/

# Instalar dependencias
WORKDIR /app/playwright_api
RUN npm ci

# Copiar el resto del código (tests, utilidades, herramientas)
WORKDIR /app
COPY playwright_api/ ./playwright_api/
COPY tools/ ./tools/
COPY results/ ./results/

# Permisos para scripts de herramientas (opcional si es linux)
RUN chmod -R +x ./tools/

# Establecer el working directory para la ejecución
WORKDIR /app/playwright_api

# Comando por defecto: correr regresión. 
# Las credenciales se inyectarán vía GitHub Actions Secrets u orquestador.
CMD ["npx", "playwright", "test", "--config=playwright.api.config.ts", "--project=api-regression"]
