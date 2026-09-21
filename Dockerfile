# One image runs the web service and durable maintenance jobs on GCP.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN AI_PROVIDER=gemini GEMINI_API_KEY=build-only-placeholder DIRECT_DATABASE_URL=postgresql://build:build@127.0.0.1:1/build npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 8080
CMD ["sh", "-c", "npm run start -- --hostname 0.0.0.0 --port ${PORT}"]
