import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { DATABASE_URL } from '../configs/index.js';

// Prisma 7 has no dedicated MySQL adapter; `@prisma/adapter-mariadb` (the `mariadb` driver)
// is the officially documented adapter for both MySQL and MariaDB — this is the correct
// choice for our MySQL database, not a MariaDB-specific shortcut.
const databaseUrl = new URL(DATABASE_URL);

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: databaseUrl.pathname.slice(1),
  }),
});

export default prisma;
