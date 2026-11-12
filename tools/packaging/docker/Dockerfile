# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.4.2
ARG NODE_VERSION=24
ARG WASM_BINDGEN_VERSION=0.2.126

FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS node

FROM --platform=$BUILDPLATFORM debian:trixie-slim AS build
ARG BUN_VERSION
ARG WASM_BINDGEN_VERSION
ARG BUILDARCH

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential ca-certificates clang curl git pkg-config unzip \
 && rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node

RUN case "$BUILDARCH" in \
      amd64) bun_asset=bun-linux-x64; bindgen_target=x86_64-unknown-linux-musl ;; \
      arm64) bun_asset=bun-linux-aarch64; bindgen_target=aarch64-unknown-linux-musl ;; \
      *) echo "unsupported build architecture: $BUILDARCH" >&2; exit 1 ;; \
    esac \
 && curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/${bun_asset}.zip" -o /tmp/bun.zip \
 && unzip -q /tmp/bun.zip -d /tmp \
 && install -m 0755 "/tmp/${bun_asset}/bun" /usr/local/bin/bun \
 && curl -fsSL "https://github.com/rustwasm/wasm-bindgen/releases/download/${WASM_BINDGEN_VERSION}/wasm-bindgen-${WASM_BINDGEN_VERSION}-${bindgen_target}.tar.gz" \
    | tar -xz --strip-components=1 -C /usr/local/bin "wasm-bindgen-${WASM_BINDGEN_VERSION}-${bindgen_target}/wasm-bindgen" \
 && rm -rf /tmp/bun.zip "/tmp/${bun_asset}"

ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo PATH=/opt/cargo/bin:$PATH
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain none

WORKDIR /src
COPY . .

RUN rustup show active-toolchain
RUN --mount=type=cache,target=/opt/cargo/registry \
    --mount=type=cache,target=/opt/cargo/git \
    ./tools/scripts/build-browser-wasm.sh
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile
RUN cd apps/workspace && SKRIUW_WEB_BASE=/ bun run vite build

FROM caddy:2-alpine
LABEL org.opencontainers.image.title="Skriuw" \
      org.opencontainers.image.description="The Skriuw browser app, served as static files" \
      org.opencontainers.image.source="https://github.com/remcostoeten/skriuw" \
      org.opencontainers.image.licenses="MIT"

COPY tools/packaging/docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/apps/workspace/dist /srv

EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:2019/config/ || exit 1
