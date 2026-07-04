// تصدير CSV متوافق مع Excel (بترميز UTF-8 BOM حتى تظهر العربية صحيحة).
import { todayLocalISO } from './finance';

/** علامة ترتيب البايتات — تجعل Excel يفتح الملف بترميز UTF-8 فتظهر العربية سليمة */
const UTF8_BOM = String.fromCharCode(0xFEFF);

/** يحوّل خلية إلى نص CSV آمن (يقتبس الفواصل وعلامات الاقتباس والأسطر) */
function csvCell(value: string | number | null | undefined): string {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** ينزّل ملف CSV من صفوف جاهزة. كل صف مصفوفة خلايا. */
export function downloadCSV(filename: string, rows: (string | number | null | undefined)[][]): void {
  const csv = UTF8_BOM + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** اسم ملف بتاريخ اليوم المحلي: prefix_YYYY-MM-DD.csv */
export function datedFilename(prefix: string): string {
  return `${prefix}_${todayLocalISO()}.csv`;
}
