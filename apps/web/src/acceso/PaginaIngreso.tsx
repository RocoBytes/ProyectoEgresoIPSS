import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { ErrorApi } from '../api/cliente';
import { useToast } from '../comun/Toasts';
import { destinoSeguro } from './destino';
import { esquemaIngreso, type ValoresIngreso } from './esquemaIngreso';
import { CLAVE_SESION, ingresar } from './sesion';
import { VistaIngreso, type AvisoIngreso } from './VistaIngreso';

type EstadoAviso =
  | { tipo: 'credenciales'; intentosRestantes: number | null }
  | { tipo: 'bloqueo'; hasta: number }
  | { tipo: 'limite'; mensaje: string }
  | { tipo: 'fallo' };

// La hora se muestra en la zona de la institución, sin depender del equipo del usuario.
const formatoHora = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function dos(numero: number): string {
  return String(numero).padStart(2, '0');
}

function cuentaRegresiva(hasta: number, ahora: number): string {
  const segundos = Math.max(0, Math.ceil((hasta - ahora) / 1000));
  return `${dos(Math.floor(segundos / 60))}:${dos(segundos % 60)}`;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

function erroresDeCampo(cuerpo: unknown): { campo: string; mensaje: string }[] {
  if (!esObjeto(cuerpo) || !Array.isArray(cuerpo.errores)) return [];
  const lista: { campo: string; mensaje: string }[] = [];
  for (const entrada of cuerpo.errores as unknown[]) {
    if (esObjeto(entrada) && typeof entrada.campo === 'string' && typeof entrada.mensaje === 'string') {
      lista.push({ campo: entrada.campo, mensaje: entrada.mensaje });
    }
  }
  return lista;
}

function esCampo(campo: string): campo is keyof ValoresIngreso {
  return campo === 'correo' || campo === 'contrasena';
}

function aAviso(estado: EstadoAviso, ahora: number): AvisoIngreso {
  switch (estado.tipo) {
    case 'credenciales': {
      const restantes = estado.intentosRestantes;
      const consejo =
        restantes !== null && restantes <= 2
          ? `${restantes === 1 ? 'Te queda 1 intento' : `Te quedan ${String(restantes)} intentos`} antes de que la cuenta se bloquee por 15 minutos.`
          : 'Revisa que el correo esté completo y que no tengas activadas las mayúsculas.';
      return { tipo: 'error', titulo: 'Correo o contraseña incorrectos', rol: 'alert', contenido: consejo };
    }
    case 'bloqueo':
      return {
        tipo: 'alerta',
        titulo: 'Cuenta bloqueada por intentos fallidos',
        rol: 'alert',
        contenido: (
          <>
            Podrás intentar de nuevo a las {formatoHora.format(new Date(estado.hasta))}, en{' '}
            {/* Sin anuncio por segundo: el lector de pantalla leería el aviso entero cada vez que cambia. */}
            <span className="whitespace-nowrap tabular-nums" aria-live="off">
              {cuentaRegresiva(estado.hasta, ahora)}
            </span>
            . Si no fuiste tú, avisa al administrador del sistema.
          </>
        ),
      };
    case 'limite':
      return { tipo: 'alerta', titulo: estado.mensaje, rol: 'alert' };
    case 'fallo':
      return {
        tipo: 'error',
        titulo: 'No pudimos iniciar sesión',
        rol: 'alert',
        contenido: 'Intenta de nuevo en unos minutos.',
      };
  }
}

function avisoDeMotivo(motivo: string | null): AvisoIngreso | null {
  if (motivo === 'expirada') {
    return {
      tipo: 'info',
      titulo: 'Tu sesión expiró por inactividad',
      rol: 'status',
      contenido: 'Inicia sesión de nuevo para continuar.',
    };
  }
  if (motivo === 'salida') {
    return {
      tipo: 'neutro',
      titulo: 'Cerraste sesión',
      rol: 'status',
      contenido: 'Para volver a entrar, ingresa tu correo y tu contraseña.',
    };
  }
  return null;
}

/** Contenedor: formulario, llamada a la API y avisos; la vista solo dibuja. */
export function PaginaIngreso() {
  const [parametros] = useSearchParams();
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const mostrarToast = useToast();
  const [estadoAviso, setEstadoAviso] = useState<EstadoAviso | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [olvidoAbierto, setOlvidoAbierto] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    resetField,
    formState: { errors },
  } = useForm<ValoresIngreso>({
    resolver: zodResolver(esquemaIngreso),
    defaultValues: { correo: '', contrasena: '' },
  });

  const bloqueadoHasta = estadoAviso?.tipo === 'bloqueo' ? estadoAviso.hasta : null;
  useEffect(() => {
    if (bloqueadoHasta === null) return;
    const intervalo = setInterval(() => {
      const t = Date.now();
      if (t >= bloqueadoHasta) setEstadoAviso(null);
      else setAhora(t);
    }, 1000);
    return () => {
      clearInterval(intervalo);
    };
  }, [bloqueadoHasta]);

  const mutacion = useMutation({
    mutationFn: ingresar,
    onSuccess: (usuario) => {
      cliente.setQueryData(CLAVE_SESION, usuario);
      mostrarToast(`Sesión iniciada como ${usuario.etiquetaRol}.`);
      void navegar(destinoSeguro(parametros.get('volver')), { replace: true });
    },
    onError: (error) => {
      if (!(error instanceof ErrorApi)) {
        setEstadoAviso({ tipo: 'fallo' });
        return;
      }
      const cuerpo = error.cuerpo;
      if (error.estado === 400) {
        const delCampo: { campo: keyof ValoresIngreso; mensaje: string }[] = [];
        for (const { campo, mensaje } of erroresDeCampo(cuerpo)) {
          if (esCampo(campo)) delCampo.push({ campo, mensaje });
        }
        const primero = delCampo[0];
        if (primero !== undefined) {
          for (const { campo, mensaje } of delCampo) setError(campo, { type: 'servidor', message: mensaje });
          setFocus(primero.campo);
          return;
        }
      }
      if (error.estado === 401) {
        const restantes = esObjeto(cuerpo) ? cuerpo.intentosRestantes : undefined;
        setEstadoAviso({ tipo: 'credenciales', intentosRestantes: typeof restantes === 'number' ? restantes : null });
        // Una contraseña equivocada no se reutiliza: se limpia y el cursor vuelve a ella.
        resetField('contrasena');
        setFocus('contrasena');
        return;
      }
      if (error.estado === 429) {
        const hasta = esObjeto(cuerpo) && typeof cuerpo.bloqueadoHasta === 'string' ? Date.parse(cuerpo.bloqueadoHasta) : NaN;
        if (Number.isNaN(hasta)) {
          setEstadoAviso({ tipo: 'limite', mensaje: error.message });
        } else {
          setEstadoAviso({ tipo: 'bloqueo', hasta });
          setAhora(Date.now());
          resetField('contrasena');
        }
        return;
      }
      setEstadoAviso({ tipo: 'fallo' });
    },
  });

  const enviar = handleSubmit((valores) => {
    mutacion.mutate(valores);
  });

  const alEnviar = (evento: FormEvent<HTMLFormElement>) => {
    setEstadoAviso(null);
    setOlvidoAbierto(false);
    void enviar(evento);
  };

  const aviso = estadoAviso === null ? avisoDeMotivo(parametros.get('motivo')) : aAviso(estadoAviso, ahora);

  return (
    <VistaIngreso
      registrar={register}
      errores={errors}
      alEnviar={alEnviar}
      enviando={mutacion.isPending}
      aviso={aviso}
      olvidoAbierto={olvidoAbierto}
      alAlternarOlvido={() => {
        setOlvidoAbierto((actual) => !actual);
      }}
    />
  );
}
