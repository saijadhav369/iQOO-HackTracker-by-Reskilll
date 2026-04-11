FROM node:18-alpine

RUN npm install -g pnpm

WORKDIR /app

# Copy web project files
COPY web/package.json web/pnpm-lock.yaml ./
COPY web/pnpm-workspace.yaml* ./

# Install deps
RUN pnpm install --frozen-lockfile

# Copy source
COPY web/ ./

# Build
RUN pnpm build

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production

CMD ["pnpm", "start"]
