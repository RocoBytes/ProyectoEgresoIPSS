-- Se ejecuta una sola vez como superusuario (en Docker: /docker-entrypoint-initdb.d/00_roles.sql).
-- Dos roles: el migrador es dueño del esquema y solo lo usa `prisma migrate deploy`;
-- la API se conecta con un rol que no puede borrar ni alterar tablas.
CREATE ROLE ipss_migrador LOGIN PASSWORD 'migrador_dev' CREATEDB; -- CREATEDB solo hace falta en desarrollo (base sombra de Prisma)
CREATE ROLE ipss_api LOGIN PASSWORD 'api_dev';
CREATE DATABASE ipss OWNER ipss_migrador;
\connect ipss
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO ipss_migrador;
GRANT USAGE ON SCHEMA public TO ipss_api;
-- Por defecto, toda tabla nueva queda solo de lectura para la API; cada migración concede lo demás de forma explícita.
ALTER DEFAULT PRIVILEGES FOR ROLE ipss_migrador IN SCHEMA public GRANT SELECT ON TABLES TO ipss_api;
ALTER DEFAULT PRIVILEGES FOR ROLE ipss_migrador IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ipss_api;
-- Sin IN SCHEMA: los privilegios por defecto de un esquema solo agregan, no quitan el EXECUTE que PostgreSQL da a PUBLIC.
ALTER DEFAULT PRIVILEGES FOR ROLE ipss_migrador REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
