---
# Auto-generado por init-claude
name: docker-optimization
description: Imagenes Docker pequeñas, rapidas y seguras. Usar al escribir Dockerfiles.
---
Multi-stage: build en una etapa (con toolchain), copia solo el artefacto a una imagen final minima (distroless/alpine/slim). La imagen de prod no lleva compiladores ni dev deps.
Cache de capas: ordena de menos a mas cambiante. Copia manifest e instala deps ANTES de copiar el codigo (`COPY package*.json . && npm ci` luego `COPY . .`) para no reinstalar en cada cambio de fuente. `.dockerignore` (node_modules, .git, tests, secretos).
Seguridad: usuario no-root (`USER`), imagen base pinada por digest, sin secretos en capas ni en ENV (usa build secrets/runtime). Escanea (trivy/scout). Minimiza paquetes y superficie.
Reproducible: versiones fijas, `npm ci` no `install`. Un proceso por contenedor, PID 1 que maneje señales (exec form `CMD ["..."]`). HEALTHCHECK. Etiqueta por version, no solo `latest`.
Antes de entregar: la imagen arranca, es lo mas pequeña razonable y no corre como root.
