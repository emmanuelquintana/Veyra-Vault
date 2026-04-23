import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const migrationUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/db';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: migrationUrl,
  },
});
