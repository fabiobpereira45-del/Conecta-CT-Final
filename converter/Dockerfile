FROM node:20-slim

# LibreOffice em modo headless converte HTML -> DOCX com fidelidade real de CSS
# (justificação, line-height, tabelas, cabeçalho de página) — bem diferente do
# html-docx-js usado antes no navegador.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./

EXPOSE 8080
CMD ["node", "server.js"]
