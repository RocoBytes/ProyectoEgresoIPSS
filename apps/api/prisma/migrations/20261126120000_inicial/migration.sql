-- 1. Estructura generada por `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`
--    a partir de schema.prisma. No se edita a mano: si cambia el esquema, se crea otra migración.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "estado_registro" AS ENUM ('ABIERTO', 'CERRADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "nivel_impacto" AS ENUM ('RECURSO', 'ASIGNATURA', 'MODULO', 'MALLA', 'PERFIL_INGRESO', 'PERFIL_EGRESO');

-- CreateEnum
CREATE TYPE "rol" AS ENUM ('DIRECTOR_SECTORIAL', 'DIRECTOR_CARRERA', 'ASEGURAMIENTO_CALIDAD');

-- CreateEnum
CREATE TYPE "tipo_asignatura" AS ENUM ('ASIGNATURA', 'MODULO');

-- CreateTable
CREATE TABLE "sector" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,

    CONSTRAINT "sector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carrera" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sector_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "carrera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asignatura" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "carrera_id" UUID NOT NULL,
    "tipo" "tipo_asignatura" NOT NULL,
    "codigo" TEXT,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "asignatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "canal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "version_malla" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "carrera_id" UUID NOT NULL,
    "anio" INTEGER NOT NULL,
    "vigente_desde" DATE NOT NULL,
    "archivo_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "version_malla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "correo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "hash_contrasena" TEXT NOT NULL,
    "rol" "rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "proveedor_identidad" TEXT,
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_sector" (
    "usuario_id" UUID NOT NULL,
    "sector_id" UUID NOT NULL,

    CONSTRAINT "usuario_sector_pkey" PRIMARY KEY ("usuario_id","sector_id")
);

-- CreateTable
CREATE TABLE "usuario_carrera" (
    "usuario_id" UUID NOT NULL,
    "carrera_id" UUID NOT NULL,

    CONSTRAINT "usuario_carrera_pkey" PRIMARY KEY ("usuario_id","carrera_id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "revocado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "canal_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "instancia" TEXT NOT NULL,
    "participantes" TEXT[],
    "creado_por" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidencia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sesion_id" UUID,
    "nombre_original" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "ruta" TEXT NOT NULL,
    "subido_por" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registro" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sesion_id" UUID NOT NULL,
    "carrera_id" UUID NOT NULL,
    "nivel_impacto" "nivel_impacto" NOT NULL,
    "asignatura_id" UUID,
    "version_malla_id" UUID,
    "recurso" TEXT,
    "anio" INTEGER NOT NULL DEFAULT 0,
    "numero" INTEGER NOT NULL DEFAULT 0,
    "correlativo" TEXT NOT NULL DEFAULT '',
    "estado" "estado_registro" NOT NULL DEFAULT 'ABIERTO',
    "descripcion" TEXT NOT NULL,
    "fecha_comprometida" DATE NOT NULL,
    "fecha_efectiva" DATE,
    "evidencia_cierre_id" UUID,
    "comentario_cierre" TEXT,
    "motivo_anulacion" TEXT,
    "actualizado_por" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_estado" (
    "id" BIGSERIAL NOT NULL,
    "registro_id" UUID NOT NULL,
    "estado_anterior" "estado_registro",
    "estado_nuevo" "estado_registro" NOT NULL,
    "usuario" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_estado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_cambio" (
    "id" BIGSERIAL NOT NULL,
    "registro_id" UUID NOT NULL,
    "usuario" UUID NOT NULL,
    "cambios" JSONB NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_cambio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contador_correlativo" (
    "anio" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL,

    CONSTRAINT "contador_correlativo_pkey" PRIMARY KEY ("anio")
);

-- CreateIndex
CREATE UNIQUE INDEX "sector_nombre_key" ON "sector"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "carrera_nombre_key" ON "carrera"("nombre");

-- CreateIndex
CREATE INDEX "carrera_sector_id_idx" ON "carrera"("sector_id");

-- CreateIndex
CREATE UNIQUE INDEX "asignatura_carrera_id_codigo_key" ON "asignatura"("carrera_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "asignatura_carrera_id_tipo_nombre_key" ON "asignatura"("carrera_id", "tipo", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "canal_nombre_key" ON "canal"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "version_malla_archivo_id_key" ON "version_malla"("archivo_id");

-- CreateIndex
CREATE UNIQUE INDEX "version_malla_carrera_id_anio_key" ON "version_malla"("carrera_id", "anio");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_correo_key" ON "usuario"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_hash_key" ON "refresh_token"("hash");

-- CreateIndex
CREATE INDEX "refresh_token_usuario_id_idx" ON "refresh_token"("usuario_id");

-- CreateIndex
CREATE INDEX "evidencia_sesion_id_idx" ON "evidencia"("sesion_id");

-- CreateIndex
CREATE UNIQUE INDEX "registro_correlativo_key" ON "registro"("correlativo");

-- CreateIndex
CREATE INDEX "registro_sesion_id_idx" ON "registro"("sesion_id");

-- CreateIndex
CREATE INDEX "registro_carrera_id_idx" ON "registro"("carrera_id");

-- CreateIndex
CREATE UNIQUE INDEX "registro_anio_numero_key" ON "registro"("anio", "numero");

-- CreateIndex
CREATE INDEX "historial_estado_registro_id_idx" ON "historial_estado"("registro_id");

-- CreateIndex
CREATE INDEX "historial_cambio_registro_id_idx" ON "historial_cambio"("registro_id");

-- AddForeignKey
ALTER TABLE "carrera" ADD CONSTRAINT "carrera_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignatura" ADD CONSTRAINT "asignatura_carrera_id_fkey" FOREIGN KEY ("carrera_id") REFERENCES "carrera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_malla" ADD CONSTRAINT "version_malla_carrera_id_fkey" FOREIGN KEY ("carrera_id") REFERENCES "carrera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_malla" ADD CONSTRAINT "version_malla_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "evidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_sector" ADD CONSTRAINT "usuario_sector_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_sector" ADD CONSTRAINT "usuario_sector_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_carrera" ADD CONSTRAINT "usuario_carrera_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_carrera" ADD CONSTRAINT "usuario_carrera_carrera_id_fkey" FOREIGN KEY ("carrera_id") REFERENCES "carrera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "sesion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_subido_por_fkey" FOREIGN KEY ("subido_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro" ADD CONSTRAINT "registro_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "sesion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro" ADD CONSTRAINT "registro_carrera_id_fkey" FOREIGN KEY ("carrera_id") REFERENCES "carrera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro" ADD CONSTRAINT "registro_asignatura_id_fkey" FOREIGN KEY ("asignatura_id") REFERENCES "asignatura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro" ADD CONSTRAINT "registro_version_malla_id_fkey" FOREIGN KEY ("version_malla_id") REFERENCES "version_malla"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro" ADD CONSTRAINT "registro_evidencia_cierre_id_fkey" FOREIGN KEY ("evidencia_cierre_id") REFERENCES "evidencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro" ADD CONSTRAINT "registro_actualizado_por_fkey" FOREIGN KEY ("actualizado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_estado" ADD CONSTRAINT "historial_estado_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_estado" ADD CONSTRAINT "historial_estado_usuario_fkey" FOREIGN KEY ("usuario") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_cambio" ADD CONSTRAINT "historial_cambio_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_cambio" ADD CONSTRAINT "historial_cambio_usuario_fkey" FOREIGN KEY ("usuario") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 2. Reglas escritas a mano (Prisma no las expresa en schema.prisma)

-- 2.1 Un registro cerrado exige fecha efectiva y evidencia; uno anulado exige motivo (RF-12, RF-13, RNF-06)
ALTER TABLE "registro"
  ADD CONSTRAINT "registro_cierre_completo"
    CHECK ("estado" <> 'CERRADO' OR ("fecha_efectiva" IS NOT NULL AND "evidencia_cierre_id" IS NOT NULL)),
  ADD CONSTRAINT "registro_anulacion_con_motivo"
    CHECK ("estado" <> 'ANULADO' OR length(btrim(coalesce("motivo_anulacion", ''))) > 0),
  ADD CONSTRAINT "registro_fecha_efectiva_solo_cerrado"
    CHECK ("estado" = 'CERRADO' OR "fecha_efectiva" IS NULL);

-- 2.2 Correlativo anual R-AAAA-NNN sin saltos: fila contador con bloqueo hasta el commit.
--     El año se toma en hora de Santiago y el contador de un año nuevo se crea solo.
CREATE FUNCTION siguiente_correlativo(p_anio integer) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO contador_correlativo (anio, ultimo) VALUES (p_anio, 1)
  ON CONFLICT (anio) DO UPDATE SET ultimo = contador_correlativo.ultimo + 1
  RETURNING ultimo;
$$;

CREATE FUNCTION asignar_correlativo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_anio integer := extract(year FROM (now() AT TIME ZONE 'America/Santiago'))::integer;
  v_numero integer := siguiente_correlativo(v_anio);
BEGIN
  -- Lo que envíe la API en estos campos se ignora
  NEW.anio := v_anio;
  NEW.numero := v_numero;
  NEW.correlativo := 'R-' || v_anio || '-' || lpad(v_numero::text, 3, '0');
  NEW.estado := 'ABIERTO';
  NEW.creado_en := now();
  RETURN NEW;
END $$;

CREATE TRIGGER registro_correlativo BEFORE INSERT ON "registro"
  FOR EACH ROW EXECUTE FUNCTION asignar_correlativo();

-- 2.3 Un registro cerrado o anulado no se modifica; el correlativo y la sesión no cambian nunca
CREATE FUNCTION proteger_registro() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.estado <> 'ABIERTO' THEN
    RAISE EXCEPTION 'El registro % está % y no admite modificaciones', OLD.correlativo, lower(OLD.estado::text)
      USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.anio, NEW.numero, NEW.correlativo, NEW.sesion_id, NEW.creado_en)
     IS DISTINCT FROM (OLD.anio, OLD.numero, OLD.correlativo, OLD.sesion_id, OLD.creado_en) THEN
    RAISE EXCEPTION 'El correlativo, la sesión y la fecha de creación de % no se pueden cambiar', OLD.correlativo
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER registro_proteger BEFORE UPDATE ON "registro"
  FOR EACH ROW EXECUTE FUNCTION proteger_registro();

-- 2.4 Historial escrito por la base y no por la API: cambios de estado y ediciones de campos
CREATE FUNCTION auditar_registro() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cambios jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO historial_estado (registro_id, estado_anterior, estado_nuevo, usuario)
    VALUES (NEW.id, NULL, NEW.estado, NEW.actualizado_por);
    RETURN NULL;
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO historial_estado (registro_id, estado_anterior, estado_nuevo, usuario)
    VALUES (NEW.id, OLD.estado, NEW.estado, NEW.actualizado_por);
  END IF;
  SELECT jsonb_object_agg(n.key, jsonb_build_object('antes', o.value, 'despues', n.value))
    INTO v_cambios
    FROM jsonb_each(to_jsonb(NEW)) n
    JOIN jsonb_each(to_jsonb(OLD)) o ON o.key = n.key
   WHERE n.value IS DISTINCT FROM o.value AND n.key NOT IN ('actualizado_por', 'estado');
  IF v_cambios IS NOT NULL THEN
    INSERT INTO historial_cambio (registro_id, usuario, cambios) VALUES (NEW.id, NEW.actualizado_por, v_cambios);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER registro_auditar AFTER INSERT OR UPDATE ON "registro"
  FOR EACH ROW EXECUTE FUNCTION auditar_registro();

-- 2.5 Permisos del rol de la API: nunca DELETE ni TRUNCATE; los historiales y el contador, solo lectura
GRANT INSERT, UPDATE ON "sesion", "registro" TO ipss_api;
GRANT INSERT ON "evidencia" TO ipss_api;
-- El contador solo lo mueve el trigger; la API no puede consumir números por su cuenta
REVOKE ALL ON FUNCTION siguiente_correlativo(integer) FROM PUBLIC;

-- 2.6 Tablas del producto. Por defecto la API solo las lee; aquí se concede lo mínimo, nunca DELETE ni TRUNCATE.
GRANT INSERT, UPDATE ON "usuario", "refresh_token" TO ipss_api;
GRANT INSERT ON "usuario_sector", "usuario_carrera", "version_malla" TO ipss_api;
GRANT INSERT, UPDATE ON "sector", "carrera", "asignatura", "canal" TO ipss_api;
