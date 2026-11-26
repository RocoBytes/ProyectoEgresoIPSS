-- 1. Estructura (equivalente a lo que genera `prisma migrate dev --create-only` a partir de schema.prisma)
CREATE TYPE "estado_registro" AS ENUM ('ABIERTO', 'CERRADO', 'ANULADO');

CREATE TABLE "sesion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "canal" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "instancia" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sesion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evidencia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sesion_id" UUID,
    "nombre_original" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "ruta" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evidencia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "evidencia_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "sesion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "registro" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sesion_id" UUID NOT NULL,
    "anio" INTEGER NOT NULL DEFAULT 0,
    "numero" INTEGER NOT NULL DEFAULT 0,
    "correlativo" TEXT NOT NULL DEFAULT '',
    "estado" "estado_registro" NOT NULL DEFAULT 'ABIERTO',
    "descripcion" TEXT NOT NULL,
    "fecha_comprometida" DATE NOT NULL,
    "fecha_efectiva" DATE,
    "evidencia_cierre_id" UUID,
    "motivo_anulacion" TEXT,
    "actualizado_por" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "registro_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "registro_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "sesion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "registro_evidencia_cierre_id_fkey" FOREIGN KEY ("evidencia_cierre_id") REFERENCES "evidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "registro_correlativo_key" ON "registro"("correlativo");
CREATE UNIQUE INDEX "registro_anio_numero_key" ON "registro"("anio", "numero");

CREATE TABLE "historial_estado" (
    "id" BIGSERIAL NOT NULL,
    "registro_id" UUID NOT NULL,
    "estado_anterior" "estado_registro",
    "estado_nuevo" "estado_registro" NOT NULL,
    "usuario" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "historial_estado_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "historial_estado_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registro"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "historial_cambio" (
    "id" BIGSERIAL NOT NULL,
    "registro_id" UUID NOT NULL,
    "usuario" TEXT NOT NULL,
    "cambios" JSONB NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "historial_cambio_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "historial_cambio_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registro"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "contador_correlativo" (
    "anio" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL,
    CONSTRAINT "contador_correlativo_pkey" PRIMARY KEY ("anio")
);

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
