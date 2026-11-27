import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialogo } from './Dialogo';

function Ejemplo() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}>
        Abrir
      </button>
      <Dialogo abierto={abierto} titulo="Mi diálogo" alCerrar={() => setAbierto(false)}>
        <p>Contenido</p>
      </Dialogo>
    </>
  );
}

describe('Dialogo', () => {
  it('se abre, se cierra con Escape y devuelve el foco a quien lo abrió', () => {
    render(<Ejemplo />);
    const abrir = screen.getByRole('button', { name: 'Abrir' });
    abrir.focus();
    expect(screen.queryByText('Contenido')).toBeNull();
    fireEvent.click(abrir);
    expect(screen.getByRole('dialog', { name: 'Mi diálogo' })).toBeTruthy();
    expect(screen.getByText('Contenido')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByText('Contenido')).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });
});
