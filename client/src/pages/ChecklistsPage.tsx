import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import { checklistApi, knowledgeApi } from '../api';
import PixelIcon, { IconName } from '../components/PixelIcon';
import { clickableProps, useEscapeKey } from '../utils/a11y';
import { parseServerDate, localDayStartUTC, localDayEndUTC } from '../utils/date';
import { showApiError } from '../utils/toast';

interface Props { user: any; onLogout: () => void; }

interface Template {
  id: number;
  name: string;
  task_type: string;
  color: string;
  order_num: number;
  items: { id: number; category: string; text: string; order_num: number }[];
}

interface Stats {
  byTemplate: { id: number; name: string; color: string; submissions: number }[];
  topFails: { item_text: string; category: string; template_name: string; color: string; fail_count: number; total_checks: number }[];
  byTester: { tester_name: string; avatar_initials: string; submissions: number; bugs_found: number }[];
  byContentAuthor: { content_author: string; submissions: number; bugs_found: number }[];
  byVerskaAuthor: { verska_author: string; submissions: number; bugs_found: number }[];
}

interface Submission {
  id: number; task_name: string; content_author: string; verska_author: string;
  task_type: string; check_date: string; submitted_at: string;
  tester_name: string; avatar_initials: string;
  template_name: string; color: string; fail_count: number; total_items: number;
}

interface SubmissionDetail extends Submission {
  results: { status: string; text: string; category: string; order_num: number; note?: string }[];
}

type Tab = 'checklists' | 'history' | 'stats';
type StatsTab = 'fails' | 'testers' | 'content' | 'verska';

const CATEGORY_COLORS: Record<string, string> = {
  'Критически важно!': '#e05252',
  'Визуал': '#7F77DD',
  'Функционал': '#1D9E75',
  'Ссылки': '#EF9F27',
  'Картинки': '#4fc3f7',
  'Пунктуация': '#ff8a65',
  'Смысловая нагрузка': '#a5d6a7',
  'Квитанция': '#ce93d8',
  'Комментарии': '#80deea',
  'Новые проверки': '#ffcc02',
};
const catColor = (cat: string) => CATEGORY_COLORS[cat] || '#1D9E75';

function SubmissionDetailModal({ sub, onClose }: { sub: SubmissionDetail; onClose: () => void }) {
  useEscapeKey(onClose);
  const fails = sub.results.filter(r => r.status === 'fail');
  const oks = sub.results.filter(r => r.status === 'ok');

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded"
        style={{ background: '#1a1a2e', border: `2px solid ${sub.color}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 px-5 py-3 flex items-center justify-between" style={{ background: '#1a1a2e', borderBottom: '1px solid rgba(232,232,208,0.08)' }}>
          <div>
            <p className="text-pixel font-sans font-semibold text-sm">{sub.task_name}</p>
            <p className="text-pixel/60 text-xs font-sans mt-0.5">
              {sub.tester_name} · {sub.template_name} · {parseServerDate(sub.submitted_at).toLocaleDateString('ru-RU')}
            </p>
            {(sub.content_author || sub.verska_author) && (
              <p className="text-pixel/55 text-xs font-sans mt-0.5">
                {sub.content_author && `Контент: ${sub.content_author}`}
                {sub.content_author && sub.verska_author && ' · '}
                {sub.verska_author && `Верстка: ${sub.verska_author}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-sans font-semibold" style={{ color: '#e05252' }}>{fails.length} ✗</span>
            <span className="text-xs font-sans font-semibold" style={{ color: '#1D9E75' }}>{oks.length} ✓</span>
            <button onClick={onClose} aria-label="Закрыть детали проверки" className="text-pixel/60 text-lg cursor-pointer hover:text-pixel/80 ml-2">✕</button>
          </div>
        </div>
        <div className="p-5">
          {fails.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-sans font-semibold mb-3" style={{ color: '#e05252' }}>✗ Ошибки ({fails.length})</p>
              <div className="space-y-1.5">
                {fails.map((r, i) => (
                  <div key={i} className="flex gap-3 items-start p-2 rounded" style={{ background: 'rgba(224,82,82,0.06)' }}>
                    <span style={{ color: '#e05252', flexShrink: 0, fontSize: '0.8rem' }}>✗</span>
                    <div>
                      <span className="text-xs font-sans px-1.5 py-0.5 rounded mr-2" style={{ background: `${catColor(r.category)}20`, color: catColor(r.category), fontSize: '0.6rem' }}>{r.category}</span>
                      <span className="text-sm font-sans" style={{ color: 'rgba(232,232,208,0.75)' }}>{r.text}</span>
                      {r.note && (
                        <p className="text-xs font-sans mt-1" style={{ color: 'rgba(232,232,208,0.55)' }}>{r.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {oks.length > 0 && (
            <div>
              <p className="text-xs font-sans font-semibold mb-3" style={{ color: '#1D9E75' }}>✓ ОК ({oks.length})</p>
              <div className="space-y-1">
                {oks.map((r, i) => (
                  <div key={i} className="flex gap-3 items-center py-1" style={{ borderBottom: '1px solid rgba(29,158,117,0.08)' }}>
                    <span style={{ color: '#1D9E75', flexShrink: 0, fontSize: '0.8rem' }}>✓</span>
                    <span className="text-xs font-sans" style={{ color: 'rgba(232,232,208,0.6)' }}>{r.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: (id: number) => void }) {
  useEscapeKey(onClose);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#7F77DD');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ id: number; item_count: number; category_count: number; warning: string | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const COLORS = ['#1D9E75', '#7F77DD', '#EF9F27', '#e05252', '#4fc3f7', '#ff8a65'];

  const handleImport = async () => {
    if (!name.trim()) { setError('Введите название'); return; }
    if (!file) { setError('Выберите файл'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await checklistApi.importTemplate(file, name.trim(), color);
      // Show a summary instead of closing immediately — the import parser
      // is a best-effort heuristic (category detection can misfire on an
      // unexpected file layout), so surfacing what actually got imported
      // lets the lead catch a bad parse right away instead of discovering
      // it later when testers use a broken checklist.
      setResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Ошибка загрузки');
    } finally {
      setLoading(false);
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
          <p className="font-pixel text-primary" style={{ fontSize: '0.6rem', lineHeight: 1.8 }}>Импорт чеклиста из Excel</p>
          <button onClick={onClose} aria-label="Закрыть окно импорта" className="text-pixel/60 cursor-pointer hover:text-pixel/80">✕</button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div
              className="rounded p-4"
              style={{
                background: result.warning ? 'rgba(239,159,39,0.08)' : 'rgba(29,158,117,0.08)',
                border: `1px solid ${result.warning ? 'rgba(239,159,39,0.35)' : 'rgba(29,158,117,0.35)'}`,
              }}
            >
              <p className="text-sm font-sans font-semibold mb-1" style={{ color: result.warning ? '#EF9F27' : '#1D9E75' }}>
                {result.warning ? '⚠ Импортировано, но стоит проверить' : '✓ Импортировано успешно'}
              </p>
              <p className="text-xs font-sans" style={{ color: 'rgba(232,232,208,0.7)' }}>
                {result.item_count} пункт(ов) в {result.category_count} категори{result.category_count === 1 ? 'и' : 'ях'}
              </p>
              {result.warning && (
                <p className="text-xs font-sans mt-2" style={{ color: 'rgba(232,232,208,0.7)' }}>{result.warning}</p>
              )}
            </div>
            <button
              onClick={() => onImported(result.id)}
              className="w-full py-3 text-sm font-sans font-semibold rounded cursor-pointer"
              style={{ background: '#1D9E75', color: '#0f0f1a' }}
            >
              Готово
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-pixel/60 text-xs font-sans mb-2">Название шаблона *</label>
              <input className="pixel-input" value={name} onChange={e => setName(e.target.value)} placeholder="Например: Прелендинг v2" />
            </div>

            <div>
              <label className="block text-pixel/60 text-xs font-sans mb-2">Цвет</label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className="w-7 h-7 rounded cursor-pointer transition-transform"
                    style={{ background: c, outline: color === c ? `3px solid #fff` : 'none', outlineOffset: 2, transform: color === c ? 'scale(1.2)' : 'scale(1)' }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-pixel/60 text-xs font-sans mb-2">Excel файл (.xlsx) *</label>
              <div
                className="p-4 rounded border-2 border-dashed text-center cursor-pointer transition-colors"
                style={{ borderColor: file ? '#1D9E75' : 'rgba(232,232,208,0.1)', background: file ? 'rgba(29,158,117,0.05)' : 'transparent' }}
                onClick={() => fileRef.current?.click()}
                {...clickableProps(() => fileRef.current?.click())}
              >
                {file
                  ? <p className="text-xs font-sans" style={{ color: '#1D9E75' }}>✓ {file.name}</p>
                  : <p className="text-xs font-sans" style={{ color: 'rgba(232,232,208,0.55)' }}>Нажмите для выбора файла</p>
                }
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>
            </div>

            {error && <p className="text-xs font-sans" style={{ color: '#e05252' }}>{error}</p>}

            <button
              onClick={handleImport}
              disabled={loading}
              className="w-full py-3 text-sm font-sans font-semibold rounded cursor-pointer"
              style={{ background: '#1D9E75', color: '#0f0f1a', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Загружаю...' : 'Импортировать'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubmissionsList({
  submissions,
  loading,
  onOpenDetail,
}: {
  submissions: Submission[];
  loading: boolean;
  onOpenDetail: (id: number) => void;
}) {
  return (
    <div className="space-y-2">
      {loading && <SnailLoader />}
      {!loading && submissions.length === 0 && (
        <p className="text-pixel/55 text-sm font-sans text-center py-8">Нет проверок</p>
      )}
      {submissions.map(sub => {
        const failRate = sub.total_items > 0 ? Math.round((sub.fail_count / sub.total_items) * 100) : 0;
        return (
          <div
            key={sub.id}
            className="p-3 flex items-center gap-4 cursor-pointer transition-all"
            style={{
              background: '#1a1a2e',
              borderTop:    '2px solid rgba(255,255,255,0.1)',
              borderLeft:   '2px solid rgba(255,255,255,0.1)',
              borderBottom: '2px solid rgba(0,0,0,0.45)',
              borderRight:  '2px solid rgba(0,0,0,0.45)',
              outline: `1px solid ${sub.color}35`,
              outlineOffset: '-3px',
            }}
            onClick={() => onOpenDetail(sub.id)}
            {...clickableProps(() => onOpenDetail(sub.id))}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <div className="w-7 h-7 rounded flex items-center justify-center font-pixel text-xs shrink-0" style={{ background: sub.color, color: '#0f0f1a' }}>
              {sub.avatar_initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-pixel text-xs font-sans font-semibold leading-snug">{sub.task_name}</p>
              <p className="text-pixel/60 text-xs font-sans">
                {sub.tester_name} · {sub.template_name}
                {sub.content_author && ` · К: ${sub.content_author}`}
                {sub.verska_author && ` · В: ${sub.verska_author}`}
                {' · '}{parseServerDate(sub.submitted_at).toLocaleDateString('ru-RU')}
              </p>
            </div>
            <div className="text-right shrink-0">
              {sub.fail_count > 0
                ? <p className="text-xs font-sans font-semibold" style={{ color: '#e05252' }}>{sub.fail_count} ошибок ({failRate}%)</p>
                : <p className="text-xs font-sans font-semibold" style={{ color: '#1D9E75' }}>Всё ОК ✓</p>
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CreateTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  useEscapeKey(onClose);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#7F77DD');
  const [items, setItems] = useState<{ category: string; text: string }[]>([{ category: 'Общее', text: '' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const COLORS = ['#1D9E75', '#7F77DD', '#EF9F27', '#e05252', '#4fc3f7', '#ff8a65'];

  const updateItem = (idx: number, field: 'category' | 'text', value: string) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError('Введите название'); return; }
    const cleanItems = items.filter(i => i.text.trim());
    if (cleanItems.length === 0) { setError('Добавьте хотя бы один пункт'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await checklistApi.createTemplate({ name: name.trim(), color, items: cleanItems });
      onCreated(res.data.id);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Ошибка создания');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded p-6 max-h-[85vh] overflow-y-auto" style={{ background: '#1a1a2e', border: '2px solid rgba(29,158,117,0.4)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <p className="font-pixel text-primary" style={{ fontSize: '0.6rem', lineHeight: 1.8 }}>Новый чеклист вручную</p>
          <button onClick={onClose} aria-label="Закрыть" className="text-pixel/60 cursor-pointer hover:text-pixel/80">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-pixel/60 text-xs font-sans mb-2">Название шаблона *</label>
            <input className="pixel-input" value={name} onChange={e => setName(e.target.value)} placeholder="Например: Быстрая проверка формы" />
          </div>

          <div>
            <label className="block text-pixel/60 text-xs font-sans mb-2">Цвет</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded cursor-pointer transition-transform"
                  style={{ background: c, outline: color === c ? `3px solid #fff` : 'none', outlineOffset: 2, transform: color === c ? 'scale(1.2)' : 'scale(1)' }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-pixel/60 text-xs font-sans mb-2">Пункты проверки</label>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    className="pixel-input text-xs"
                    style={{ width: 110 }}
                    placeholder="Категория"
                    value={item.category}
                    onChange={e => updateItem(idx, 'category', e.target.value)}
                  />
                  <input
                    className="pixel-input text-xs flex-1"
                    placeholder="Текст пункта"
                    value={item.text}
                    onChange={e => updateItem(idx, 'text', e.target.value)}
                  />
                  <button
                    onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                    className="text-xs shrink-0"
                    style={{ color: '#e05252' }}
                    aria-label="Удалить пункт"
                  >✕</button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setItems(prev => [...prev, { category: prev[prev.length - 1]?.category || 'Общее', text: '' }])}
              className="btn-secondary text-xs px-3 py-1.5 mt-2"
            >
              + Пункт
            </button>
          </div>

          {error && <p className="text-xs font-sans" style={{ color: '#e05252' }}>{error}</p>}

          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full py-3 text-sm font-sans font-semibold rounded cursor-pointer disabled:opacity-50"
            style={{ background: '#1D9E75', color: '#0f0f1a' }}
          >
            {loading ? '...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}

const EXPORT_COLUMNS: { key: keyof Submission; label: string }[] = [
  { key: 'tester_name', label: 'Тестировщик' },
  { key: 'template_name', label: 'Чеклист' },
  { key: 'task_type', label: 'Тип задачи' },
  { key: 'task_name', label: 'Задача' },
  { key: 'content_author', label: 'Автор контента' },
  { key: 'verska_author', label: 'Автор вёрстки' },
  { key: 'check_date', label: 'Дата проверки' },
  { key: 'submitted_at', label: 'Дата отправки' },
];

// Exports the currently-filtered submission list (not just the visible
// page) to Excel — loops through every page via the existing paginated
// endpoint rather than needing a separate server export route.
function ExportModal({ filters, onClose }: { filters: Record<string, string>; onClose: () => void }) {
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

export default function ChecklistsPage({ user, onLogout }: Props) {
  const navigate = useNavigate();
  // "isLead" here really means "can see lead-only reporting" — admin gets
  // everything lead does server-side (requireRole's admin bypass), so it
  // has to be included here too or an admin silently loses the Отчёты tab
  // and the manage-checklists buttons despite the server allowing them.
  const isLead = user.role === 'lead' || user.role === 'admin';
  const [canManageChecklists, setCanManageChecklists] = useState(isLead);
  const [tab, setTab] = useState<Tab>('checklists');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesError, setTemplatesError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [justImportedId, setJustImportedId] = useState<number | null>(null);

  const [authors, setAuthors] = useState<{ contentAuthors: string[]; verskaAuthors: string[] }>({
    contentAuthors: [],
    verskaAuthors: [],
  });
  const [taskTypes, setTaskTypes] = useState<string[]>([]);

  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsTab, setStatsTab] = useState<StatsTab>('fails');

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsLoadingMore, setSubsLoadingMore] = useState(false);
  const [subsHasMore, setSubsHasMore] = useState(false);
  const [detailSub, setDetailSub] = useState<SubmissionDetail | null>(null);

  // History filters
  const [filterTpl, setFilterTpl] = useState('');
  const [filterTester, setFilterTester] = useState('');
  const [filterContent, setFilterContent] = useState('');
  const [filterVerska, setFilterVerska] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [sort, setSort] = useState('date_desc');

  // Stats (Отчёты) tab filters — separate from history's, since a lead
  // scoping a report ("prelending checklists this week") is a different
  // use case from a lead/tester browsing raw submission history.
  const [statsFilterTpl, setStatsFilterTpl] = useState('');
  const [statsFilterType, setStatsFilterType] = useState('');
  const [statsFilterFrom, setStatsFilterFrom] = useState('');
  const [statsFilterTo, setStatsFilterTo] = useState('');

  useEffect(() => {
    loadTemplates();
    loadAuthors();
    checklistApi.getTaskTypes().then(r => setTaskTypes(r.data)).catch(() => {});
    if (!isLead) {
      knowledgeApi.getMyPermissions().then(r => setCanManageChecklists(r.data.includes('manage_checklists'))).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (tab === 'history') loadSubmissions();
    if (tab === 'stats' && isLead && !stats) loadStats();
  }, [tab]);

  const statsFilters = () => ({
    template_id: statsFilterTpl || undefined,
    task_type: statsFilterType || undefined,
    date_from: statsFilterFrom ? localDayStartUTC(statsFilterFrom) : undefined,
    date_to: statsFilterTo ? localDayEndUTC(statsFilterTo) : undefined,
  });

  const loadTemplates = async () => {
    setLoading(true);
    setTemplatesError('');
    try {
      const res = await checklistApi.getTemplates();
      setTemplates(res.data);
    } catch (err: any) {
      // Used to leave `templates` at its empty default on failure — looked
      // exactly like "no checklists exist yet".
      setTemplatesError(err.response?.data?.error || 'Не удалось загрузить чеклисты');
    }
    finally { setLoading(false); }
  };

  const loadAuthors = async () => {
    try {
      const res = await checklistApi.getAuthors();
      setAuthors(res.data);
    } catch (err: any) {
      // Non-fatal: both author dropdowns already have a "ввести вручную"
      // free-text fallback, so this degrades gracefully — but still worth
      // a heads-up rather than pretending nothing happened.
      showApiError(err, 'Не удалось загрузить список авторов');
    }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const res = await checklistApi.getStats(statsFilters());
      setStats(res.data);
    } catch (err: any) {
      showApiError(err, 'Не удалось загрузить отчёт');
    }
    finally { setStatsLoading(false); }
  };

  // Guards "Применить" against being clicked again (or Enter re-fired)
  // before the previous request lands — without this, a slower earlier
  // response can arrive after a faster later one and silently overwrite
  // the list with results for the filters you've since changed away from.
  const subsRequestRef = useRef(0);

  const loadSubmissions = async () => {
    const requestId = ++subsRequestRef.current;
    setSubsLoading(true);
    try {
      const res = await checklistApi.getSubmissions({
        template_id: filterTpl,
        tester: filterTester,
        content_author: filterContent,
        verska_author: filterVerska,
        task_type: filterType,
        date_from: filterFrom ? localDayStartUTC(filterFrom) : undefined,
        date_to: filterTo ? localDayEndUTC(filterTo) : undefined,
        sort,
      });
      if (requestId !== subsRequestRef.current) return;
      setSubmissions(res.data.rows);
      setSubsHasMore(res.data.hasMore);
    } catch (err: any) {
      if (requestId === subsRequestRef.current) showApiError(err, 'Не удалось загрузить историю');
    }
    finally { if (requestId === subsRequestRef.current) setSubsLoading(false); }
  };

  const loadMoreSubmissions = async () => {
    setSubsLoadingMore(true);
    try {
      const res = await checklistApi.getSubmissions({
        template_id: filterTpl,
        tester: filterTester,
        content_author: filterContent,
        verska_author: filterVerska,
        task_type: filterType,
        date_from: filterFrom ? localDayStartUTC(filterFrom) : undefined,
        date_to: filterTo ? localDayEndUTC(filterTo) : undefined,
        sort,
        offset: submissions.length,
      });
      setSubmissions(prev => [...prev, ...res.data.rows]);
      setSubsHasMore(res.data.hasMore);
    } catch (err: any) {
      showApiError(err, 'Не удалось загрузить ещё');
    }
    finally { setSubsLoadingMore(false); }
  };

  const openDetail = async (id: number) => {
    try {
      const res = await checklistApi.getSubmissionDetail(id);
      setDetailSub(res.data);
    } catch (err: any) {
      showApiError(err, 'Не удалось открыть отправку');
    }
  };

  const getCategories = (tpl: Template) => [...new Set(tpl.items.map(i => i.category))];

  const tabs: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'checklists', label: 'Чеклисты', icon: 'check' },
    { id: 'history', label: 'История', icon: 'clipboard' },
    ...(isLead ? [{ id: 'stats' as Tab, label: 'Отчёты', icon: 'barchart' as IconName }] : []),
  ];

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />

      {detailSub && <SubmissionDetailModal sub={detailSub} onClose={() => setDetailSub(null)} />}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={(id) => {
            setShowImport(false);
            loadTemplates();
            loadAuthors();
            checklistApi.getTaskTypes().then(r => setTaskTypes(r.data)).catch(() => {});
            setJustImportedId(id);
            setTimeout(() => setJustImportedId(null), 5000);
          }}
        />
      )}
      {showCreate && (
        <CreateTemplateModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            loadTemplates();
            setJustImportedId(id);
            setTimeout(() => setJustImportedId(null), 5000);
          }}
        />
      )}
      {showExport && (
        <ExportModal
          filters={{
            template_id: filterTpl,
            tester: filterTester,
            content_author: filterContent,
            verska_author: filterVerska,
            task_type: filterType,
            date_from: filterFrom ? localDayStartUTC(filterFrom) : '',
            date_to: filterTo ? localDayEndUTC(filterTo) : '',
            sort,
          }}
          onClose={() => setShowExport(false)}
        />
      )}
      {justImportedId !== null && (
        <div
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded text-sm font-sans font-semibold"
          style={{ background: '#1D9E75', color: '#0f0f1a', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
        >
          ✓ Шаблон импортирован и уже доступен во вкладке «Чеклисты»
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 pt-16 pb-8 fade-in">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="font-pixel text-primary mb-2 flex items-center gap-2" style={{ fontSize: '0.8rem', lineHeight: 1.8 }}>
              <PixelIcon name="check" size={14} color="#1D9E75" />
              Чеклисты
            </h1>
            <p className="text-pixel/60 text-sm font-sans">Проверяй, отмечай, отправляй</p>
          </div>
          {canManageChecklists && (
            <div className="flex gap-2">
              <button onClick={() => setShowCreate(true)} className="btn-secondary text-xs py-2 px-4">
                + Вручную
              </button>
              <button onClick={() => setShowImport(true)} className="btn-primary text-xs py-2 px-4">
                + Импорт Excel
              </button>
            </div>
          )}
        </div>

        {/* Tab buttons */}
        <div className="flex gap-1 mb-8">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`win98-tab ${tab === t.id ? 'win98-tab-active' : ''}`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <PixelIcon name={t.icon} size={12} color="currentColor" />
                {t.label}
              </span>
            </button>
          ))}
        </div>

        {/* ===== CHECKLISTS TAB ===== */}
        {tab === 'checklists' && (
          <>
            {loading && <SnailLoader />}
            {!loading && templatesError && (
              <div className="p-8 rounded text-center" style={{ background: '#1a1a2e', border: '2px dashed rgba(224,82,82,0.3)' }}>
                <p className="text-sm font-sans mb-3" style={{ color: '#e05252' }}>{templatesError}</p>
                <button onClick={loadTemplates} className="btn-secondary text-xs px-4 py-2">Повторить</button>
              </div>
            )}
            {!loading && !templatesError && templates.length === 0 && (
              <div className="p-8 rounded text-center" style={{ background: '#1a1a2e', border: '2px dashed rgba(232,232,208,0.1)' }}>
                <p className="text-pixel/60 text-sm font-sans mb-2">Чеклистов пока нет</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map(tpl => {
                const cats = getCategories(tpl);
                return (
                  <div
                    key={tpl.id}
                    className="p-5 flex flex-col"
                    style={{
                      background: '#1a1a2e',
                      borderTop:    '2px solid rgba(255,255,255,0.12)',
                      borderLeft:   '2px solid rgba(255,255,255,0.12)',
                      borderBottom: '2px solid rgba(0,0,0,0.5)',
                      borderRight:  '2px solid rgba(0,0,0,0.5)',
                      outline: tpl.id === justImportedId ? `2px solid #1D9E75` : `1px solid ${tpl.color}40`,
                      outlineOffset: '-3px',
                      transition: 'outline-color 0.3s',
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className="font-pixel px-2 py-1 rounded"
                        style={{ background: `${tpl.color}20`, color: tpl.color, fontSize: '0.55rem', lineHeight: 1.8 }}
                      >
                        {tpl.name}
                      </span>
                      {tpl.id === justImportedId && (
                        <span className="text-xs font-sans font-bold px-2 py-0.5 rounded" style={{ background: '#1D9E75', color: '#0f0f1a' }}>NEW</span>
                      )}
                      <span className="text-pixel/55 text-xs font-sans">{tpl.items.length} пунктов</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-4 flex-1">
                      {cats.map(cat => (
                        <span
                          key={cat}
                          className="text-xs font-sans px-2 py-0.5 rounded"
                          style={{ background: `${catColor(cat)}15`, color: catColor(cat), fontSize: '0.6rem' }}
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => navigate(`/checklists/${tpl.id}`)}
                      className="w-full py-2.5 text-xs font-sans font-semibold cursor-pointer mt-auto"
                      style={{
                        background: '#12121f',
                        color: tpl.color,
                        borderTop:    '2px solid rgba(255,255,255,0.12)',
                        borderLeft:   '2px solid rgba(255,255,255,0.12)',
                        borderBottom: '2px solid rgba(0,0,0,0.5)',
                        borderRight:  '2px solid rgba(0,0,0,0.5)',
                        borderRadius: 0,
                      }}
                      onMouseEnter={e => { (e.currentTarget).style.background = '#1e1e35'; }}
                      onMouseLeave={e => { (e.currentTarget).style.background = '#12121f'; }}
                    >
                      Заполнить →
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ===== HISTORY TAB ===== */}
        {tab === 'history' && (
          <div>
            <p className="font-pixel mb-5" style={{ fontSize: '0.55rem', color: 'rgba(232,232,208,0.6)', lineHeight: 1.8 }}>
              История проверок команды
            </p>

            {/* Filters */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <select
                className="pixel-input text-xs"
                value={filterTpl}
                onChange={e => setFilterTpl(e.target.value)}
                aria-label="Фильтр по чеклисту"
              >
                <option value="">Все чеклисты</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>

              <select
                className="pixel-input text-xs"
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                aria-label="Фильтр по типу задачи"
              >
                <option value="">Все типы задач</option>
                {taskTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <input
                className="pixel-input text-xs"
                placeholder="Тестер"
                value={filterTester}
                onChange={e => setFilterTester(e.target.value)}
              />

              <select
                className="pixel-input text-xs"
                value={filterContent}
                onChange={e => setFilterContent(e.target.value)}
              >
                <option value="">Контент (все)</option>
                {authors.contentAuthors.map(a => <option key={a} value={a}>{a}</option>)}
              </select>

              <select
                className="pixel-input text-xs"
                value={filterVerska}
                onChange={e => setFilterVerska(e.target.value)}
              >
                <option value="">Верстка (все)</option>
                {authors.verskaAuthors.map(a => <option key={a} value={a}>{a}</option>)}
              </select>

              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  className="pixel-input text-xs flex-1"
                  value={filterFrom}
                  onChange={e => setFilterFrom(e.target.value)}
                  aria-label="Дата проверки от"
                />
                <span className="text-pixel/40 text-xs">—</span>
                <input
                  type="date"
                  className="pixel-input text-xs flex-1"
                  value={filterTo}
                  onChange={e => setFilterTo(e.target.value)}
                  aria-label="Дата проверки до"
                />
              </div>

              <select
                className="pixel-input text-xs"
                value={sort}
                onChange={e => setSort(e.target.value)}
              >
                <option value="date_desc">Новые</option>
                <option value="date_asc">Старые</option>
                <option value="fails_desc">Больше ошибок</option>
                <option value="fails_asc">Меньше ошибок</option>
              </select>

              <div className="flex gap-2">
                <button
                  onClick={loadSubmissions}
                  disabled={subsLoading}
                  aria-label="Применить фильтры поиска"
                  className="btn-primary px-3 py-1 text-xs font-sans cursor-pointer shrink-0 flex-1 disabled:opacity-50 disabled:cursor-default"
                >
                  Применить
                </button>
                {isLead && (
                  <button
                    onClick={() => setShowExport(true)}
                    className="btn-secondary px-3 py-1 text-xs font-sans cursor-pointer shrink-0"
                  >
                    ⬇ Экспорт
                  </button>
                )}
              </div>
            </div>

            <SubmissionsList submissions={submissions} loading={subsLoading} onOpenDetail={openDetail} />
            {!subsLoading && subsHasMore && (
              <div className="flex justify-center mt-4">
                <button
                  onClick={loadMoreSubmissions}
                  disabled={subsLoadingMore}
                  className="btn-secondary px-4 py-2 text-xs font-sans cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {subsLoadingMore ? 'Загрузка...' : 'Загрузить ещё'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== STATS TAB (lead only) ===== */}
        {tab === 'stats' && isLead && (
          <div>
            {/* Report filters — scope the whole report instead of only ever
                seeing an unfiltered all-time aggregate. */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
              <select
                className="pixel-input text-xs"
                value={statsFilterTpl}
                onChange={e => setStatsFilterTpl(e.target.value)}
                aria-label="Отчёт: фильтр по чеклисту"
              >
                <option value="">Все чеклисты</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>

              <select
                className="pixel-input text-xs"
                value={statsFilterType}
                onChange={e => setStatsFilterType(e.target.value)}
                aria-label="Отчёт: фильтр по типу задачи"
              >
                <option value="">Все типы задач</option>
                {taskTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  className="pixel-input text-xs flex-1"
                  value={statsFilterFrom}
                  onChange={e => setStatsFilterFrom(e.target.value)}
                  aria-label="Отчёт: дата от"
                />
                <span className="text-pixel/40 text-xs">—</span>
                <input
                  type="date"
                  className="pixel-input text-xs flex-1"
                  value={statsFilterTo}
                  onChange={e => setStatsFilterTo(e.target.value)}
                  aria-label="Отчёт: дата до"
                />
              </div>

              <button onClick={loadStats} className="btn-primary px-3 py-1 text-xs font-sans cursor-pointer">
                Применить
              </button>
              {(statsFilterTpl || statsFilterType || statsFilterFrom || statsFilterTo) && (
                <button
                  onClick={async () => {
                    setStatsFilterTpl(''); setStatsFilterType(''); setStatsFilterFrom(''); setStatsFilterTo('');
                    setStatsLoading(true);
                    try {
                      const res = await checklistApi.getStats({});
                      setStats(res.data);
                    } catch (err: any) {
                      showApiError(err, 'Не удалось загрузить отчёт');
                    }
                    finally { setStatsLoading(false); }
                  }}
                  className="btn-secondary px-3 py-1 text-xs font-sans cursor-pointer"
                >
                  Сбросить
                </button>
              )}
            </div>

            {statsLoading && <SnailLoader />}

            {stats && (
              <>
                {/* Summary counts */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {stats.byTemplate.map(tpl => (
                    <div key={tpl.id} className="p-4 rounded text-center" style={{ background: '#1a1a2e', boxShadow: `2px 0 0 0 ${tpl.color}50, -2px 0 0 0 ${tpl.color}50, 0 2px 0 0 ${tpl.color}50, 0 -2px 0 0 ${tpl.color}50` }}>
                      <p className="text-pixel/60 text-xs font-sans mb-1">{tpl.name}</p>
                      <p className="font-pixel text-2xl" style={{ color: tpl.color, lineHeight: 1.6 }}>{tpl.submissions}</p>
                      <p className="text-pixel/55 text-xs font-sans">проверок</p>
                    </div>
                  ))}
                </div>

                {/* Stats sub-tabs */}
                <div className="flex flex-wrap gap-1 mb-6">
                  {([
                    { id: 'fails', label: 'Топ ошибок', icon: 'warning' },
                    { id: 'testers', label: 'По тестерам', icon: 'user' },
                    { id: 'content', label: 'По контентщикам', icon: 'memo' },
                    { id: 'verska', label: 'По верстальщикам', icon: 'gear' },
                  ] as { id: StatsTab; label: string; icon: IconName }[]).map(st => (
                    <button
                      key={st.id}
                      onClick={() => setStatsTab(st.id)}
                      className={`win98-tab ${statsTab === st.id ? 'win98-tab-active' : ''}`}
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        <PixelIcon name={st.icon} size={11} color="currentColor" />
                        {st.label}
                      </span>
                    </button>
                  ))}
                </div>

                {statsTab === 'fails' && (
                  <div className="space-y-2 mb-10">
                    {stats.topFails.length === 0 && <p className="text-pixel/55 text-sm font-sans text-center py-8">Нет данных</p>}
                    {stats.topFails.map((f, i) => (
                      <div key={i} className="p-3 rounded flex items-center gap-4" style={{ background: '#1a1a2e', boxShadow: '2px 0 0 0 rgba(224,82,82,0.2), -2px 0 0 0 rgba(224,82,82,0.2), 0 2px 0 0 rgba(224,82,82,0.2), 0 -2px 0 0 rgba(224,82,82,0.2)' }}>
                        <span className="font-pixel shrink-0" style={{ fontSize: '0.6rem', color: '#e05252', lineHeight: 1.8, width: 24 }}>#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-pixel text-xs font-sans leading-snug">{f.item_text}</p>
                          <div className="flex gap-2 mt-1">
                            <span className="text-xs font-sans px-1.5 py-0.5 rounded" style={{ background: `${f.color}20`, color: f.color, fontSize: '0.6rem' }}>{f.template_name}</span>
                            {f.category && <span className="text-xs font-sans px-1.5 py-0.5 rounded" style={{ background: `${catColor(f.category)}15`, color: catColor(f.category), fontSize: '0.6rem' }}>{f.category}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-pixel" style={{ color: '#e05252', fontSize: '0.65rem', lineHeight: 1.8 }}>{f.fail_count}✗</p>
                          <p className="text-pixel/55 text-xs font-sans">из {f.total_checks}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {statsTab === 'testers' && (
                  <div className="space-y-2 mb-10">
                    {stats.byTester.length === 0 && <p className="text-pixel/55 text-sm font-sans text-center py-8">Нет данных</p>}
                    {stats.byTester.map((t, i) => (
                      <div key={i} className="p-3 rounded flex items-center gap-4" style={{ background: '#1a1a2e', boxShadow: '2px 0 0 0 rgba(29,158,117,0.2), -2px 0 0 0 rgba(29,158,117,0.2), 0 2px 0 0 rgba(29,158,117,0.2), 0 -2px 0 0 rgba(29,158,117,0.2)' }}>
                        <div className="w-8 h-8 rounded flex items-center justify-center font-pixel text-xs shrink-0" style={{ background: '#1D9E75', color: '#0f0f1a' }}>{t.avatar_initials}</div>
                        <div className="flex-1">
                          <p className="text-pixel text-sm font-sans font-semibold">{t.tester_name}</p>
                        </div>
                        <div className="flex gap-6 text-right">
                          <div>
                            <p className="font-pixel" style={{ color: '#1D9E75', fontSize: '0.9rem', lineHeight: 1.6 }}>{t.submissions}</p>
                            <p className="text-pixel/55 text-xs font-sans">проверок</p>
                          </div>
                          <div>
                            <p className="font-pixel" style={{ color: '#e05252', fontSize: '0.9rem', lineHeight: 1.6 }}>{t.bugs_found}</p>
                            <p className="text-pixel/55 text-xs font-sans">ошибок</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(statsTab === 'content' || statsTab === 'verska') && (
                  <div className="space-y-2 mb-10">
                    {(statsTab === 'content' ? stats.byContentAuthor : stats.byVerskaAuthor).length === 0
                      ? <p className="text-pixel/55 text-sm font-sans text-center py-8">Нет данных</p>
                      : (statsTab === 'content' ? stats.byContentAuthor : stats.byVerskaAuthor).map((a, i) => {
                        const name = 'content_author' in a ? (a as any).content_author : (a as any).verska_author;
                        return (
                          <div key={i} className="p-3 rounded flex items-center gap-4" style={{ background: '#1a1a2e', boxShadow: '2px 0 0 0 rgba(127,119,221,0.2), -2px 0 0 0 rgba(127,119,221,0.2), 0 2px 0 0 rgba(127,119,221,0.2), 0 -2px 0 0 rgba(127,119,221,0.2)' }}>
                            <div className="w-8 h-8 rounded flex items-center justify-center font-pixel text-xs shrink-0" style={{ background: '#7F77DD', color: '#fff' }}>{name.slice(0, 2).toUpperCase()}</div>
                            <div className="flex-1">
                              <p className="text-pixel text-sm font-sans font-semibold">{name}</p>
                              <p className="text-pixel/55 text-xs font-sans">{statsTab === 'content' ? 'Контентщик' : 'Верстальщик'}</p>
                            </div>
                            <div className="flex gap-6 text-right">
                              <div>
                                <p className="font-pixel" style={{ color: '#7F77DD', fontSize: '0.9rem', lineHeight: 1.6 }}>{a.submissions}</p>
                                <p className="text-pixel/55 text-xs font-sans">задач</p>
                              </div>
                              <div>
                                <p className="font-pixel" style={{ color: '#e05252', fontSize: '0.9rem', lineHeight: 1.6 }}>{a.bugs_found}</p>
                                <p className="text-pixel/55 text-xs font-sans">ошибок</p>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    }
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
