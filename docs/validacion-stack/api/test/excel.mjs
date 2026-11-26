// exceljs 4.4.0 con uuid forzado a 11.1.1: escribe y vuelve a leer un libro; una celda que empieza con "=" queda como texto.
import ExcelJS from 'exceljs';
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Registros');
ws.columns = [{ header: 'N°', key: 'c', width: 14 }, { header: 'Descripción', key: 'd', width: 50 }, { header: 'Fecha comprometida', key: 'f', width: 20 }];
ws.addRow({ c: 'R-2026-001', d: '=HYPERLINK("http://malo.example","clic")', f: '2026-12-01' });
ws.addTable({ name: 'T', ref: 'E1', columns: [{ name: 'a' }], rows: [[1]] }); // las tablas son las que usan uuid internamente
const buf = await wb.xlsx.writeBuffer();
const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(buf);
const celda = wb2.getWorksheet('Registros').getCell('B2');
console.log(`xlsx de ${buf.byteLength} bytes; B2 tipo=${celda.type === ExcelJS.ValueType.String ? 'texto' : celda.type} formula=${celda.formula ?? 'ninguna'} (Node ${process.version})`);
