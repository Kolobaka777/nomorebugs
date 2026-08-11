import { useState } from 'react';
import { checklistApi } from '../../api';
import { useEscapeKey } from '../../utils/a11y';
import { parseServerDate } from '../../utils/date';
import { EXPORT_COLUMNS } from './types';
import type { Submission } from './types';
import Modal from '../Modal';
import Icon from '../Icon';
import { ACCENT, PAGE_BG, TEXT_MUTED } from '../../utils/theme';

// Exports the currently-filtered submission list (not just the visible
// page) to Excel — loops through every page via the existing paginated
// endpoint rather than needing a separate server export route.
export default function ExportModal({ filters, onClose }: { filters: Record<string, string>; onClose: () => void }) {
  useEscapeKey(onClose);
  const [selected, setSelected] = useState<Set<string>>(new Set(EXPORT_COLUMNS.map(c => c.key)));
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const runExport = async () => {
    if (selected.size === 0) { setError('Выберите хотя бы одну колонку'); return; }
    setExporting(true);
    setError('');
    try {
      const rows: Submission[] = [];
      let offset = 0;
      let hasMore = true;
      const EXPORT_PAGE_SIZE = 500;
      while (hasMore) {
        const res = await checklistApi.getSubmissions({ ...filters, offset, limit: EXPORT_PAGE_SIZE } as any);
        rows.push(...res.data.rows);
        hasMore = res.data.hasMore;
        offset += EXPORT_PAGE_SIZE;
        if (offset > 5000) break; // sane upper bound, not a silent truncation in practice
      }

      const { default: ExcelJS } = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Отчёт');
      const cols = EXPORT_COLUMNS.filter(c => selected.has(c.key));
      ws.columns = cols.map(c => ({ header: c.label, key: c.key, width: 24 }));
      ws.addRow(cols.map(c => c.label));
      for (const row of rows) {
        ws.addRow(cols.map(c => {
          if (c.key === 'submitted_at') return parseServerDate(row.submitted_at).toLocaleString('ru-RU');
          return (row as any)[c.key] ?? '';
        }));
      }
      // Ошибок/всего — always useful, appended regardless of column picker
      // since it's not free-typed data like the others, just a derived count.
      ws.getRow(1).values = [...cols.map(c => c.label), 'Ошибок/Всего'];
      rows.forEach((row, i) => {
        ws.getCell(i + 2, cols.length + 1).value = `${row.fail_count}/${row.total_items}`;
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `checklists_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      console.error(e);
      setError('Не удалось сформировать отчёт');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal title="Экспорт отчёта" onClose={onClose} maxWidth={448}>
        <p className="font-geist text-xs mb-3" style={{ color: TEXT_MUTED }}>Экспортируются записи с учётом применённых фильтров истории. Выберите колонки:</p>
        <div className="space-y-1.5 mb-4">
          {EXPORT_COLUMNS.map(c => (
            <label key={c.key} className="flex items-center gap-2 text-xs font-geist cursor-pointer" style={{ color: 'rgba(197, 198, 199,0.75)' }}>
              <input type="checkbox" checked={selected.has(c.key)} onChange={() => toggle(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
        {error && <p className="text-xs font-geist mb-3" style={{ color: '#e05252' }}>{error}</p>}
        <button
          onClick={runExport}
          disabled={exporting}
          className="w-full py-3 text-sm font-geist font-semibold rounded-lg cursor-pointer disabled:opacity-50 transition-transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
          style={{ background: ACCENT, color: PAGE_BG }}
        >
          <Icon name="floppy" size={16} color="currentColor" />
          {exporting ? 'Формирую...' : 'Скачать Excel'}
        </button>
    </Modal>
  );
}
