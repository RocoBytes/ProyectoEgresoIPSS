import { expect, type Page } from '@playwright/test';
import { Buffer } from 'node:buffer';

// Usuarios y clave de los datos de ejemplo (`npm run semilla`).
export const CLAVE = 'Demo-2026';
export const CARLA = 'carla.fuentes@instituto.example';
export const PAULA = 'paula.henriquez@instituto.example';

/** PDF mínimo: la API valida el contenido con `file-type`, así que basta la firma `%PDF-` al inicio. */
export function pdf(nombre: string) {
  return {
    name: nombre,
    mimeType: 'application/pdf',
    buffer: Buffer.from(`%PDF-1.4\n% Archivo de la prueba de punta a punta: ${nombre}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`),
  };
}

/** Fecha AAAA-MM-DD en Santiago, desplazada `dias` días. La API compara contra el día de Santiago, no el del navegador. */
export function fechaSantiago(dias = 0): string {
  const base = new Date(Date.now() + dias * 86_400_000);
  return base.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

/** Inicia sesión por el formulario real y espera a que cargue la estructura de la aplicación. */
export async function ingresar(page: Page, correo: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo institucional').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible();
}

/** Abre el listado con un filtro de estado y devuelve el correlativo del primer registro. */
export async function abrirPrimerRegistro(page: Page, filtros: string) {
  await page.goto(`/registros?${filtros}`);
  const primero = page.getByRole('row').nth(1).getByRole('link', { name: /^R-\d{4}-\d+$/ });
  await expect(primero).toBeVisible();
  const correlativo = (await primero.textContent()) ?? '';
  await primero.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  return correlativo;
}
