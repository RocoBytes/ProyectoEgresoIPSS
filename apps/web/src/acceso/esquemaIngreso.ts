import { z } from 'zod';

// Mensajes del prototipo v4. La API sigue siendo la autoridad: esto solo evita viajes inútiles.
const FORMA_DE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const esquemaIngreso = z.object({
  correo: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Escribe tu correo institucional.')
    .regex(FORMA_DE_CORREO, 'El correo no está completo. Debe tener la forma nombre@dominio.'),
  contrasena: z.string().min(1, 'Escribe tu contraseña.'),
});

export type ValoresIngreso = z.infer<typeof esquemaIngreso>;
