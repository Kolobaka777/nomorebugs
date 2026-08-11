import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { checklistApi } from '../api';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import Icon from '../components/Icon';
import { todayLocal } from '../utils/date';
import { showApiError } from '../utils/toast';
import { DateInput, AuthorSelect, TaskTypeSelect } from '../components/checklistForm/FormInputs';
import { exportToExcel } from '../components/checklistForm/exportToExcel';
import { catColor } from '../components/checklistForm/types';
import type { ChecklistItem, Template, Status, CheckMode } from '../components/checklistForm/types';
import { STATUS_COLORS } from '../components/checklistForm/types';
import {
  PAGE_GRADIENT, PAGE_BG, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, TRACK_WIDE, CARD_SHADOW,
} from '../utils/theme';

interface Props { user: any; onLogout: () => void; }

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
      const res = await checklistApi.updateMvtItems(template.id, updates, template.mvt_updated_at ?? null);
      setTemplate(prev => prev ? {
        ...prev,
        mvt_updated_at: res.data.mvt_updated_at,
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
      if (err?.response?.status === 409) {
        // Someone else saved MVT changes to this checklist first — pulling
        // our stale copy would silently overwrite theirs, so reload from
        // the server instead of retrying blind.
        try {
          const fresh = await checklistApi.getTemplates();
          const tpl = fresh.data.find((t: Template) => t.id === template.id);
          if (tpl) setTemplate(tpl);
        } catch { /* fall through to showing the conflict error below */ }
        setEditingMvt(false);
        setPendingMvt({});
      }
      showApiError(err, 'Не удалось сохранить МВТ');
    } finally {
      setSavingMvt(false);
    }
  };

  if (!template && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: PAGE_GRADIENT }}>
        <div className="text-center">
          <p className="font-geist text-sm mb-4" style={{ color: TEXT_MUTED }}>Чеклист не найден</p>
          <button onClick={() => navigate('/checklists')} className="btn-primary flex items-center gap-1.5 mx-auto">
            <Icon name="chevronLeft" size={16} color="currentColor" /> Назад
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
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
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: PAGE_GRADIENT }}>
        <div className="text-center max-w-sm">
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>✅</div>
          <p className="font-montserrat font-bold mb-2" style={{ fontSize: 22, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>Чеклист отправлен!</p>
          <div className="flex gap-4 justify-center text-sm font-geist mb-6">
            <span style={{ color: ACCENT }}>✓ {okCount} Ок</span>
            <span style={{ color: '#e05252' }}>✗ {failCount} Ошибок</span>
            <span style={{ color: TEXT_MUTED }}>— {naCount} н/п</span>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => exportToExcel(tpl, { taskName, contentAuthor, verskaAuthor, taskType, checkDate }, results, user.name).catch(err => showApiError(err, 'Не удалось сформировать Excel'))}
              className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
            >
              <Icon name="floppy" size={14} color="currentColor" /> Скачать Excel
            </button>
            <button
              onClick={() => navigate('/checklists')}
              className="btn-secondary text-xs px-4 py-2 flex items-center gap-1.5"
            >
              <Icon name="chevronLeft" size={14} color="currentColor" /> К чеклистам
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      {/* Sticky header */}
      <div
        className="sticky top-0 z-20 px-6 py-3 flex items-center justify-between gap-4"
        style={{ background: CARD_BG, borderBottom: `3px solid ${tpl.color}` }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => navigate('/checklists')}
            className="font-geist text-xs cursor-pointer transition-colors flex items-center gap-1"
            style={{ color: TEXT_MUTED }}
            onMouseEnter={e => (e.currentTarget.style.color = TEXT_PRIMARY)}
            onMouseLeave={e => (e.currentTarget.style.color = TEXT_MUTED)}
          >
            <Icon name="chevronLeft" size={16} color="currentColor" /> Назад
          </button>
          <span
            className="font-geist font-semibold px-2 py-0.5 rounded break-words min-w-0"
            style={{ background: `${tpl.color}20`, color: tpl.color, fontSize: 12 }}
          >{tpl.name}</span>

          {/* MVT edit button (lead only) */}
          {isLead && !editingMvt && (
            <button
              onClick={enterMvtEdit}
              className="px-2.5 py-1 text-xs font-geist cursor-pointer rounded-lg transition-all flex items-center gap-1.5"
              style={{ background: 'rgba(239,159,39,0.08)', color: '#EF9F27', border: '1px solid rgba(239,159,39,0.25)' }}
              title="Настроить, какие пункты входят в МВТ"
            >
              <Icon name="gear" size={14} color="currentColor" /> МВТ
            </button>
          )}
          {editingMvt && (
            <div className="flex gap-2 items-center">
              <span className="text-xs font-geist font-semibold" style={{ color: '#EF9F27' }}>Режим настройки МВТ</span>
              <button
                onClick={saveMvtEdit}
                disabled={savingMvt}
                className="px-2.5 py-1 text-xs font-geist cursor-pointer rounded-lg"
                style={{ background: ACCENT, color: PAGE_BG, opacity: savingMvt ? 0.6 : 1 }}
              ><span className="flex items-center gap-1"><Icon name="floppy" size={14} color="currentColor" />Сохранить</span></button>
              <button
                onClick={cancelMvtEdit}
                className="px-2.5 py-1 text-xs font-geist cursor-pointer rounded-lg flex items-center gap-1"
                style={{ background: 'rgba(224,82,82,0.1)', color: '#e05252' }}
              ><Icon name="close" size={14} color="currentColor" /> Отмена</button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs font-geist shrink-0">
          <span className="flex items-center gap-1" style={{ color: TEXT_MUTED, fontSize: 12 }}><Icon name="user" size={14} color="currentColor" /><span className="break-words min-w-0">{user.name}</span></span>
          {!editingMvt && (
            <>
              <span style={{ color: ACCENT }}>✓ {okCount}</span>
              <span style={{ color: '#e05252' }}>✗ {failCount}</span>
              <span style={{ color: TEXT_MUTED }}>— {naCount}</span>
              <span style={{ color: TEXT_MUTED }}>{filledCount}/{totalItems}</span>
            </>
          )}
          {editingMvt && (
            <span style={{ color: '#EF9F27', fontSize: 12 }}>
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
          <div className="mb-6 p-4 rounded-lg" style={{ background: 'rgba(239,159,39,0.06)', border: '1px solid rgba(239,159,39,0.2)' }}>
            <p className="text-xs font-geist" style={{ color: '#EF9F27' }}>
              <span className="font-semibold">Настройка МВТ:</span> отметьте пункты, которые входят в сокращённую МВТ-проверку.
              Неотмеченные пункты будут только в «Полной» проверке.
            </p>
            <p className="text-xs font-geist mt-1" style={{ color: 'rgba(239,159,39,0.5)' }}>
              <span className="font-semibold" style={{ color: ACCENT }}>М</span> = в МВТ &nbsp;·&nbsp;
              <span className="font-semibold" style={{ color: TEXT_MUTED }}>—</span> = только в Полной
            </p>
          </div>
        )}

        {/* MVT / Full toggle (not shown in edit mode) */}
        {!editingMvt && (
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <div
              className="flex gap-0 rounded-lg overflow-hidden"
              style={{ border: '1px solid rgba(197, 198, 199,0.15)', width: 'fit-content' }}
            >
              <button
                onClick={() => setCheckMode('mvt')}
                className="px-5 py-1.5 text-xs font-geist font-medium cursor-pointer transition-all"
                style={{
                  background: checkMode === 'mvt' ? tpl.color : 'transparent',
                  color: checkMode === 'mvt' ? PAGE_BG : TEXT_MUTED,
                  borderRight: '1px solid rgba(197, 198, 199,0.15)',
                }}
              >МВТ</button>
              <button
                onClick={() => setCheckMode('full')}
                className="px-5 py-1.5 text-xs font-geist font-medium cursor-pointer transition-all"
                style={{
                  background: checkMode === 'full' ? tpl.color : 'transparent',
                  color: checkMode === 'full' ? PAGE_BG : TEXT_MUTED,
                }}
              >Полная</button>
            </div>
            <span className="text-xs font-geist" style={{ color: TEXT_MUTED }}>
              {checkMode === 'mvt'
                ? `${mvtCount} пунктов`
                : `${tpl.items.length} пунктов`}
            </span>
          </div>
        )}

        {/* Header fields (hidden in MVT edit mode) */}
        {!editingMvt && (
          <div
            className="p-5 rounded-lg mb-8"
            style={{ background: CARD_BG, border: `1px solid ${tpl.color}30`, boxShadow: CARD_SHADOW }}
          >
            <p className="font-montserrat font-semibold mb-4" style={{ fontSize: 14, color: tpl.color, letterSpacing: TRACK_WIDE }}>Данные проверки</p>

            <div className="mb-4 flex items-center gap-2">
              <span className="font-geist text-xs" style={{ color: TEXT_MUTED }}>Тестер:</span>
              <span className="px-2 py-0.5 rounded text-xs font-geist font-semibold break-words min-w-0" style={{ background: `${tpl.color}18`, color: tpl.color }}>
                {user.name}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-geist text-xs mb-1.5" style={{ color: TEXT_MUTED }}>AIO ID *</label>
                <input
                  className="pixel-input"
                  placeholder="Введите ID задачи"
                  value={taskName}
                  onChange={e => setTaskName(e.target.value)}
                />
              </div>
              <div>
                <label className="block font-geist text-xs mb-1.5" style={{ color: TEXT_MUTED }}>Дата проверки</label>
                <DateInput value={checkDate} onChange={setCheckDate} />
              </div>
              <div>
                <label className="block font-geist text-xs mb-1.5" style={{ color: TEXT_MUTED }}>Контент (автор)</label>
                <AuthorSelect value={contentAuthor} onChange={setContentAuthor} options={authors.contentAuthors} />
              </div>
              <div>
                <label className="block font-geist text-xs mb-1.5" style={{ color: TEXT_MUTED }}>Верстка (автор)</label>
                <AuthorSelect value={verskaAuthor} onChange={setVerskaAuthor} options={authors.verskaAuthors} />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-geist text-xs mb-1.5" style={{ color: TEXT_MUTED }}>Тип задачи</label>
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
                  className="flex items-center justify-between px-4 py-2.5 rounded-t-lg flex-wrap gap-1"
                  style={{ background: `${cc}18`, borderLeft: `4px solid ${cc}` }}
                >
                  <span className="font-geist font-semibold break-words min-w-0" style={{ color: cc, fontSize: 13, letterSpacing: TRACK_WIDE }}>{cat}</span>
                  <div className="flex items-center gap-3 text-xs font-geist">
                    {!editingMvt && catFails > 0 && <span style={{ color: '#e05252' }}>{catFails} ✗</span>}
                    {!editingMvt && <span style={{ color: TEXT_MUTED }}>{catFilled}/{items.length}</span>}
                    {editingMvt && (
                      <span style={{ color: TEXT_MUTED }}>
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
                        className={isLast ? 'rounded-b-lg' : undefined}
                        style={{
                          background: editingMvt
                            ? (inMvt ? 'rgba(102, 252, 241,0.03)' : 'rgba(0,0,0,0.15)')
                            : status === 'fail'
                            ? 'rgba(224,82,82,0.06)'
                            : status === 'ok'
                            ? 'rgba(102, 252, 241,0.04)'
                            : CARD_BG,
                          borderLeft: `4px solid ${cc}30`,
                          borderBottom: isLast ? `2px solid ${cc}20` : '1px solid rgba(197, 198, 199,0.04)',
                        }}
                      >
                        <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
                          <span className="text-xs font-geist shrink-0" style={{ color: TEXT_MUTED, width: 22, textAlign: 'right' }}>
                            {item.order_num}.
                          </span>
                          <p
                            className="flex-1 text-sm font-geist leading-snug min-w-[140px] break-words"
                            style={{ color: editingMvt
                              ? (inMvt ? 'rgba(197, 198, 199,0.75)' : 'rgba(197, 198, 199,0.3)')
                              : status ? 'rgba(197, 198, 199,0.45)' : 'rgba(197, 198, 199,0.82)'
                            }}
                          >
                            {item.text}
                          </p>

                          {/* MVT edit toggle */}
                          {editingMvt && (
                            <button
                              onClick={() => setPendingMvt(p => ({ ...p, [item.id]: !p[item.id] }))}
                              className="w-8 h-8 rounded-lg text-xs font-bold cursor-pointer transition-all shrink-0"
                              style={{
                                background: inMvt ? 'rgba(102, 252, 241,0.15)' : 'rgba(197, 198, 199,0.04)',
                                color: inMvt ? ACCENT : 'rgba(197, 198, 199,0.2)',
                                border: `1.5px solid ${inMvt ? ACCENT : 'rgba(197, 198, 199,0.1)'}`,
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
                                  className="h-8 rounded-lg text-xs font-semibold cursor-pointer transition-all font-geist"
                                  style={{
                                    minWidth: s === 'na' ? 28 : 44,
                                    background: status === s ? STATUS_COLORS[s] : `${STATUS_COLORS[s]}12`,
                                    // STATUS_COLORS.na is itself a semi-transparent rgba() (needed so the
                                    // background/border hex-suffix trick above still reads as a subtle
                                    // overlay) — too faint on its own to use directly as text color, so
                                    // bump it here specifically rather than changing the shared constant.
                                    color: status === s ? (s === 'ok' ? PAGE_BG : '#fff') : (s === 'na' ? 'rgba(197, 198, 199,0.6)' : STATUS_COLORS[s]),
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
                              className="pixel-input w-full text-xs font-geist resize-y"
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
            {error && <p className="text-xs font-geist mb-3" style={{ color: '#e05252' }}>{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-3 text-sm font-geist font-semibold cursor-pointer transition-all rounded-lg"
                style={{
                  background: allFilled && taskName.trim() ? tpl.color : 'rgba(197, 198, 199,0.06)',
                  color: allFilled && taskName.trim() ? PAGE_BG : 'rgba(197, 198, 199,0.3)',
                  cursor: allFilled && taskName.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                {submitting ? 'Отправляю...' : `Отправить чеклист (${filledCount}/${totalItems})`}
              </button>
              {filledCount > 0 && (
                <button
                  onClick={() => exportToExcel(tpl, { taskName, contentAuthor, verskaAuthor, taskType, checkDate }, results, user.name).catch(err => showApiError(err, 'Не удалось сформировать Excel'))}
                  className="px-4 py-3 text-xs font-geist font-semibold rounded-lg cursor-pointer transition-all flex items-center gap-1.5"
                  style={{ background: 'rgba(102, 252, 241,0.12)', color: ACCENT, border: '1px solid rgba(102, 252, 241,0.3)' }}
                  title="Скачать как Excel (черновик)"
                >
                  <Icon name="floppy" size={14} color="currentColor" /> Excel
                </button>
              )}
            </div>
            <p className="font-geist text-xs mt-2 text-center" style={{ color: TEXT_MUTED }}>
              {!allFilled && `Осталось заполнить: ${totalItems - filledCount} пунктов`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
