# syntax=docker/dockerfile:1

FROM oven/bun:1.3.14-slim AS base
WORKDIR /repo

FROM base AS build
ENV DOCKER_BUILD=1
COPY . .
RUN bun install --frozen-lockfile
# Next collects page data by executing route modules (e.g. auth routes touch
# the Prisma client at import time), so build needs *some* value for
# required env vars even though nothing is queried yet. Real values come from
# docker-compose/.env at runtime and override these placeholders.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
	BETTER_AUTH_SECRET="build-time-placeholder-not-used-at-runtime" \
	AI_KEYS_ENCRYPTION_SECRET="build-time-placeholder-not-used-at-runtime"
# Build directly with next rather than the "build" package script, whose
# prebuild hook runs the full unit test suite — that belongs in CI, not
# image builds, and shouldn't block producing a container.
RUN cd apps/web && bunx next build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo

COPY --from=build /repo/prisma ./prisma
COPY --from=build /repo/prisma.config.ts ./prisma.config.ts
COPY --from=build /repo/apps/web/src/lib/database-url.ts ./apps/web/src/lib/database-url.ts
# Prisma's CLI resolves engine binaries through hoisted transitive deps
# (node_modules/.bin -> node_modules/.bun -> ...) whose exact layout isn't
# worth hand-picking, so bring the whole tree rather than cherry-pick.
COPY --from=build /repo/node_modules ./node_modules

COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["bun", "apps/web/server.js"]
