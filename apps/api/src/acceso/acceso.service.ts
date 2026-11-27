import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { UsuarioActual } from '@ipss/shared';
import { RELOJ, type Reloj } from '../comun/reloj';
import type { Rol } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AlcanceService } from './alcance.service';
import { ContrasenasService } from './contrasenas.service';
import { DURACION_BLOQUEO_MS, IntentosDesconocidosService, MAX_INTENTOS, VENTANA_INTENTOS_MS } from './intentos-desconocidos.service';
import { TokensService } from './tokens.service';
import type { UsuarioAutenticado } from './usuario-autenticado';

const INACTIVIDAD_MS = 15 * 60_000;
const TOPE_SESION_MS = 8 * 60 * 60_000;
// Dos pestañas pueden renovar a la vez con la misma cookie: la segunda llega con un token que la
// primera acaba de rotar. Dentro de esta ventana no se trata como robo (ADR 0009).
const VENTANA_ROTACION_MS = 10_000;

const ETIQUETAS_ROL: Readonly<Record<Rol, string>> = {
  DIRECTOR_SECTORIAL: 'Dirección Sectorial',
  DIRECTOR_CARRERA: 'Dirección de Carrera',
  ASEGURAMIENTO_CALIDAD: 'Aseguramiento de la Calidad',
};

/** Lo que el controlador convierte en las dos cookies. */
export interface CredencialesDeSesion {
  jwt: string;
  jwtSegundos: number;
  refresh: string;
  refreshSegundos: number;
}

export type ResultadoIngreso =
  | { tipo: 'ok'; usuario: UsuarioActual; credenciales: CredencialesDeSesion }
  | { tipo: 'credenciales'; intentosRestantes: number }
  | { tipo: 'bloqueada'; bloqueadoHasta: Date };

export type ResultadoRenovacion = { tipo: 'ok'; credenciales: CredencialesDeSesion } | { tipo: 'rechazada' };

interface FilaReserva {
  n: number;
  ya_bloqueada: boolean;
  bloqueado_hasta: Date | null;
}

/** `bloqueadoHasta` distinto de null: no se verifica la contraseña, se responde 429. */
interface Reserva {
  n: number;
  bloqueadoHasta: Date | null;
}

/** Fin de la sesión actual: 15 min de inactividad, pero nunca más de 8 h desde el ingreso. */
function expiracion(ahora: Date, sesionIniciadaEn: Date): Date {
  return new Date(Math.min(ahora.getTime() + INACTIVIDAD_MS, sesionIniciadaEn.getTime() + TOPE_SESION_MS));
}

@Injectable()
export class AccesoService {
  private readonly registro = new Logger(AccesoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contrasenas: ContrasenasService,
    private readonly tokens: TokensService,
    private readonly intentosDesconocidos: IntentosDesconocidosService,
    private readonly alcance: AlcanceService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  /**
   * Correo inexistente, contraseña incorrecta y usuario inactivo recorren el mismo camino y
   * dan la misma respuesta, para no revelar qué correos tienen cuenta (ADR 0010).
   * El intento se RESERVA antes de verificar la contraseña: así una ráfaga de peticiones
   * paralelas no puede probar más de cinco contraseñas, porque la sexta reserva ya bloquea.
   */
  async ingresar(correo: string, contrasena: string): Promise<ResultadoIngreso> {
    const ahora = this.reloj.ahora();
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo },
      select: { id: true, rol: true, activo: true, hashContrasena: true },
    });
    if (usuario === null) return this.ingresarDesconocido(correo, contrasena);

    const reserva = await this.reservarIntento(usuario.id, ahora);
    if (reserva.bloqueadoHasta !== null) return { tipo: 'bloqueada', bloqueadoHasta: reserva.bloqueadoHasta };

    const correcta = await this.contrasenas.verificar(usuario.hashContrasena, contrasena);
    if (correcta && usuario.activo) {
      // Condicional: si mientras se verificaba otra petición bloqueó la cuenta, este ingreso no vale.
      const liberada = await this.prisma.usuario.updateMany({
        where: { id: usuario.id, OR: [{ bloqueadoHasta: null }, { bloqueadoHasta: { lte: ahora } }] },
        data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoFalloEn: null },
      });
      if (liberada.count === 0) return this.cuentaBloqueada(usuario.id, ahora);
      const perfil = await this.perfil(usuario.id);
      if (perfil === null) return { tipo: 'credenciales', intentosRestantes: MAX_INTENTOS - reserva.n };
      return { tipo: 'ok', usuario: perfil, credenciales: await this.abrirSesion({ id: usuario.id, rol: usuario.rol }, ahora) };
    }
    if (reserva.n >= MAX_INTENTOS) return this.cuentaBloqueada(usuario.id, ahora);
    return { tipo: 'credenciales', intentosRestantes: MAX_INTENTOS - reserva.n };
  }

  private async ingresarDesconocido(correo: string, contrasena: string): Promise<ResultadoIngreso> {
    const reserva = this.intentosDesconocidos.reservar(correo);
    if (reserva.yaBloqueado || reserva.bloqueadoHasta !== null) {
      return { tipo: 'bloqueada', bloqueadoHasta: reserva.bloqueadoHasta ?? this.reloj.ahora() };
    }
    await this.contrasenas.verificarContraFicticio(contrasena);
    if (reserva.n >= MAX_INTENTOS) return { tipo: 'bloqueada', bloqueadoHasta: this.intentosDesconocidos.bloquear(correo) };
    return { tipo: 'credenciales', intentosRestantes: MAX_INTENTOS - reserva.n };
  }

  async renovar(tokenPresentado: string | undefined): Promise<ResultadoRenovacion> {
    if (tokenPresentado === undefined || tokenPresentado === '') return { tipo: 'rechazada' };
    const ahora = this.reloj.ahora();
    const hash = this.tokens.hashDe(tokenPresentado);
    const nuevo = await this.tokens.generarRefresh();

    // Una sola transacción: revocar el token presentado y emitir el nuevo son un solo hecho.
    // Los casos de rechazo se devuelven como valor, no se lanzan, porque lanzar revertiría la
    // revocación de la familia que justamente hay que conservar.
    const resultado = await this.prisma.$transaction(async (tx) => {
      const fila = await tx.refreshToken.findUnique({
        where: { hash },
        select: { id: true, familia: true, usuarioId: true, sesionIniciadaEn: true, expiraEn: true, revocadoEn: true, usuario: { select: { rol: true, activo: true } } },
      });
      if (fila === null) return null;

      if (fila.revocadoEn !== null) {
        if (ahora.getTime() - fila.revocadoEn.getTime() <= VENTANA_ROTACION_MS) {
          // Normal con dos pestañas, pero también lo que vería un robo: queda registrado, solo con la familia.
          this.registro.warn(`Se presentó un refresh token recién rotado dentro de la ventana de ${VENTANA_ROTACION_MS / 1000} s en la familia ${fila.familia}`);
          return null;
        }
        // Un token ya rotado que reaparece fuera de la ventana: pudo copiarse. Se cierra toda la sesión.
        await tx.refreshToken.updateMany({ where: { familia: fila.familia, revocadoEn: null }, data: { revocadoEn: ahora } });
        this.registro.warn(`Se reutilizó un refresh token ya rotado; se revocó la familia ${fila.familia}`);
        return null;
      }

      const tope = new Date(fila.sesionIniciadaEn.getTime() + TOPE_SESION_MS);
      if (fila.expiraEn <= ahora || tope <= ahora) return null;
      if (!fila.usuario.activo) {
        await tx.refreshToken.updateMany({ where: { familia: fila.familia, revocadoEn: null }, data: { revocadoEn: ahora } });
        return null;
      }

      // La condición `revocadoEn: null` hace atómico el "primero gana": si otra petición rotó
      // este token entre la lectura y aquí, el conteo es 0 y esta no emite nada.
      const revocados = await tx.refreshToken.updateMany({ where: { id: fila.id, revocadoEn: null }, data: { revocadoEn: ahora } });
      if (revocados.count !== 1) return null;

      const expiraEn = expiracion(ahora, fila.sesionIniciadaEn);
      await tx.refreshToken.create({
        data: { usuarioId: fila.usuarioId, hash: nuevo.hash, familia: fila.familia, sesionIniciadaEn: fila.sesionIniciadaEn, expiraEn },
      });
      // El rol se lee de la base ahora, no del JWT anterior: un cambio de rol rige desde esta renovación.
      return { usuario: { id: fila.usuarioId, rol: fila.usuario.rol }, familia: fila.familia, expiraEn, tope };
    });

    if (resultado === null) return { tipo: 'rechazada' };
    const acceso = await this.tokens.emitirAcceso(resultado.usuario, resultado.familia, resultado.tope);
    return {
      tipo: 'ok',
      credenciales: {
        jwt: acceso.jwt,
        jwtSegundos: acceso.segundos,
        refresh: nuevo.token,
        refreshSegundos: this.segundosHasta(resultado.expiraEn, ahora),
      },
    };
  }

  /** Revoca la familia del token presentado, si existe. Con un token desconocido no hace nada. */
  async salir(tokenPresentado: string | undefined): Promise<void> {
    if (tokenPresentado === undefined || tokenPresentado === '') return;
    const fila = await this.prisma.refreshToken.findUnique({ where: { hash: this.tokens.hashDe(tokenPresentado) }, select: { familia: true } });
    if (fila === null) return;
    await this.prisma.refreshToken.updateMany({ where: { familia: fila.familia, revocadoEn: null }, data: { revocadoEn: this.reloj.ahora() } });
  }

  /** Null si el usuario no existe o está inactivo. */
  async perfil(usuarioId: string): Promise<UsuarioActual | null> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId }, select: { id: true, nombre: true, correo: true, rol: true, activo: true } });
    if (usuario === null || !usuario.activo) return null;
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      etiquetaRol: ETIQUETAS_ROL[usuario.rol],
      alcance: await this.alcance.alcanceDe({ id: usuario.id, rol: usuario.rol }),
      puedeCrear: usuario.rol !== 'ASEGURAMIENTO_CALIDAD',
    };
  }

  private async abrirSesion(usuario: UsuarioAutenticado, ahora: Date): Promise<CredencialesDeSesion> {
    const refresh = await this.tokens.generarRefresh();
    const expiraEn = expiracion(ahora, ahora);
    const familia = randomUUID();
    await this.prisma.refreshToken.create({
      data: { usuarioId: usuario.id, hash: refresh.hash, familia, sesionIniciadaEn: ahora, expiraEn },
    });
    const acceso = await this.tokens.emitirAcceso(usuario, familia, new Date(ahora.getTime() + TOPE_SESION_MS));
    return { jwt: acceso.jwt, jwtSegundos: acceso.segundos, refresh: refresh.token, refreshSegundos: this.segundosHasta(expiraEn, ahora) };
  }

  /**
   * Reserva atómica del intento. Un solo UPDATE (con la fila bloqueada por el FOR UPDATE de la CTE)
   * aplica el vencimiento de la ventana, incrementa y, si el número reservado supera el máximo,
   * bloquea y reinicia el contador. La hora la pone el Reloj, nunca `now()`, para que las pruebas la controlen.
   */
  private async reservarIntento(usuarioId: string, ahora: Date): Promise<Reserva> {
    const inicioVentana = new Date(ahora.getTime() - VENTANA_INTENTOS_MS);
    const bloqueo = new Date(ahora.getTime() + DURACION_BLOQUEO_MS);
    const filas = await this.prisma.$queryRaw<FilaReserva[]>`
      WITH previo AS (
        SELECT id, bloqueado_hasta AS antes,
          CASE WHEN ultimo_fallo_en IS NULL OR ultimo_fallo_en < ${inicioVentana}::timestamptz THEN 0 ELSE intentos_fallidos END AS base
        FROM usuario WHERE id = ${usuarioId}::uuid FOR UPDATE
      )
      UPDATE usuario u SET
        intentos_fallidos = CASE
          WHEN p.antes > ${ahora}::timestamptz THEN u.intentos_fallidos
          WHEN p.base + 1 > ${MAX_INTENTOS}::int THEN 0
          ELSE p.base + 1 END,
        bloqueado_hasta = CASE
          WHEN p.antes > ${ahora}::timestamptz THEN u.bloqueado_hasta
          WHEN p.base + 1 > ${MAX_INTENTOS}::int THEN ${bloqueo}::timestamptz
          ELSE u.bloqueado_hasta END,
        ultimo_fallo_en = CASE WHEN p.antes > ${ahora}::timestamptz THEN u.ultimo_fallo_en ELSE ${ahora}::timestamptz END
      FROM previo p WHERE u.id = p.id
      RETURNING p.base + 1 AS n, COALESCE(p.antes > ${ahora}::timestamptz, false) AS ya_bloqueada, u.bloqueado_hasta`;
    const fila = filas[0];
    if (fila === undefined) return { n: 1, bloqueadoHasta: null };
    const bloqueada = fila.ya_bloqueada || fila.n > MAX_INTENTOS;
    return { n: fila.n, bloqueadoHasta: bloqueada ? fila.bloqueado_hasta : null };
  }

  /** El intento número 5 falló, o un ingreso correcto llegó con la cuenta ya bloqueada: devuelve el bloqueo vigente (o lo crea). */
  private async cuentaBloqueada(usuarioId: string, ahora: Date): Promise<ResultadoIngreso> {
    const bloqueo = new Date(ahora.getTime() + DURACION_BLOQUEO_MS);
    const filas = await this.prisma.$queryRaw<{ bloqueado_hasta: Date }[]>`
      UPDATE usuario SET
        intentos_fallidos = CASE WHEN bloqueado_hasta > ${ahora}::timestamptz THEN intentos_fallidos ELSE 0 END,
        bloqueado_hasta = CASE WHEN bloqueado_hasta > ${ahora}::timestamptz THEN bloqueado_hasta ELSE ${bloqueo}::timestamptz END
      WHERE id = ${usuarioId}::uuid
      RETURNING bloqueado_hasta`;
    return { tipo: 'bloqueada', bloqueadoHasta: filas[0]?.bloqueado_hasta ?? bloqueo };
  }

  private segundosHasta(fin: Date, desde: Date): number {
    return Math.max(0, Math.ceil((fin.getTime() - desde.getTime()) / 1000));
  }
}
