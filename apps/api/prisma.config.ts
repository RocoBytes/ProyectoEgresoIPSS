import { defineConfig } from 'prisma/config';

// La CLI de Prisma (migraciones) usa el rol migrador; la API en ejecución usa DATABASE_URL (rol ipss_api).
// shadowDatabaseUrl solo se define en desarrollo: sirve para comprobar que el esquema y las migraciones no se desvían.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DATABASE_URL_MIGRADOR ?? '',
    shadowDatabaseUrl: process.env.DATABASE_URL_SOMBRA,
  },
});
