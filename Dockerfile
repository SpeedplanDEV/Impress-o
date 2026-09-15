# Impress-o — imagem para hospedagem (Render, Railway, VPS com Docker).
# Etapa 1: compila cliente e servidor com as dependências de desenvolvimento.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Etapa 2: só o necessário para rodar.
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3070 \
    IMPRESSO_DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# scripts/ permite "npm start" (prestart) em provedores que não usam o CMD abaixo
COPY --from=build /app/scripts ./scripts
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3070
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server/src/index.js"]
