import { todayLocal } from '../../utils/date';
import type { ChecklistItem, Status, Template } from './types';
import { STATUS_LABELS } from './types';

export async function exportToExcel(
  template: Template,
  meta: { taskName: string; contentAuthor: string; verskaAuthor: string; taskType: string; checkDate: string },
  results: Record<number, Status>,
  testerName: string,
) {
  // Dynamically imported: exceljs is a ~900KB dependency that's only needed
  // when someone actually clicks "export," not every time this page loads.
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(meta.taskName.slice(0, 31) || 'Чеклист');
  ws.columns = [{ width: 22 }, { width: 65 }, { width: 12 }];

  ws.addRow(['Дата', meta.checkDate]);
  ws.addRow(['AIO ID', meta.taskName]);
  ws.addRow(['Контент', meta.contentAuthor]);
  ws.addRow(['Верстка', meta.verskaAuthor]);
  ws.addRow(['Тип задачи', meta.taskType]);
  ws.addRow(['Тестер', testerName]);

  const byCategory: Record<string, ChecklistItem[]> = {};
  for (const item of template.items) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }
  for (const [cat, items] of Object.entries(byCategory)) {
    ws.addRow([cat, '']);
    for (const item of items) {
      const status = results[item.id];
      ws.addRow(['', item.text, status ? STATUS_LABELS[status] : '']);
    }
  }
  ws.addRow([]);
  ws.addRow(['Экспорт', new Date().toLocaleString('ru-RU')]);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `checklist_${meta.taskName || template.name}_${meta.checkDate || todayLocal()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
