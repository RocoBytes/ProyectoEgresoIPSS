import { expect, test, type Page } from '@playwright/test';
import { CARLA, ingresar, pdf } from './ayudas';

/** Lee la cifra de «Ajustes cerrados con evidencia» del panel para un año de sesión. */
async function cerradosEnElPanel(page: Page, anio: string): Promise<number> {
  await page.goto(`/?anio=${anio}`);
  const tarjeta = page.getByRole('button', { name: /Ajustes cerrados con evidencia/ });
  await expect(tarjeta).toBeVisible();
  // La cifra es el único texto de la tarjeta compuesto solo por dígitos.
  return Number(await tarjeta.getByText(/^\d+$/).first().textContent());
}

test('Carla cierra un registro con evidencia y el panel cuenta uno más', async ({ page }) => {
  await ingresar(page, CARLA);

  // Se elige por los filtros de la pantalla: el alcance de Carla son los sectores Tecnologías e Ingeniería.
  await page.goto('/registros');
  await page.getByLabel('Estado', { exact: true }).selectOption({ label: 'Abierto' });
  // Se espera la respuesta filtrada: sin eso se podría leer la primera fila del listado anterior.
  const filtrado = page.waitForResponse((r) => r.url().includes('/api/registros?') && r.url().includes('sectorId='));
  await page.getByLabel('Sector', { exact: true }).selectOption({ label: 'Tecnologías' });
  await filtrado;
  const primera = page.getByRole('row').nth(1);
  const enlace = primera.getByRole('link', { name: /^R-\d{4}-\d+$/ });
  await expect(enlace).toBeVisible();
  const correlativo = (await enlace.textContent()) ?? '';
  const ruta = (await enlace.getAttribute('href')) ?? '';
  // El panel cuenta por año de la sesión, no del cierre: se mide en el año del registro elegido.
  const anio = ((await primera.getByRole('cell').nth(1).textContent()) ?? '').trim().slice(-4);

  const antes = await cerradosEnElPanel(page, anio);

  await page.goto(ruta);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar con evidencia' }).click();

  const dialogo = page.getByRole('dialog', { name: `Cerrar el registro ${correlativo}` });
  // La fecha efectiva llega con el día de hoy; basta con dejarla.
  await dialogo.getByLabel('Evidencia de cierre').setInputFiles(pdf('evidencia-cierre-e2e.pdf'));
  await dialogo.getByLabel('Comentario').fill('Cierre de la prueba de punta a punta.');
  await dialogo.getByRole('button', { name: 'Cerrar registro' }).click();

  await expect(page.getByText(`El registro ${correlativo} quedó cerrado.`)).toBeVisible();
  await expect(page.getByText(/^Cerrado · \d{2}-\d{2}-\d{4}$/)).toBeVisible();
  await expect(page.getByText(/Cerrado con fecha efectiva .* y evidencia “evidencia-cierre-e2e\.pdf”\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar con evidencia' })).toHaveCount(0);

  expect(await cerradosEnElPanel(page, anio)).toBe(antes + 1);
});
