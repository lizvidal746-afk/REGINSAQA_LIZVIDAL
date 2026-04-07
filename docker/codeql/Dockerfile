# ─────────────────────────────────────────────────────────────
# Imagen Docker para CodeQL CLI — analisis SAST local
#
# Incluye el CodeQL CLI de GitHub para analizar codigo
# JavaScript/TypeScript sin instalar nada en el host.
#
# USO:
#   # Construir una sola vez:
#   docker build -t reginsa-codeql docker/codeql/
#
#   # El script run-codeql.ps1 hace esto automaticamente.
#
# DETALLES:
#   - Descarga el CLI desde github/codeql-cli-binaries
#   - Los query packs (ql) se descargan en el primer analisis
#     y se cachean en el volumen montado en /root/.codeql
#   - Arquitectura: linux/amd64 (compatible con Docker Desktop Windows/Mac)
# ─────────────────────────────────────────────────────────────

FROM ubuntu:22.04

ARG CODEQL_VERSION=2.19.3

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      unzip \
      git \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Descargar CodeQL CLI (binarios Linux x64)
# https://github.com/github/codeql-cli-binaries/releases
RUN curl -fsSL \
      "https://github.com/github/codeql-cli-binaries/releases/download/v${CODEQL_VERSION}/codeql-linux64.zip" \
      -o /tmp/codeql.zip \
    && unzip -q /tmp/codeql.zip -d /opt \
    && rm /tmp/codeql.zip

ENV PATH="/opt/codeql:$PATH"

# El workspace del proyecto se monta en /workspace
# Los resultados se escriben en /output
# Los packs se cachean en /root/.codeql/packages (montar para persistencia)
WORKDIR /workspace

ENTRYPOINT ["codeql"]
CMD ["version"]
