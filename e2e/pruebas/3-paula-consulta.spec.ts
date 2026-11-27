import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { abrirPrimerRegistro, ingresar, PAULA } from './ayudas';

test('Paula solo consulta: no ve acciones y descarga el acta', async ({ page }) => {
  await ingresar(page, PAULA);
  const navegacion = page.getByRole('navigation', { name: 'Secciones' });
  await expect(navegacion.getByRole('link', { name: 'Registros' })).toBeVisible();
  await expect(navegacion.getByRole('link', { name: 'Nueva sesión' })).toHaveCount(0);

  await abrirPrimerRegistro(page, 'estado=ABIERTO');
  await expect(page.getByText('Solo consulta')).toBeVisible();
  for (const nombre of ['Cerrar con evidencia', 'Anular', 'Editar']) {
    await expect(page.getByRole('button', { name: nombre, exact: true })).toHaveCount(0);
  }

  // En un registro abierto la única evidencia es la de origen y el acta va primero; su nombre no es parte de lo que se prueba.
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /^Descargar / }).first().click(),
  ]);
  expect(descarga.suggestedFilename()).toMatch(/\.pdf$/i);
  const contenido = await readFile(await descarga.path());
  expect(contenido.subarray(0, 4).equals(Buffer.from('%PDF'))).toBe(true);
});
