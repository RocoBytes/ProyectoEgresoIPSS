-- El correlativo se armaba con lpad(numero, 3, '0'), y lpad RECORTA el texto cuando es más largo
-- que el ancho pedido: desde el registro 1000 el folio quedaba en R-AAAA-100 y chocaba con el
-- índice único registro_correlativo_key. Ahora se rellena a tres dígitos y desde 1000 se usa el
-- número completo (R-2026-999, R-2026-1000). Los folios ya emitidos no cambian.
-- CREATE OR REPLACE conserva el dueño, los permisos y el trigger registro_correlativo.
-- Regla SQL protegida: el cambio fue aprobado de forma explícita (ADR 0015).
CREATE OR REPLACE FUNCTION asignar_correlativo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_anio integer := extract(year FROM (now() AT TIME ZONE 'America/Santiago'))::integer;
  v_numero integer := siguiente_correlativo(v_anio);
BEGIN
  -- Lo que envíe la API en estos campos se ignora
  NEW.anio := v_anio;
  NEW.numero := v_numero;
  NEW.correlativo := 'R-' || v_anio || '-' || lpad(v_numero::text, greatest(3, length(v_numero::text)), '0');
  NEW.estado := 'ABIERTO';
  NEW.creado_en := now();
  RETURN NEW;
END $$;
