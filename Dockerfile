FROM node:18-alpine

RUN npm install -g pnpm

WORKDIR /app

# Copy and install
COPY web/ ./web/
WORKDIR /app/web
RUN pnpm install --frozen-lockfile

# Build
RUN pnpm build

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production

CMD ["pnpm", "start"]
