import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { checklistApi } from '../api';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import PixelIcon from '../components/PixelIcon';
import { todayLocal } from '../utils/date';
import { showApiError } from '../utils/toast';

interface Props { user: any; onLogout: () => void; }

interface ChecklistItem {
  id: number;
  category: string;
  text: string;
  order_num: number;
  in_mvt?: number;
}

interface Template {
  id: number;
  name: string;
  task_type: string;
  color: string;
  items: ChecklistItem[];
}

type Status = 'ok' | 'fail' | 'na';
type CheckMode = 'mvt' | 'full';

const STATUS_LABELS: Record<Status, string> = { ok: 'Ок', fail: 'Ошибка', na: '-' };
const STATUS_COLORS: Record<Status, string> = { ok: '#1D9E75', fail: '#e05252', na: 'rgba(232,232,208,0.35)' };

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
const catColor = (cat: string) => CATEGORY_COLORS[cat] || '#7F77DD';

const TASK_TYPE_OPTIONS = [
  'PN: Teaser',
  'PN: Advertorial',
  'PN: Expert',
  'PN: Long-read',
  'P: Custom',
  'P: Native',
  'P: Long-read',
  'P: Review',
];

async function exportToExcel(
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

// Overlays a transparent native date input over a styled display div
function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const formatted = value
    ? `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`
    : '—';
  return (
    <div className="relative" style={{ cursor: 'pointer' }}>
      <div
        className="pixel-input flex items-center justify-between select-none"
        style={{ pointerEvents: 'none' }}
      >
        <span style={{ color: 'rgba(232,232,208,0.82)' }}>{formatted}</span>
        <PixelIcon name="calendar" size={13} color="rgba(232,232,208,0.35)" />
      </div>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full cursor-pointer"
        style={{ opacity: 0, zIndex: 1 }}
      />
    </div>
  );
}

function AuthorSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [isCustom, setIsCustom] = useState(false);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === '__custom__') {
      setIsCustom(true);
      onChange('');
    } else {
      onChange(e.target.value);
    }
  };

  if (isCustom) {
    return (
      <div className="flex gap-2 items-center">
        <input
          className="pixel-input flex-1"
          maxLength={1}
          placeholder="Буква"
          value={value}
          onChange={e => onChange(e.target.value.toUpperCase().slice(0, 1))}
          autoFocus
        />
        <button
          type="button"
          onClick={() => { setIsCustom(false); onChange(''); }}
          className="text-sm cursor-pointer shrink-0"
          style={{ color: 'rgba(232,232,208,0.6)' }}
          title="Назад к списку"
        >↩</button>
      </div>
    );
  }

  return (
    <select className="pixel-input" value={value} onChange={handleSelectChange}>
      <option value="">— не выбрано —</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
      {options.length > 0 && <option disabled>──────────</option>}
      <option value="__custom__">Ввести вручную...</option>
    </select>
  );
}

function TaskTypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [isCustom, setIsCustom] = useState(false);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === '__custom__') {
      setIsCustom(true);
      onChange('');
    } else {
      onChange(e.target.value);
    }
  };

  if (isCustom) {
    return (
      <div className="flex gap-2 items-center">
        <input
          className="pixel-input flex-1"
          placeholder="Введите тип задачи"
          value={value}
          onChange={e => onChange(e.target.value)}
          autoFocus
        />
        <button
          type="button"
          onClick={() => { setIsCustom(false); onChange(''); }}
          className="text-sm cursor-pointer shrink-0"
          style={{ color: 'rgba(232,232,208,0.6)' }}
          title="Назад к списку"
        >↩</button>
      </div>
    );
  }

  return (
    <select className="pixel-input" value={value} onChange={handleSelectChange}>
      <option value="">— выбрать тип —</option>
      {TASK_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
      <option disabled>──────────</option>
      <option value="__custom__">Другое...</option>
    </select>
  );
}

export default function ChecklistFormPage({ user, onLogout }: Props) {
  const { typeId } = useParams<{ typeId: string }>();
  const navigate = useNavigate();
  const isLead = user.role === 'lead';

  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [authors, setAuthors] = useState<{ contentAuthors: string[]; verskaAuthors: string[] }>({
    contentAuthors: [],
    verskaAuthors: [],
  });

  const [taskName, setTaskName] = useState('');
  const [contentAuthor, setContentAuthor] = useState('');
  const [verskaAuthor, setVerskaAuthor] = useState('');
  const [taskType, setTaskType] = useState('');
  const [checkDate, setCheckDate] = useState(todayLocal());

  const [checkMode, setCheckMode] = useState<CheckMode>('full');
  const [results, setResults] = useState<Record<number, Status>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  // Lead MVT edit mode
  const [editingMvt, setEditingMvt] = useState(false);
  const [pendingMvt, setPendingMvt] = useState<Record<number, boolean>>({});
  const [savingMvt, setSavingMvt] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [tplRes, authRes] = await Promise.all([
          checklistApi.getTemplates(),
          checklistApi.getAuthors().catch(() => ({ data: { contentAuthors: [], verskaAuthors: [] } })),
        ]);
        const tpl = tplRes.data.find((t: Template) => t.id === Number(typeId));
        if (tpl) setTemplate(tpl);
        setAuthors(authRes.data);
      } catch (err: any) {
        showApiError(err, 'Не удалось загрузить чеклист');
      }
      finally { setLoading(false); }
    })();
  }, [typeId]);

  const setStatus = (itemId: number, status: Status) => {
    setResults(p => {
      if (p[itemId] === status) {
        const next = { ...p };
        delete next[itemId];
        return next;
      }
      return { ...p, [itemId]: status };
    });
  };

  const itemInMvt = (item: ChecklistItem) =>
    editingMvt
      ? (pendingMvt[item.id] !== undefined ? pendingMvt[item.id] : (item.in_mvt ?? 1) !== 0)
      : (item.in_mvt ?? 1) !== 0;

  const enterMvtEdit = () => {
    if (!template) return;
    const init: Record<number, boolean> = {};
    for (const item of template.items) init[item.id] = (item.in_mvt ?? 1) !== 0;
    setPendingMvt(init);
    setEditingMvt(true);
  };

  const cancelMvtEdit = () => { setEditingMvt(false); setPendingMvt({}); };

  const saveMvtEdit = async () => {
    if (!template) return;
    setSavingMvt(true);
    try {
      const updates = template.items.map(item => ({
        id: item.id,
        in_mvt: pendingMvt[item.id] !== undefined
          ? (pendingMvt[item.id] ? 1 : 0)
          : (item.in_mvt ?? 1),
      }));
      await checklistApi.updateMvtItems(template.id, updates);
      setTemplate(prev => prev ? {
        ...prev,
        items: prev.items.map(item => ({
          ...item,
          in_mvt: pendingMvt[item.id] !== undefined
            ? (pendingMvt[item.id] ? 1 : 0)
            : (item.in_mvt ?? 1),
        })),
      } : prev);
      setEditingMvt(false);
      setPendingMvt({});
    } catch (err: any) {
      showApiError(err, 'Не удалось сохранить МВТ');
    } finally {
      setSavingMvt(false);
    }
  };

  if (!template && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0f1a' }}>
        <div className="text-center">
          <p className="text-pixel/60 text-sm font-sans mb-4">Чеклист не найден</p>
          <button onClick={() => navigate('/checklists')} className="btn-primary">← Назад</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
      </div>
    );
  }

  const tpl = template!;

  // Active items depend on mode (in MVT edit mode always show all)
  const activeItems = editingMvt
    ? tpl.items
    : checkMode === 'mvt'
      ? tpl.items.filter(i => (i.in_mvt ?? 1) !== 0)
      : tpl.items;

  const mvtCount = tpl.items.filter(i => (i.in_mvt ?? 1) !== 0).length;

  const totalItems = activeItems.length;
  const filledCount = activeItems.filter(i => results[i.id] !== undefined).length;
  const failCount = Object.values(results).filter(s => s === 'fail').length;
  const okCount = Object.values(results).filter(s => s === 'ok').length;
  const naCount = Object.values(results).filter(s => s === 'na').length;
  const allFilled = filledCount === totalItems;

  const byCategory: Record<string, ChecklistItem[]> = {};
  for (const item of activeItems) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }

  const handleSubmit = async () => {
    if (!taskName.trim()) { setError('Укажите AIO ID задачи'); return; }
    if (!allFilled) { setError(`Заполните все пункты (осталось ${totalItems - filledCount})`); return; }
    setError('');
    setSubmitting(true);
    try {
      // Items not shown in MVT mode get 'na' automatically
      const payload = tpl.items.map(item => ({
        item_id: item.id,
        status: results[item.id] || 'na',
        note: results[item.id] === 'fail' ? (notes[item.id] || '').trim() : '',
      }));
      await checklistApi.submitV2({
        template_id: tpl.id,
        task_name: taskName.trim(),
        content_author: contentAuthor.trim(),
        verska_author: verskaAuthor.trim(),
        task_type: taskType.trim(),
        check_date: checkDate,
        results: payload,
      });
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка при отправке. Убедитесь, что сервер запущен.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#0f0f1a' }}>
        <div className="text-center max-w-sm">
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>✅</div>
          <p className="font-pixel text-primary mb-2" style={{ fontSize: '0.7rem', lineHeight: 1.8 }}>Чеклист отправлен!</p>
          <div className="flex gap-4 justify-center text-sm font-sans mb-6">
            <span style={{ color: '#1D9E75' }}>✓ {okCount} Ок</span>
            <span style={{ color: '#e05252' }}>✗ {failCount} Ошибок</span>
            <span style={{ color: 'rgba(232,232,208,0.55)' }}>— {naCount} н/п</span>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => exportToExcel(tpl, { taskName, contentAuthor, verskaAuthor, taskType, checkDate }, results, user.name).catch(err => showApiError(err, 'Не удалось сформировать Excel'))}
              className="px-4 py-2 text-xs font-sans font-semibold rounded cursor-pointer"
              style={{ background: '#1D9E75', color: '#0f0f1a' }}
            >⬇ Скачать Excel</button>
            <button
              onClick={() => navigate('/checklists')}
              className="px-4 py-2 text-xs font-sans cursor-pointer rounded"
              style={{ background: 'rgba(232,232,208,0.08)', color: 'rgba(232,232,208,0.6)' }}
            >← К чеклистам</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      {/* Sticky header */}
      <div
        className="sticky top-0 z-20 px-6 py-3 flex items-center justify-between gap-4"
        style={{ background: '#1a1a2e', borderBottom: `3px solid ${tpl.color}` }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => navigate('/checklists')}
            className="text-xs font-sans cursor-pointer transition-colors"
            style={{ color: 'rgba(232,232,208,0.6)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#e8e8d0')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(232,232,208,0.4)')}
          >← Назад</button>
          <span
            className="font-pixel px-2 py-0.5 rounded"
            style={{ background: `${tpl.color}20`, color: tpl.color, fontSize: '0.55rem', lineHeight: 1.8 }}
          >{tpl.name}</span>

          {/* MVT edit button (lead only) */}
          {isLead && !editingMvt && (
            <button
              onClick={enterMvtEdit}
              className="px-2.5 py-1 text-xs font-sans cursor-pointer rounded transition-all"
              style={{ background: 'rgba(239,159,39,0.08)', color: '#EF9F27', border: '1px solid rgba(239,159,39,0.25)' }}
              title="Настроить, какие пункты входят в МВТ"
            >⚙ МВТ</button>
          )}
          {editingMvt && (
            <div className="flex gap-2 items-center">
              <span className="text-xs font-sans font-semibold" style={{ color: '#EF9F27' }}>Режим настройки МВТ</span>
              <button
                onClick={saveMvtEdit}
                disabled={savingMvt}
                className="px-2.5 py-1 text-xs font-sans cursor-pointer rounded"
                style={{ background: '#1D9E75', color: '#0f0f1a', opacity: savingMvt ? 0.6 : 1 }}
              ><span className="flex items-center gap-1"><PixelIcon name="floppy" size={11} color="currentColor" />Сохранить</span></button>
              <button
                onClick={cancelMvtEdit}
                className="px-2.5 py-1 text-xs font-sans cursor-pointer rounded"
                style={{ background: 'rgba(224,82,82,0.1)', color: '#e05252' }}
              >✕ Отмена</button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs font-sans shrink-0">
          <span className="flex items-center gap-1" style={{ color: 'rgba(232,232,208,0.55)', fontSize: '0.68rem' }}><PixelIcon name="user" size={11} color="currentColor" />{user.name}</span>
          {!editingMvt && (
            <>
              <span style={{ color: '#1D9E75' }}>✓ {okCount}</span>
              <span style={{ color: '#e05252' }}>✗ {failCount}</span>
              <span style={{ color: 'rgba(232,232,208,0.55)' }}>— {naCount}</span>
              <span style={{ color: 'rgba(232,232,208,0.55)' }}>{filledCount}/{totalItems}</span>
            </>
          )}
          {editingMvt && (
            <span style={{ color: '#EF9F27', fontSize: '0.68rem' }}>
              М: {Object.values(pendingMvt).filter(Boolean).length} / {tpl.items.length}
            </span>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 pt-16 pb-6">
        {/* Progress bar */}
        {!editingMvt && (
          <div className="xp-bar-track mb-6" style={{ height: 5 }}>
            <div
              className="xp-bar-fill"
              style={{ width: `${totalItems > 0 ? (filledCount / totalItems) * 100 : 0}%`, height: 5, background: tpl.color, transition: 'width 0.3s' }}
            />
          </div>
        )}

        {/* MVT edit mode hint */}
        {editingMvt && (
          <div className="mb-6 p-4 rounded" style={{ background: 'rgba(239,159,39,0.06)', border: '1px solid rgba(239,159,39,0.2)' }}>
            <p className="text-xs font-sans" style={{ color: '#EF9F27' }}>
              <span className="font-semibold">Настройка МВТ:</span> отметьте пункты, которые входят в сокращённую МВТ-проверку.
              Неотмеченные пункты будут только в «Полной» проверке.
            </p>
            <p className="text-xs font-sans mt-1" style={{ color: 'rgba(239,159,39,0.5)' }}>
              <span className="font-semibold" style={{ color: '#1D9E75' }}>М</span> = в МВТ &nbsp;·&nbsp;
              <span className="font-semibold" style={{ color: 'rgba(232,232,208,0.55)' }}>—</span> = только в Полной
            </p>
          </div>
        )}

        {/* MVT / Full toggle (not shown in edit mode) */}
        {!editingMvt && (
          <div className="flex items-center gap-3 mb-6">
            <div
              className="flex gap-0 rounded overflow-hidden"
              style={{ border: '2px solid rgba(232,232,208,0.12)', width: 'fit-content' }}
            >
              <button
                onClick={() => setCheckMode('mvt')}
                className="px-5 py-1.5 text-xs font-sans font-medium cursor-pointer transition-all"
                style={{
                  background: checkMode === 'mvt' ? tpl.color : 'transparent',
                  color: checkMode === 'mvt' ? '#0f0f1a' : 'rgba(232,232,208,0.45)',
                  borderRight: '1px solid rgba(232,232,208,0.12)',
                }}
              >МВТ</button>
              <button
                onClick={() => setCheckMode('full')}
                className="px-5 py-1.5 text-xs font-sans font-medium cursor-pointer transition-all"
                style={{
                  background: checkMode === 'full' ? tpl.color : 'transparent',
                  color: checkMode === 'full' ? '#0f0f1a' : 'rgba(232,232,208,0.45)',
                }}
              >Полная</button>
            </div>
            <span className="text-xs font-sans" style={{ color: 'rgba(232,232,208,0.55)' }}>
              {checkMode === 'mvt'
                ? `${mvtCount} пунктов`
                : `${tpl.items.length} пунктов`}
            </span>
          </div>
        )}

        {/* Header fields (hidden in MVT edit mode) */}
        {!editingMvt && (
          <div
            className="p-5 rounded mb-8"
            style={{ background: '#1a1a2e', boxShadow: `2px 0 0 0 ${tpl.color}30, -2px 0 0 0 ${tpl.color}30, 0 2px 0 0 ${tpl.color}30, 0 -2px 0 0 ${tpl.color}30` }}
          >
            <p className="font-pixel mb-4" style={{ fontSize: '0.55rem', color: tpl.color, lineHeight: 1.8 }}>Данные проверки</p>

            <div className="mb-4 flex items-center gap-2">
              <span className="text-pixel/60 text-xs font-sans">Тестер:</span>
              <span className="px-2 py-0.5 rounded text-xs font-sans font-semibold" style={{ background: `${tpl.color}18`, color: tpl.color }}>
                {user.name}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-pixel/60 text-xs font-sans mb-1.5">AIO ID *</label>
                <input
                  className="pixel-input"
                  placeholder="Введите ID задачи"
                  value={taskName}
                  onChange={e => setTaskName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-pixel/60 text-xs font-sans mb-1.5">Дата проверки</label>
                <DateInput value={checkDate} onChange={setCheckDate} />
              </div>
              <div>
                <label className="block text-pixel/60 text-xs font-sans mb-1.5">Контент (автор)</label>
                <AuthorSelect value={contentAuthor} onChange={setContentAuthor} options={authors.contentAuthors} />
              </div>
              <div>
                <label className="block text-pixel/60 text-xs font-sans mb-1.5">Верстка (автор)</label>
                <AuthorSelect value={verskaAuthor} onChange={setVerskaAuthor} options={authors.verskaAuthors} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-pixel/60 text-xs font-sans mb-1.5">Тип задачи</label>
                <TaskTypeSelect value={taskType} onChange={setTaskType} />
              </div>
            </div>
          </div>
        )}

        {/* Checklist items by category */}
        <div className="space-y-6 mb-8">
          {Object.entries(byCategory).map(([cat, items]) => {
            const catFails = items.filter(i => results[i.id] === 'fail').length;
            const catFilled = items.filter(i => results[i.id] !== undefined).length;
            const cc = catColor(cat);
            return (
              <div key={cat}>
                <div
                  className="flex items-center justify-between px-4 py-2.5 rounded-t"
                  style={{ background: `${cc}18`, borderLeft: `4px solid ${cc}` }}
                >
                  <span className="font-pixel" style={{ color: cc, fontSize: '0.6rem', lineHeight: 1.8 }}>{cat}</span>
                  <div className="flex items-center gap-3 text-xs font-sans">
                    {!editingMvt && catFails > 0 && <span style={{ color: '#e05252' }}>{catFails} ✗</span>}
                    {!editingMvt && <span style={{ color: 'rgba(232,232,208,0.55)' }}>{catFilled}/{items.length}</span>}
                    {editingMvt && (
                      <span style={{ color: 'rgba(232,232,208,0.55)' }}>
                        М: {items.filter(i => itemInMvt(i)).length}/{items.length}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-0">
                  {items.map((item, idx) => {
                    const status = results[item.id];
                    const isLast = idx === items.length - 1;
                    const inMvt = itemInMvt(item);
                    return (
                      <div
                        key={item.id}
                        style={{
                          background: editingMvt
                            ? (inMvt ? 'rgba(29,158,117,0.03)' : 'rgba(0,0,0,0.15)')
                            : status === 'fail'
                            ? 'rgba(224,82,82,0.06)'
                            : status === 'ok'
                            ? 'rgba(29,158,117,0.04)'
                            : '#1a1a2e',
                          borderLeft: `4px solid ${cc}30`,
                          borderBottom: isLast ? `2px solid ${cc}20` : '1px solid rgba(232,232,208,0.04)',
                        }}
                      >
                        <div className="flex items-center gap-3 px-4 py-3">
                          <span className="text-xs font-sans shrink-0" style={{ color: 'rgba(232,232,208,0.55)', width: 22, textAlign: 'right' }}>
                            {item.order_num}.
                          </span>
                          <p
                            className="flex-1 text-sm font-sans leading-snug"
                            style={{ color: editingMvt
                              ? (inMvt ? 'rgba(232,232,208,0.75)' : 'rgba(232,232,208,0.3)')
                              : status ? 'rgba(232,232,208,0.45)' : 'rgba(232,232,208,0.82)'
                            }}
                          >
                            {item.text}
                          </p>

                          {/* MVT edit toggle */}
                          {editingMvt && (
                            <button
                              onClick={() => setPendingMvt(p => ({ ...p, [item.id]: !p[item.id] }))}
                              className="w-8 h-8 rounded text-xs font-bold cursor-pointer transition-all shrink-0"
                              style={{
                                background: inMvt ? 'rgba(29,158,117,0.15)' : 'rgba(232,232,208,0.04)',
                                color: inMvt ? '#1D9E75' : 'rgba(232,232,208,0.2)',
                                border: `1.5px solid ${inMvt ? '#1D9E75' : 'rgba(232,232,208,0.1)'}`,
                              }}
                              title={inMvt ? 'Убрать из МВТ' : 'Добавить в МВТ'}
                            >М</button>
                          )}

                          {/* Status buttons (not shown in edit mode) */}
                          {!editingMvt && (
                            <div className="flex gap-1.5 shrink-0">
                              {(['ok', 'fail', 'na'] as Status[]).map(s => (
                                <button
                                  key={s}
                                  onClick={() => setStatus(item.id, s)}
                                  className="h-8 rounded text-xs font-semibold cursor-pointer transition-all font-sans"
                                  style={{
                                    minWidth: s === 'na' ? 28 : 44,
                                    background: status === s ? STATUS_COLORS[s] : `${STATUS_COLORS[s]}12`,
                                    // STATUS_COLORS.na is itself a semi-transparent rgba() (needed so the
                                    // background/border hex-suffix trick above still reads as a subtle
                                    // overlay) — too faint on its own to use directly as text color, so
                                    // bump it here specifically rather than changing the shared constant.
                                    color: status === s ? (s === 'ok' ? '#0f0f1a' : '#fff') : (s === 'na' ? 'rgba(232,232,208,0.6)' : STATUS_COLORS[s]),
                                    border: `1.5px solid ${status === s ? STATUS_COLORS[s] : STATUS_COLORS[s] + '40'}`,
                                  }}
                                  title={s === 'na' ? 'Не применимо (н/п) — пункт неактуален для этой задачи' : undefined}
                                  aria-label={s === 'ok' ? 'Отметить как ок' : s === 'fail' ? 'Отметить как ошибку' : 'Не применимо'}
                                  aria-pressed={status === s}
                                >
                                  {s === 'ok' ? '✓' : s === 'fail' ? '✗' : '—'}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Optional description of the failure — feeds the
                            reporting tab's per-item detail instead of just a
                            bare fail count. */}
                        {!editingMvt && status === 'fail' && (
                          <div className="px-4 pb-3" style={{ paddingLeft: 41 }}>
                            <textarea
                              value={notes[item.id] || ''}
                              onChange={e => setNotes(p => ({ ...p, [item.id]: e.target.value }))}
                              placeholder="Опишите ошибку (необязательно)"
                              rows={1}
                              maxLength={1000}
                              className="pixel-input w-full text-xs font-sans resize-y"
                              style={{ minHeight: 32 }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {!editingMvt && (
          <>
            {error && <p className="text-xs font-sans mb-3" style={{ color: '#e05252' }}>{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-3 text-sm font-sans font-semibold cursor-pointer transition-all rounded"
                style={{
                  background: allFilled && taskName.trim() ? tpl.color : 'rgba(232,232,208,0.06)',
                  color: allFilled && taskName.trim() ? '#0f0f1a' : 'rgba(232,232,208,0.3)',
                  cursor: allFilled && taskName.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                {submitting ? 'Отправляю...' : `Отправить чеклист (${filledCount}/${totalItems})`}
              </button>
              {filledCount > 0 && (
                <button
                  onClick={() => exportToExcel(tpl, { taskName, contentAuthor, verskaAuthor, taskType, checkDate }, results, user.name).catch(err => showApiError(err, 'Не удалось сформировать Excel'))}
                  className="px-4 py-3 text-xs font-sans font-semibold rounded cursor-pointer transition-all"
                  style={{ background: 'rgba(29,158,117,0.12)', color: '#1D9E75', border: '2px solid rgba(29,158,117,0.3)' }}
                  title="Скачать как Excel (черновик)"
                >⬇ Excel</button>
              )}
            </div>
            <p className="text-pixel/55 text-xs font-sans mt-2 text-center">
              {!allFilled && `Осталось заполнить: ${totalItems - filledCount} пунктов`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
