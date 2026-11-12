FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci --no-audit --prefer-offline --logs-dir=/tmp/npm-ci-logs \
    || { status=$?; \
         grep -hE ' (info using|http fetch .*failed|verbose stack|error) ' /tmp/npm-ci-logs/*-debug-0.log >&2; \
         exit "$status"; }

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
