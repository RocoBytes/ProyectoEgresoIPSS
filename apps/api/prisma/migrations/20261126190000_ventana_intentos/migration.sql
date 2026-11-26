-- Fecha del último intento reservado: con ella el contador de intentos de una cuenta real se
-- reinicia a los 15 minutos, igual que el de los correos inexistentes (ADR 0010).
-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "ultimo_fallo_en" TIMESTAMPTZ(3);
