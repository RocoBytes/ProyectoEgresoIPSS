# 0014. Componentes de interfaz sin Radix

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

`CLAUDE.md` define Tailwind 4 con componentes shadcn/ui. Esos componentes se apoyan en Radix: solo el diálogo suma unos 16 paquetes, y la auditoría de seguridad de este proyecto (ADR 0008) pide limitar la superficie de dependencias. El hito 2 necesita botón, campos, selector, diálogo, pill, tarjeta y folio. El prototipo v4 ya usa selects nativos.

## Decisión

- **Componentes propios** en `apps/web/src/comun/ui/`, con el estilo de shadcn/ui: Tailwind y `class-variance-authority` para las variantes, y `clsx` con `tailwind-merge` para unir clases (`cn()`).
- **Selector sobre `<select>` nativo.** Da teclado, lector de pantalla y selector móvil sin código propio.
- **Diálogo sobre `<dialog>` con `showModal()`.**
  - Atrapa el foco, deja el resto de la página inerte y se cierra con Escape.
  - Al cerrarse, el foco vuelve al control que lo abrió.
  - El contenido se monta solo mientras está abierto, así cada formulario empieza limpio.
- **`@fontsource/ibm-plex-mono`** para el folio, como en el prototipo, alojada en la app sin pedir nada a Google Fonts.
- **No se usa Radix.**

## Consecuencias

- **Dependencias.** Se suman 4 pequeñas, sin scripts de instalación, todas bajo las reglas de `.npmrc`.
- **Pruebas.** jsdom no implementa `showModal`, así que en las pruebas el diálogo usa el atributo `open`. La captura de foco y el bloqueo de la página se comprueban en el navegador, no en Vitest.
- **Límites.** Un `<select>` nativo no se puede estilizar por dentro. Si más adelante hace falta un combobox con búsqueda o un menú complejo, se reevalúa Radix u otra librería con su propio ADR.
- **Nombres.** Los componentes se llaman como en el dominio (Boton, Campo, Selector, Dialogo) y no como en shadcn, así que no se pueden reemplazar copiando componentes de shadcn sin adaptarlos.
