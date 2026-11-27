import { expect, test } from '@playwright/test';
import { CARLA, fechaSantiago, ingresar, pdf } from './ayudas';

test('Carla registra una sesión con acta y un registro, y lo encuentra en Registros', async ({ page }) => {
  await ingresar(page, CARLA);
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Nueva sesión' }).click();
  await expect(page.getByRole('button', { name: 'Guardar sesión' })).toBeVisible();

  // Un nombre único evita confundir esta corrida con registros anteriores si la base se reutiliza.
  const instancia = `Comité sectorial de prueba ${String(Date.now())}`;
  await page.getByLabel('Canal', { exact: true }).selectOption({ label: 'Comité sectorial' });
  await page.getByLabel('Fecha de la sesión').fill(fechaSantiago());
  await page.getByLabel('Nombre de la instancia').fill(instancia);
  await page.getByLabel('Participantes').fill('Carla Fuentes (Directora Sectorial)\nInvitado de la prueba');
  await page.getByLabel('Acta de la sesión').setInputFiles(pdf('acta-e2e.pdf'));
  await expect(page.getByRole('button', { name: 'Quitar acta-e2e.pdf' })).toBeVisible();

  await page.getByLabel('Sector', { exact: true }).selectOption({ label: 'Tecnologías' });
  await page.getByLabel('Carrera', { exact: true }).selectOption({ label: 'Ingeniería en Informática' });
  await page.getByLabel('Nivel de impacto').selectOption({ label: 'Perfil de egreso' });
  await page.getByLabel('Descripción de lo observado').fill('Incorporar competencias de ciberseguridad en el perfil de egreso.');
  await page.getByLabel('Fecha comprometida').fill(fechaSantiago(60));

  await page.getByRole('button', { name: 'Guardar sesión' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Guardar la sesión' });
  await expect(dialogo.getByText('Ingeniería en Informática')).toBeVisible();
  await dialogo.getByRole('button', { name: 'Confirmar y guardar' }).click();

  await expect(page.getByRole('heading', { name: 'Sesión registrada' })).toBeVisible();
  await expect(page.getByText('Se guardó la sesión con 1 registro')).toBeVisible();
  const folio = page.getByRole('link', { name: /^R-\d{4}-\d+$/ });
  await expect(folio).toBeVisible();
  const correlativo = (await folio.textContent()) ?? '';

  // El listado ordena por fecha de sesión descendente: la sesión de hoy queda en la primera página.
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Registros' }).click();
  const fila = page.getByRole('row').filter({ hasText: correlativo });
  await expect(fila).toBeVisible();
  await expect(fila).toContainText('Ingeniería en Informática');
  await expect(fila).toContainText('Perfil de egreso');
  await expect(fila).toContainText('Abierto');
});
