// Prueba de humo HTTP contra la API compilada. Levanta tres instancias para aislar el contador de intentos.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

let ok = 0, fallas = 0;
const paso = (nombre, cond, detalle = '') => { cond ? ok++ : fallas++; console.log(`${cond ? 'OK   ' : 'FALLA'} ${nombre}${detalle ? ' -> ' + detalle : ''}`); };

async function levantar(puerto, env = {}) {
  const p = spawn(process.execPath, ['dist/main.js'], { env: { ...process.env, PORT: String(puerto), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let salida = '';
  p.stderr.on('data', d => (salida += d));
  await new Promise((res, rej) => {
    p.stdout.on('data', d => { salida += d; if (String(d).includes('listo')) res(); });
    p.on('exit', c => rej(new Error('la API terminó con código ' + c + '\n' + salida)));
    setTimeout(() => rej(new Error('no arrancó\n' + salida)), 15000);
  });
  return { url: `http://127.0.0.1:${puerto}`, cerrar: () => p.kill(), salida: () => salida };
}
const login = (url, cuerpo, xff) => fetch(url + '/login', { method: 'POST', headers: { 'content-type': 'application/json', ...(xff ? { 'x-forwarded-for': xff } : {}) }, body: JSON.stringify(cuerpo) });
const subir = (url, bytes, nombre, tipo) => { const fd = new FormData(); fd.append('archivo', new Blob([bytes], { type: tipo }), nombre); return fetch(url + '/evidencias', { method: 'POST', body: fd }); };
const BUENA = { correo: 'director@ipss.cl', contrasena: 'Clave-de-prueba-2026' };
const MALA = { correo: 'director@ipss.cl', contrasena: 'incorrecta-123' };

// ---------- Instancia 1: funciones generales (sin trust proxy)
const a = await levantar(3901);
paso('A arranque e inyección de dependencias', true, a.salida().trim());
let r = await fetch(a.url + '/ip');
const cab = r.headers;
paso('B cabeceras de helmet', cab.get('x-content-type-options') === 'nosniff' && !!cab.get('content-security-policy') && !cab.get('x-powered-by'), `nosniff, CSP presente, sin x-powered-by`);
r = await login(a.url, { ...BUENA, rol: 'DIRECTOR_SECTORIAL' });
paso('C campo no declarado en el DTO se rechaza', r.status === 400, `${r.status} ${(await r.json()).message}`);
let t0 = performance.now(); r = await login(a.url, BUENA); const tPrimera = Math.round(performance.now() - t0);
t0 = performance.now(); const r2 = await login(a.url, BUENA); const tVerif = Math.round(performance.now() - t0);
const cookie = r.headers.get('set-cookie') ?? '';
paso('D login con argon2id y cookie de sesión', r.status === 200 && /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) && /SameSite=Strict/i.test(cookie), `hash+verificación ${tPrimera} ms, verificación sola ${tVerif} ms; ${cookie.split(';').slice(1).join(';').trim()}`);

const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
r = await subir(a.url, pdf, 'Acta comité Ñuñoa.pdf', 'application/pdf'); let j = await r.json();
paso('F PDF real aceptado y hash correcto', r.status === 201 && j.mime === 'application/pdf' && j.sha256 === createHash('sha256').update(pdf).digest('hex'), `sha256 ${j.sha256?.slice(0, 12)}…`);
paso('F nombre con tilde y Ñ llega intacto', j.nombreRecibido === 'Acta comité Ñuñoa.pdf', `recibido "${j.nombreRecibido}" | reinterpretado latin1→utf8 "${j.nombreCorregido}"`);
r = await subir(a.url, Buffer.from('<html><script>alert(1)</script></html>'), 'acta.pdf', 'application/pdf'); j = await r.json();
paso('G HTML con extensión .pdf rechazado', r.status === 400, j.message);
const png = process.env.PNG ? await readFile(process.env.PNG) : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
r = await subir(a.url, png, 'foto-sesion.png', 'image/png'); j = await r.json();
paso('H PNG real aceptado', r.status === 201 && j.mime === 'image/png', `${j.tamano} bytes`);
r = await subir(a.url, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'foto.png', 'image/png'); j = await r.json();
paso('I SVG con script renombrado a .png rechazado', r.status === 400, j.message);
r = await subir(a.url, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(21 * 1024 * 1024)]), 'grande.pdf', 'application/pdf');
paso('J archivo de 21 MB rechazado', r.status === 413, String(r.status));
r = await subir(a.url, Buffer.from('%PDF-1.4\n<html><script>alert(document.cookie)</script></html>'), 'poliglota.pdf', 'application/pdf'); j = await r.json();
console.log(`INFO  K archivo que empieza con %PDF y contiene HTML: ${r.status} ${j.mime ?? j.message} (la validación mira solo los primeros bytes)`);
a.cerrar();

// ---------- Instancia 2: límite de intentos SIN trust proxy (como queda detrás de Caddy por defecto)
const b = await levantar(3902);
r = await fetch(b.url + '/ip', { headers: { 'x-forwarded-for': '198.51.100.1' } });
console.log('INFO  E sin trust proxy, la API ve:', JSON.stringify(await r.json()));
const cod1 = []; for (let i = 0; i < 5; i++) cod1.push((await login(b.url, MALA, '198.51.100.1')).status);
r = await login(b.url, BUENA, '198.51.100.2');
paso('E sin trust proxy: 5 fallos de un usuario bloquean a otro usuario distinto', r.status === 429, `intentos del atacante ${cod1.join(',')}; director legítimo desde otra IP: ${r.status}`);
b.cerrar();

// ---------- Instancia 3: límite de intentos CON trust proxy = 1
const c = await levantar(3903, { TRUST_PROXY: '1' });
r = await fetch(c.url + '/ip', { headers: { 'x-forwarded-for': '198.51.100.1' } });
console.log('INFO  E con trust proxy=1, la API ve:', JSON.stringify(await r.json()));
const cod2 = []; for (let i = 0; i < 6; i++) cod2.push((await login(c.url, MALA, '198.51.100.1')).status);
r = await login(c.url, BUENA, '198.51.100.2');
paso('E con trust proxy: el bloqueo afecta solo a la IP que falló', cod2[5] === 429 && r.status === 200, `atacante ${cod2.join(',')}; director legítimo: ${r.status}`);
const cod3 = []; for (let i = 0; i < 8; i++) cod3.push((await login(c.url, MALA, `203.0.113.${i + 1}`)).status);
console.log(`INFO  E con trust proxy, si el proxy no sobrescribe X-Forwarded-For, rotar la cabecera evita el bloqueo: ${cod3.join(',')}`);
c.cerrar();

console.log(`\nResultado: ${ok} correctas, ${fallas} fallas (Node ${process.version})`);
process.exit(fallas ? 1 : 0);
