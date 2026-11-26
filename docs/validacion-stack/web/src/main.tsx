import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Bar, BarChart, ResponsiveContainer, XAxis } from 'recharts';

// Formulario de sesión con N registros: la pieza de mayor riesgo del Sprint 1
const esquema = z.object({
  canal: z.string().min(1),
  fecha: z.iso.date(),
  registros: z.array(z.object({ carreraId: z.string().min(1), descripcion: z.string().min(10), fechaComprometida: z.iso.date() })).min(1),
});
type Sesion = z.infer<typeof esquema>;
type Fila = { correlativo: string; estado: string };
const col = createColumnHelper<Fila>();
const columnas = [col.accessor('correlativo', { header: 'N°' }), col.accessor('estado', { header: 'Estado' })];

function Pagina() {
  const { register, control, handleSubmit } = useForm<Sesion>({ resolver: zodResolver(esquema), defaultValues: { canal: '', fecha: '', registros: [{ carreraId: '', descripcion: '', fechaComprometida: '' }] } });
  const { fields, append } = useFieldArray({ control, name: 'registros' });
  const { data = [] } = useQuery({ queryKey: ['registros'], queryFn: async (): Promise<Fila[]> => [{ correlativo: 'R-2026-001', estado: 'abierto' }] });
  const tabla = useReactTable({ data, columns: columnas, getCoreRowModel: getCoreRowModel() });
  return (
    <main className="p-6 font-sans">
      <form onSubmit={handleSubmit(v => console.log(v))}>
        <input {...register('canal')} /> <input type="date" {...register('fecha')} />
        {fields.map((f, i) => <textarea key={f.id} {...register(`registros.${i}.descripcion`)} />)}
        <button type="button" onClick={() => append({ carreraId: '', descripcion: '', fechaComprometida: '' })}>Agregar registro</button>
      </form>
      <table><tbody>{tabla.getRowModel().rows.map(r => <tr key={r.id}>{r.getVisibleCells().map(c => <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}</tr>)}</tbody></table>
      <ResponsiveContainer width="100%" height={200}><BarChart data={[{ mes: 'nov', n: 3 }]}><XAxis dataKey="mes" /><Bar dataKey="n" /></BarChart></ResponsiveContainer>
    </main>
  );
}
const router = createBrowserRouter([{ path: '/', element: <Pagina /> }]);
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider></StrictMode>);
