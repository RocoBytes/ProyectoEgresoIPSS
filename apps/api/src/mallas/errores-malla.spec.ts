import { Prisma } from '../generated/prisma/client';
import { esDuplicadoDeAnioDeMalla } from './errores-malla';

const p2002 = (meta: Record<string, unknown>, code = 'P2002') => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'prueba', meta });
const conIndice = (index: string) => ({ driverAdapterError: { name: 'DriverAdapterError', cause: { kind: 'UniqueConstraintViolation', constraint: { index } } } });

describe('esDuplicadoDeAnioDeMalla', () => {
  it('reconoce el índice de (carrera, año) tal como lo entrega el adaptador pg', () => {
    expect(esDuplicadoDeAnioDeMalla(p2002(conIndice('version_malla_carrera_id_anio_key')))).toBe(true);
  });

  it('no confunde otra violación única de la misma tabla', () => {
    expect(esDuplicadoDeAnioDeMalla(p2002(conIndice('version_malla_archivo_id_key')))).toBe(false);
    expect(esDuplicadoDeAnioDeMalla(p2002(conIndice('usuario_correo_key')))).toBe(false);
  });

  it('acepta `target` como respaldo y rechaza uno que no corresponde', () => {
    expect(esDuplicadoDeAnioDeMalla(p2002({ target: ['carrera_id', 'anio'] }))).toBe(true);
    expect(esDuplicadoDeAnioDeMalla(p2002({ target: 'version_malla_carrera_id_anio_key' }))).toBe(true);
    expect(esDuplicadoDeAnioDeMalla(p2002({ target: ['archivo_id'] }))).toBe(false);
  });

  it('un P2002 sin información, otro código u otro tipo de error no cuentan', () => {
    expect(esDuplicadoDeAnioDeMalla(p2002({}))).toBe(false);
    expect(esDuplicadoDeAnioDeMalla(p2002(conIndice('version_malla_carrera_id_anio_key'), 'P2025'))).toBe(false);
    expect(esDuplicadoDeAnioDeMalla(new Error('P2002'))).toBe(false);
    expect(esDuplicadoDeAnioDeMalla(undefined)).toBe(false);
  });
});
