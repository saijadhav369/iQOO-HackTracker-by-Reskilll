FROM node:22-alpine

RUN npm install -g pnpm

WORKDIR /app

# Copy web project files
COPY web/ ./web/
WORKDIR /app/web
RUN pnpm install --frozen-lockfile

# Build — needs DATABASE_URL at build time for schema validation
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
RUN pnpm build

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production

CMD ["pnpm", "start"]
