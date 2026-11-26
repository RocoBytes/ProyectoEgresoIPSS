import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { INACTIVIDAD_MS, RENOVACION_MS, useInactividad } from './useInactividad';

const SEGUNDO = 1_000;
const MINUTO = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function montar() {
  const alExpirar = vi.fn();
  const alRenovar = vi.fn(() => Promise.resolve(true));
  const vista = renderHook(() => {
    useInactividad({ alExpirar, alRenovar });
  });
  return { alExpirar, alRenovar, vista };
}

describe('useInactividad', () => {
  it('cierra la sesión tras 15 minutos sin interacción', async () => {
    const { alExpirar } = montar();
    await vi.advanceTimersByTimeAsync(INACTIVIDAD_MS - MINUTO);
    expect(alExpirar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(MINUTO + 30 * SEGUNDO);
    expect(alExpirar).toHaveBeenCalledTimes(1);
  });

  it('con interacción renueva a los 10 minutos y no cierra la sesión', async () => {
    const { alExpirar, alRenovar } = montar();
    await vi.advanceTimersByTimeAsync(2 * SEGUNDO);
    window.dispatchEvent(new Event('keydown'));
    await vi.advanceTimersByTimeAsync(RENOVACION_MS);
    expect(alRenovar).toHaveBeenCalledTimes(1);
    expect(alExpirar).not.toHaveBeenCalled();

    // Sin nueva interacción no hay nada que mantener vivo: no vuelve a renovar.
    await vi.advanceTimersByTimeAsync(2 * MINUTO);
    expect(alRenovar).toHaveBeenCalledTimes(1);
  });

  it('mientras haya interacción nunca expira, aunque pasen más de 15 minutos', async () => {
    const { alExpirar, alRenovar } = montar();
    for (let i = 0; i < 8; i += 1) {
      await vi.advanceTimersByTimeAsync(5 * MINUTO);
      window.dispatchEvent(new Event('pointerdown'));
    }
    expect(alExpirar).not.toHaveBeenCalled();
    expect(alRenovar.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('si la renovación falla la reintenta en la siguiente revisión', async () => {
    const alExpirar = vi.fn();
    const alRenovar = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    renderHook(() => {
      useInactividad({ alExpirar, alRenovar });
    });
    await vi.advanceTimersByTimeAsync(2 * SEGUNDO);
    window.dispatchEvent(new Event('wheel'));
    await vi.advanceTimersByTimeAsync(RENOVACION_MS);
    expect(alRenovar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30 * SEGUNDO);
    expect(alRenovar).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2 * MINUTO);
    expect(alRenovar).toHaveBeenCalledTimes(2);
  });

  it('deja de escuchar al desmontar', async () => {
    const { alExpirar, vista } = montar();
    vista.unmount();
    await vi.advanceTimersByTimeAsync(INACTIVIDAD_MS * 2);
    expect(alExpirar).not.toHaveBeenCalled();
  });
});
