import { useState } from 'react';
import { checklistApi } from '../../api';
import { useEscapeKey } from '../../utils/a11y';
import { parseServerDate } from '../../utils/date';
import { EXPORT_COLUMNS } from './types';
import type { Submission } from './types';

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
      while (hasMore) {
        const res = await checklistApi.getSubmissions({ ...filters, offset } as any);
        rows.push(...res.data.rows);
        hasMore = res.data.hasMore;
        offset += 50;
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
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded p-6" style={{ background: '#1a1a2e', border: '2px solid rgba(29,158,117,0.4)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <p className="font-pixel text-primary" style={{ fontSize: '0.6rem', lineHeight: 1.8 }}>Экспорт отчёта</p>
          <button onClick={onClose} aria-label="Закрыть" className="text-pixel/60 cursor-pointer hover:text-pixel/80">✕</button>
        </div>
        <p className="text-pixel/50 text-xs font-sans mb-3">Экспортируются записи с учётом применённых фильтров истории. Выберите колонки:</p>
        <div className="space-y-1.5 mb-4">
          {EXPORT_COLUMNS.map(c => (
            <label key={c.key} className="flex items-center gap-2 text-xs font-sans cursor-pointer" style={{ color: 'rgba(232,232,208,0.75)' }}>
              <input type="checkbox" checked={selected.has(c.key)} onChange={() => toggle(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
        {error && <p className="text-xs font-sans mb-3" style={{ color: '#e05252' }}>{error}</p>}
        <button
          onClick={runExport}
          disabled={exporting}
          className="w-full py-3 text-sm font-sans font-semibold rounded cursor-pointer disabled:opacity-50"
          style={{ background: '#1D9E75', color: '#0f0f1a' }}
        >
          {exporting ? 'Формирую...' : '⬇ Скачать Excel'}
        </button>
      </div>
    </div>
  );
}
