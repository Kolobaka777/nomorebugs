import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import { checklistApi, knowledgeApi } from '../api';
import Icon, { IconName } from '../components/Icon';
import { localDayStartUTC, localDayEndUTC } from '../utils/date';
import { showApiError } from '../utils/toast';
import SubmissionDetailModal from '../components/checklists/SubmissionDetailModal';
import ImportModal from '../components/checklists/ImportModal';
import CreateTemplateModal from '../components/checklists/CreateTemplateModal';
import SubmissionsList from '../components/checklists/SubmissionsList';
import ExportModal from '../components/checklists/ExportModal';
import { catColor } from '../components/checklists/types';
import type { Template, Stats, Submission, SubmissionDetail, Tab, StatsTab } from '../components/checklists/types';
import {
  PAGE_GRADIENT, PAGE_BG, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, TRACK_WIDE, CARD_SHADOW,
} from '../utils/theme';

interface Props { user: any; onLogout: () => void; }

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
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
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
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm font-geist font-semibold flex items-center gap-2"
          style={{ background: ACCENT, color: PAGE_BG, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
        >
          <Icon name="check" size={16} color="currentColor" />
          Шаблон импортирован и уже доступен во вкладке «Чеклисты»
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 pt-16 pb-8 fade-in">
        <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-montserrat font-bold flex items-center gap-3" style={{ fontSize: 24, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
              <Icon name="check" size={22} color={ACCENT} />
              Чеклисты
            </h1>
            <p className="font-geist text-sm mt-1" style={{ color: TEXT_MUTED }}>Проверяй, отмечай, отправляй</p>
          </div>
          {canManageChecklists && (
            <div className="flex gap-2">
              <button onClick={() => setShowCreate(true)} className="btn-secondary text-xs py-2 px-4 flex items-center gap-1.5">
                <Icon name="sparkle" size={14} color="currentColor" /> Вручную
              </button>
              <button onClick={() => setShowImport(true)} className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5">
                <Icon name="sparkle" size={14} color="currentColor" /> Импорт Excel
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
                <Icon name={t.icon} size={14} color="currentColor" />
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
              <div className="p-8 rounded-lg text-center" style={{ background: CARD_BG, border: '2px dashed rgba(224,82,82,0.3)' }}>
                <p className="font-geist text-sm mb-3" style={{ color: '#e05252' }}>{templatesError}</p>
                <button onClick={loadTemplates} className="btn-secondary text-xs px-4 py-2">Повторить</button>
              </div>
            )}
            {!loading && !templatesError && templates.length === 0 && (
              <div className="p-8 rounded-lg text-center" style={{ background: CARD_BG, border: '2px dashed rgba(197, 198, 199,0.1)' }}>
                <p className="font-geist text-sm mb-2" style={{ color: TEXT_MUTED }}>Чеклистов пока нет</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map(tpl => {
                const cats = getCategories(tpl);
                return (
                  <div
                    key={tpl.id}
                    className="rounded-lg flex flex-col overflow-hidden transition-all"
                    style={{
                      background: CARD_BG,
                      border: tpl.id === justImportedId ? `1px solid ${ACCENT}` : `1px solid ${tpl.color}40`,
                      boxShadow: CARD_SHADOW,
                    }}
                  >
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        <span
                          className="font-geist font-semibold rounded px-2 py-0.5 break-words min-w-0"
                          style={{ background: `${tpl.color}20`, color: tpl.color, fontSize: 12 }}
                        >
                          {tpl.name}
                        </span>
                        {tpl.id === justImportedId && (
                          <span className="font-geist text-xs font-bold px-2 py-0.5 rounded" style={{ background: ACCENT, color: PAGE_BG }}>NEW</span>
                        )}
                        <span className="font-geist text-xs" style={{ color: TEXT_MUTED }}>{tpl.items.length} пунктов</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-4 flex-1">
                        {cats.map(cat => (
                          <span
                            key={cat}
                            className="font-geist text-xs px-2 py-0.5 rounded break-words min-w-0"
                            style={{ background: `${catColor(cat)}15`, color: catColor(cat), fontSize: 11 }}
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => navigate(`/checklists/${tpl.id}`)}
                        className="w-full py-2.5 rounded-lg font-geist text-xs font-semibold cursor-pointer mt-auto flex items-center justify-center gap-1.5 transition-transform hover:-translate-y-0.5"
                        style={{ background: `${tpl.color}18`, color: tpl.color }}
                      >
                        Заполнить <Icon name="chevronRight" size={16} color="currentColor" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ===== HISTORY TAB ===== */}
        {tab === 'history' && (
          <div>
            <p className="font-montserrat font-semibold mb-4" style={{ fontSize: 14, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>
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
                <span className="text-xs" style={{ color: TEXT_MUTED }}>—</span>
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
                  className="btn-primary px-3 py-1 text-xs font-geist cursor-pointer shrink-0 flex-1 disabled:opacity-50 disabled:cursor-default"
                >
                  Применить
                </button>
                {isLead && (
                  <button
                    onClick={() => setShowExport(true)}
                    className="btn-secondary px-3 py-1 text-xs font-geist cursor-pointer shrink-0 flex items-center gap-1.5"
                  >
                    <Icon name="floppy" size={14} color="currentColor" /> Экспорт
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
                  className="btn-secondary px-4 py-2 text-xs font-geist cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                <span className="text-xs" style={{ color: TEXT_MUTED }}>—</span>
                <input
                  type="date"
                  className="pixel-input text-xs flex-1"
                  value={statsFilterTo}
                  onChange={e => setStatsFilterTo(e.target.value)}
                  aria-label="Отчёт: дата до"
                />
              </div>

              <button onClick={loadStats} className="btn-primary px-3 py-1 text-xs font-geist cursor-pointer">
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
                  className="btn-secondary px-3 py-1 text-xs font-geist cursor-pointer"
                >
                  Сбросить
                </button>
              )}
            </div>

            {statsLoading && <SnailLoader />}

            {stats && (
              <>
                {/* Summary counts */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                  {stats.byTemplate.map(tpl => (
                    <div key={tpl.id} className="p-4 rounded-lg text-center" style={{ background: CARD_BG, border: `1px solid ${tpl.color}50`, boxShadow: CARD_SHADOW }}>
                      <p className="font-geist text-xs mb-1 break-words" style={{ color: TEXT_MUTED }}>{tpl.name}</p>
                      <p className="font-montserrat font-bold" style={{ color: tpl.color, fontSize: 28, letterSpacing: TRACK_WIDE }}>{tpl.submissions}</p>
                      <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>проверок</p>
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
                        <Icon name={st.icon} size={14} color="currentColor" />
                        {st.label}
                      </span>
                    </button>
                  ))}
                </div>

                {statsTab === 'fails' && (
                  <div className="space-y-2 mb-10">
                    {stats.topFails.length === 0 && <p className="font-geist text-sm text-center py-8" style={{ color: TEXT_MUTED }}>Нет данных</p>}
                    {stats.topFails.map((f, i) => (
                      <div key={i} className="p-3 rounded-lg flex items-center gap-4" style={{ background: CARD_BG, border: '1px solid rgba(224,82,82,0.2)', boxShadow: CARD_SHADOW }}>
                        <span className="font-montserrat font-bold shrink-0 text-center" style={{ fontSize: 13, color: '#e05252', width: 24 }}>#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-geist text-xs leading-snug break-words" style={{ color: TEXT_PRIMARY }}>{f.item_text}</p>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            <span className="font-geist text-xs px-1.5 py-0.5 rounded break-words min-w-0" style={{ background: `${f.color}20`, color: f.color, fontSize: 11 }}>{f.template_name}</span>
                            {f.category && <span className="font-geist text-xs px-1.5 py-0.5 rounded break-words min-w-0" style={{ background: `${catColor(f.category)}15`, color: catColor(f.category), fontSize: 11 }}>{f.category}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-montserrat font-bold" style={{ color: '#e05252', fontSize: 15 }}>{f.fail_count}✗</p>
                          <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>из {f.total_checks}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {statsTab === 'testers' && (
                  <div className="space-y-2 mb-10">
                    {stats.byTester.length === 0 && <p className="font-geist text-sm text-center py-8" style={{ color: TEXT_MUTED }}>Нет данных</p>}
                    {stats.byTester.map((t, i) => (
                      <div key={i} className="p-3 rounded-lg flex items-center gap-4" style={{ background: CARD_BG, border: '1px solid rgba(102, 252, 241,0.2)', boxShadow: CARD_SHADOW }}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-geist font-semibold text-xs shrink-0" style={{ background: ACCENT, color: PAGE_BG }}>{t.avatar_initials}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-geist text-sm font-semibold break-words" style={{ color: TEXT_PRIMARY }}>{t.tester_name}</p>
                        </div>
                        <div className="flex gap-6 text-right">
                          <div>
                            <p className="font-montserrat font-bold" style={{ color: ACCENT, fontSize: 15 }}>{t.submissions}</p>
                            <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>проверок</p>
                          </div>
                          <div>
                            <p className="font-montserrat font-bold" style={{ color: '#e05252', fontSize: 15 }}>{t.bugs_found}</p>
                            <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>ошибок</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(statsTab === 'content' || statsTab === 'verska') && (
                  <div className="space-y-2 mb-10">
                    {(statsTab === 'content' ? stats.byContentAuthor : stats.byVerskaAuthor).length === 0
                      ? <p className="font-geist text-sm text-center py-8" style={{ color: TEXT_MUTED }}>Нет данных</p>
                      : (statsTab === 'content' ? stats.byContentAuthor : stats.byVerskaAuthor).map((a, i) => {
                        const name = 'content_author' in a ? (a as any).content_author : (a as any).verska_author;
                        return (
                          <div key={i} className="p-3 rounded-lg flex items-center gap-4" style={{ background: CARD_BG, border: '1px solid rgba(127,119,221,0.2)', boxShadow: CARD_SHADOW }}>
                            <div className="w-8 h-8 rounded-full flex items-center justify-center font-geist font-semibold text-xs shrink-0" style={{ background: '#7F77DD', color: '#fff' }}>{name.slice(0, 2).toUpperCase()}</div>
                            <div className="flex-1 min-w-0">
                              <p className="font-geist text-sm font-semibold break-words" style={{ color: TEXT_PRIMARY }}>{name}</p>
                              <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>{statsTab === 'content' ? 'Контентщик' : 'Верстальщик'}</p>
                            </div>
                            <div className="flex gap-6 text-right">
                              <div>
                                <p className="font-montserrat font-bold" style={{ color: '#7F77DD', fontSize: 15 }}>{a.submissions}</p>
                                <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>задач</p>
                              </div>
                              <div>
                                <p className="font-montserrat font-bold" style={{ color: '#e05252', fontSize: 15 }}>{a.bugs_found}</p>
                                <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>ошибок</p>
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
