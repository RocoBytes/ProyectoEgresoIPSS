-- Sección 1: salida de `prisma migrate diff` (familia de rotación y tope absoluto de la sesión).
-- AlterTable
ALTER TABLE "refresh_token" ADD COLUMN     "familia" UUID NOT NULL,
ADD COLUMN     "sesion_iniciada_en" TIMESTAMPTZ(3) NOT NULL;

-- CreateIndex
CREATE INDEX "refresh_token_familia_idx" ON "refresh_token"("familia");

-- Sección 2: reglas escritas a mano (Prisma no sabe expresar CHECK).
-- La API busca al usuario por correo exacto y la columna es UNIQUE: sin esta regla, "Ana@x.cl" y
-- "ana@x.cl" serían dos cuentas y el bloqueo por correo se podría esquivar cambiando mayúsculas.
-- El formato argon2id impide que un hash en texto plano o de otro algoritmo llegue a la tabla
-- por error (una semilla, un script manual o una herramienta futura).
ALTER TABLE "usuario"
  ADD CONSTRAINT "usuario_correo_normalizado" CHECK ("correo" = lower(btrim("correo"))),
  ADD CONSTRAINT "usuario_hash_argon2id" CHECK ("hash_contrasena" LIKE '$argon2id$%');
