import * as XLSX from 'xlsx';

export type ExcelRow = Record<string, string | number | boolean | null>;

export function parseExcelFile(file: File): Promise<ExcelRow[]> {
  return new Promise((resolve, reject) => {
    const isCSV =
      file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));

    if (isCSV) {
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result as string, { type: 'string' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json<ExcelRow>(sheet, { defval: null }));
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    } else {
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json<ExcelRow>(sheet, { defval: null }));
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  });
}
