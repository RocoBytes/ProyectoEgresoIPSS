-- 1. Estructura generada por `prisma migrate diff`: esta migración no cambia schema.prisma, así que no hay cambios de estructura.

-- 2. Reglas escritas a mano (Prisma no las expresa en schema.prisma)

-- 2.1 Qué columnas lleva cada nivel de impacto. Un registro de MALLA sin versión de malla, o un
--     PERFIL_EGRESO con una asignatura, no tiene sentido y no debe poder guardarse por ninguna vía.
ALTER TABLE "registro"
  ADD CONSTRAINT "registro_objeto_segun_nivel" CHECK (
    CASE "nivel_impacto"
      WHEN 'RECURSO' THEN "asignatura_id" IS NOT NULL AND "version_malla_id" IS NULL AND length(btrim(coalesce("recurso", ''))) >= 3
      WHEN 'ASIGNATURA' THEN "asignatura_id" IS NOT NULL AND "version_malla_id" IS NULL AND "recurso" IS NULL
      WHEN 'MODULO' THEN "asignatura_id" IS NOT NULL AND "version_malla_id" IS NULL AND "recurso" IS NULL
      WHEN 'MALLA' THEN "version_malla_id" IS NOT NULL AND "asignatura_id" IS NULL AND "recurso" IS NULL
      WHEN 'PERFIL_INGRESO' THEN "asignatura_id" IS NULL AND "version_malla_id" IS NULL AND "recurso" IS NULL
      WHEN 'PERFIL_EGRESO' THEN "asignatura_id" IS NULL AND "version_malla_id" IS NULL AND "recurso" IS NULL
    END
  );

-- 2.2 El objeto debe pertenecer a la carrera del registro y ser del tipo que el nivel exige.
--     Una clave foránea no puede expresarlo (compara una sola columna), así que lo hace un trigger.
CREATE FUNCTION validar_objeto_registro() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_carrera_objeto uuid;
  v_tipo tipo_asignatura;
BEGIN
  IF NEW.asignatura_id IS NOT NULL THEN
    SELECT carrera_id, tipo INTO v_carrera_objeto, v_tipo FROM asignatura WHERE id = NEW.asignatura_id;
    IF v_carrera_objeto IS DISTINCT FROM NEW.carrera_id THEN
      RAISE EXCEPTION 'La asignatura o el módulo no pertenece a la carrera del registro'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.nivel_impacto IN ('RECURSO', 'ASIGNATURA') AND v_tipo <> 'ASIGNATURA' THEN
      RAISE EXCEPTION 'El nivel % exige una asignatura, no un módulo', NEW.nivel_impacto
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.nivel_impacto = 'MODULO' AND v_tipo <> 'MODULO' THEN
      RAISE EXCEPTION 'El nivel MODULO exige un módulo, no una asignatura'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.version_malla_id IS NOT NULL THEN
    SELECT carrera_id INTO v_carrera_objeto FROM version_malla WHERE id = NEW.version_malla_id;
    IF v_carrera_objeto IS DISTINCT FROM NEW.carrera_id THEN
      RAISE EXCEPTION 'La versión de malla no pertenece a la carrera del registro'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER registro_validar_objeto BEFORE INSERT OR UPDATE OF carrera_id, nivel_impacto, asignatura_id, version_malla_id ON "registro"
  FOR EACH ROW EXECUTE FUNCTION validar_objeto_registro();
