# Imagem para publicar o site em qualquer serviço com Docker (Render, Railway, VPS, Fly.io)
FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data

# Dependências (better-sqlite3 pode precisar compilar)
COPY package.json package-lock.json ./
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && npm ci --omit=dev \
 && apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY server.js ./
COPY public ./public

# Dados (banco SQLite, chaves de notificação, log de e-mails) ficam em volume persistente
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
