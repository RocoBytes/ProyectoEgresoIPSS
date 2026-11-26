#!/bin/sh
# Se ejecuta una sola vez, al crear el volumen de la base. Las claves llegan por variables de entorno.
set -eu
psql -v ON_ERROR_STOP=1 -U postgres \
  -v clave_migrador="$CLAVE_BD_MIGRADOR" -v clave_api="$CLAVE_BD_API" <<'SQL'
CREATE ROLE ipss_migrador LOGIN PASSWORD :'clave_migrador';
CREATE ROLE ipss_api LOGIN PASSWORD :'clave_api';
CREATE DATABASE ipss OWNER ipss_migrador;
\connect ipss
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO ipss_migrador;
GRANT USAGE ON SCHEMA public TO ipss_api;
ALTER DEFAULT PRIVILEGES FOR ROLE ipss_migrador IN SCHEMA public GRANT SELECT ON TABLES TO ipss_api;
ALTER DEFAULT PRIVILEGES FOR ROLE ipss_migrador IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ipss_api;
ALTER DEFAULT PRIVILEGES FOR ROLE ipss_migrador REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
SQL
