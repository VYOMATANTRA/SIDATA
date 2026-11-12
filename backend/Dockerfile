FROM node:22-bookworm AS app

WORKDIR /app

COPY package*.json ./

RUN npm ci --no-audit --prefer-offline --logs-dir=/tmp/npm-ci-logs \
    || { status=$?; \
         grep -hE ' (info using|http fetch .*failed|verbose stack|error) ' /tmp/npm-ci-logs/*-debug-0.log >&2; \
         exit "$status"; }

COPY . .

EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]

FROM app AS audit-pruner
COPY --from=busybox:1.37.0-musl /bin/busybox /usr/local/bin/busybox

FROM app AS backend
