FROM node:24-alpine AS base
WORKDIR /app
COPY package.json ./
COPY LICENSE ./LICENSE
COPY dist ./dist
COPY scripts ./scripts

FROM base AS test
USER root
RUN apk add --no-cache openssl
COPY test ./test
RUN npm run check && npm test

FROM base AS runtime
ENV NODE_ENV=production IVORY_HOST=0.0.0.0 PORT=5173 IVORY_UPLOADS_DIR=/app/data/uploads
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
USER node
EXPOSE 5173
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:5173/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "scripts/server.mjs"]
