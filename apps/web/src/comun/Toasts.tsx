import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icono } from './Icono';

const DURACION_MS = 4_600;

type Mostrar = (texto: string) => void;
const ContextoToasts = createContext<Mostrar>(() => undefined);

interface Toast {
  id: number;
  texto: string;
}

/** Avisos breves que sobreviven al cambio de ruta (por eso viven fuera del enrutador). */
export function ProveedorToasts({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const contador = useRef(0);
  const temporizadores = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const activos = temporizadores.current;
    return () => {
      for (const t of activos) clearTimeout(t);
    };
  }, []);

  const mostrar = useCallback<Mostrar>((texto) => {
    contador.current += 1;
    const id = contador.current;
    setToasts((actuales) => [...actuales, { id, texto }]);
    const temporizador = setTimeout(() => {
      temporizadores.current.delete(temporizador);
      setToasts((actuales) => actuales.filter((t) => t.id !== id));
    }, DURACION_MS);
    temporizadores.current.add(temporizador);
  }, []);

  const valor = useMemo(() => mostrar, [mostrar]);

  return (
    <ContextoToasts value={valor}>
      {children}
      {/* La región existe siempre: los lectores de pantalla solo anuncian lo que aparece dentro de una región ya presente. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-5 bottom-5 z-[70] grid justify-items-end gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex max-w-[440px] items-center gap-2.5 rounded-s bg-navy px-4 py-3 text-[13px] font-medium text-white shadow-sombra-2"
          >
            <Icono nombre="check" className="text-oro" />
            <span>{t.texto}</span>
          </div>
        ))}
      </div>
    </ContextoToasts>
  );
}

export function useToast(): Mostrar {
  return useContext(ContextoToasts);
}
