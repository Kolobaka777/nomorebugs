import { useState } from 'react';
import Navigation from '../components/Navigation';

interface BagodelnyaPageProps {
  user: any;
  onLogout: () => void;
}

type Tab = 'template' | 'glossary' | 'checklists';

const GLOSSARY = [
  { term: 'Bug', def: 'Дефект в программном обеспечении — отклонение от ожидаемого поведения' },
  { term: 'Severity', def: 'Серьёзность бага: критическая, высокая, средняя, низкая' },
  { term: 'Priority', def: 'Приоритет исправления: как срочно нужно починить' },
  { term: 'Regression', def: 'Новый баг, появившийся после изменений в коде' },
  { term: 'Smoke test', def: 'Быстрая проверка основных функций перед полным тестированием' },
  { term: 'Edge case', def: 'Граничный случай — экстремальные значения входных данных' },
  { term: 'Reproducible', def: 'Воспроизводимый — баг, который можно повторить' },
  { term: 'DOM', def: 'Document Object Model — структура HTML-документа в виде дерева' },
  { term: 'DevTools', def: 'Инструменты разработчика в браузере для отладки' },
  { term: 'Console', def: 'Консоль браузера — показывает ошибки JS и логи' },
  { term: 'Network tab', def: 'Вкладка сети в DevTools — показывает HTTP-запросы' },
  { term: 'Selector', def: 'CSS-селектор — правило выбора HTML-элементов для стилизации' },
  { term: 'Viewport', def: 'Видимая область экрана — размер окна браузера' },
  { term: 'Breakpoint', def: 'Точка останова — в CSS это медиа-запрос, в JS — точка отладки' },
  { term: 'HTTP status', def: '200 OK / 404 Not Found / 500 Server Error — коды ответа сервера' },
];

const CHECKLIST_ADAPTIVE = [
  'Проверь на мобильном (320px, 375px, 414px)',
  'Проверь на планшете (768px, 1024px)',
  'Проверь на десктопе (1280px, 1440px)',
  'Все элементы видимы и не обрезаны',
  'Текст не переполняет контейнеры',
  'Кнопки кликабельны на мобильном',
  'Нет горизонтального скролла',
  'Изображения масштабируются корректно',
  'Шрифты читаемы на всех размерах',
  'Навигация работает на мобильном',
];

const CHECKLIST_IMAGES = [
  'Изображения загружаются (нет broken img)',
  'Alt-текст присутствует у всех img',
  'Правильный формат: фото → JPEG/WebP, иконки → SVG/PNG',
  'Размер файла не превышает 500KB',
  'Retina: есть @2x версии для HiDPI',
  'Нет искажения пропорций (aspect-ratio сохранён)',
  'Lazy loading для изображений вне экрана',
];

const CHECKLIST_CONSOLE = [
  'Нет красных ошибок в консоли (JavaScript errors)',
  'Нет 404 ошибок для ресурсов (картинки, скрипты, стили)',
  'Нет CORS ошибок',
  'Нет failed fetch / network errors',
  'Нет Uncaught TypeError / ReferenceError',
  'Warnings проверены и не критичны',
  'Нет утечек памяти (Memory tab)',
];

export default function BagodelnyaPage({ user, onLogout }: BagodelnyaPageProps) {
  const [tab, setTab] = useState<Tab>('template');
  const [bugForm, setBugForm] = useState({
    title: '',
    steps: '',
    expected: '',
    actual: '',
    severity: 'medium',
    browser: '',
    url: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'template', label: '🐛 Шаблон баг-репорта' },
    { id: 'glossary', label: '📖 Словарь' },
    { id: 'checklists', label: '✅ Чеклисты' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  const SEVERITY_COLORS: Record<string, string> = {
    critical: '#e05252',
    high: '#EF9F27',
    medium: '#7F77DD',
    low: '#1D9E75',
  };

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />

      <div className="max-w-6xl mx-auto px-6 py-8 fade-in">
        {/* Header */}
        <div className="mb-8">
          <h1
            className="font-pixel text-primary mb-2"
            style={{ fontSize: '0.8rem', lineHeight: 1.8 }}
          >
            📖 Багодельня
          </h1>
          <p className="text-pixel/50 text-sm font-sans">База знаний тестировщика</p>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-0 mb-6 rounded overflow-hidden"
          style={{ border: '2px solid rgba(29,158,117,0.2)' }}
        >
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 py-3 text-xs font-sans font-medium transition-all cursor-pointer"
              style={{
                background: tab === t.id ? '#1D9E75' : 'transparent',
                color: tab === t.id ? '#0f0f1a' : 'rgba(232,232,208,0.5)',
                borderRight: '1px solid rgba(29,158,117,0.2)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ===== TAB: BUG REPORT TEMPLATE ===== */}
        {tab === 'template' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Form */}
            <div>
              <h2
                className="font-pixel text-pixel/60 mb-4"
                style={{ fontSize: '0.6rem', lineHeight: 1.8 }}
              >
                📝 Заполнить баг-репорт
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-pixel/60 text-xs font-sans mb-2">
                    Заголовок *
                  </label>
                  <input
                    className="pixel-input"
                    placeholder="[Компонент] Краткое описание бага"
                    value={bugForm.title}
                    onChange={e => setBugForm(p => ({ ...p, title: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="block text-pixel/60 text-xs font-sans mb-2">
                    Шаги для воспроизведения *
                  </label>
                  <textarea
                    className="pixel-input"
                    rows={4}
                    placeholder="1. Открыть страницу /example&#10;2. Нажать кнопку 'Submit'&#10;3. ..."
                    value={bugForm.steps}
                    onChange={e => setBugForm(p => ({ ...p, steps: e.target.value }))}
                    required
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-pixel/60 text-xs font-sans mb-2">
                      Ожидаемый результат
                    </label>
                    <textarea
                      className="pixel-input"
                      rows={3}
                      placeholder="Что должно произойти?"
                      value={bugForm.expected}
                      onChange={e => setBugForm(p => ({ ...p, expected: e.target.value }))}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                  <div>
                    <label className="block text-pixel/60 text-xs font-sans mb-2">
                      Фактический результат
                    </label>
                    <textarea
                      className="pixel-input"
                      rows={3}
                      placeholder="Что произошло на самом деле?"
                      value={bugForm.actual}
                      onChange={e => setBugForm(p => ({ ...p, actual: e.target.value }))}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-pixel/60 text-xs font-sans mb-2">Серьёзность</label>
                    <select
                      className="pixel-input"
                      value={bugForm.severity}
                      onChange={e => setBugForm(p => ({ ...p, severity: e.target.value }))}
                    >
                      <option value="critical">🔴 Critical</option>
                      <option value="high">🟠 High</option>
                      <option value="medium">🟣 Medium</option>
                      <option value="low">🟢 Low</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-pixel/60 text-xs font-sans mb-2">Браузер</label>
                    <input
                      className="pixel-input"
                      placeholder="Chrome 120, Firefox 121..."
                      value={bugForm.browser}
                      onChange={e => setBugForm(p => ({ ...p, browser: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-pixel/60 text-xs font-sans mb-2">URL страницы</label>
                  <input
                    className="pixel-input"
                    placeholder="https://..."
                    value={bugForm.url}
                    onChange={e => setBugForm(p => ({ ...p, url: e.target.value }))}
                  />
                </div>

                <button type="submit" className="btn-primary w-full" disabled={submitted}>
                  {submitted ? '✓ Отправлено!' : 'Отправить репорт'}
                </button>
              </form>
            </div>

            {/* Example good/bad side by side */}
            <div>
              <h2
                className="font-pixel text-pixel/60 mb-4"
                style={{ fontSize: '0.6rem', lineHeight: 1.8 }}
              >
                До / После — как писать репорты
              </h2>

              {/* BAD example */}
              <div
                className="p-4 rounded mb-4"
                style={{
                  background: '#1a1a2e',
                  boxShadow: '2px 0 0 0 #e05252, -2px 0 0 0 #e05252, 0 2px 0 0 #e05252, 0 -2px 0 0 #e05252',
                }}
              >
                <p
                  className="font-pixel mb-3"
                  style={{ color: '#e05252', fontSize: '0.55rem', lineHeight: 1.8 }}
                >
                  ✗ ПЛОХО
                </p>
                <p className="text-pixel/60 text-xs font-sans font-semibold mb-1">
                  "Кнопка не работает"
                </p>
                <p className="text-pixel/40 text-xs font-sans">
                  Нажал кнопку — ничего не происходит. Баг!
                </p>
              </div>

              {/* GOOD example */}
              <div
                className="p-4 rounded"
                style={{
                  background: '#1a1a2e',
                  boxShadow: '2px 0 0 0 #1D9E75, -2px 0 0 0 #1D9E75, 0 2px 0 0 #1D9E75, 0 -2px 0 0 #1D9E75',
                }}
              >
                <p
                  className="font-pixel mb-3"
                  style={{ color: '#1D9E75', fontSize: '0.55rem', lineHeight: 1.8 }}
                >
                  ✓ ХОРОШО
                </p>
                <p className="text-pixel/80 text-xs font-sans font-semibold mb-2">
                  [Корзина] Кнопка "Оформить заказ" не реагирует при пустой корзине
                </p>
                <div className="text-pixel/50 text-xs font-sans space-y-1">
                  <p><strong>Шаги:</strong></p>
                  <p>1. Открыть /cart с пустой корзиной</p>
                  <p>2. Нажать "Оформить заказ"</p>
                  <p><strong>Ожидалось:</strong> Показать сообщение "Корзина пуста"</p>
                  <p><strong>Фактически:</strong> Ничего не происходит, нет реакции UI</p>
                  <p><strong>Severity:</strong> Medium · Chrome 120 · /cart</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB: GLOSSARY ===== */}
        {tab === 'glossary' && (
          <div>
            <h2
              className="font-pixel text-pixel/60 mb-6"
              style={{ fontSize: '0.6rem', lineHeight: 1.8 }}
            >
              📖 Словарь тестировщика
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {GLOSSARY.map(item => (
                <div
                  key={item.term}
                  className="p-4 rounded flex gap-4"
                  style={{
                    background: '#1a1a2e',
                    boxShadow: '2px 0 0 0 rgba(29,158,117,0.3), -2px 0 0 0 rgba(29,158,117,0.3), 0 2px 0 0 rgba(29,158,117,0.3), 0 -2px 0 0 rgba(29,158,117,0.3)',
                  }}
                >
                  <div
                    className="shrink-0 px-2 py-1 rounded text-xs font-pixel"
                    style={{
                      background: 'rgba(29,158,117,0.15)',
                      color: '#1D9E75',
                      fontSize: '0.5rem',
                      lineHeight: 1.8,
                      alignSelf: 'flex-start',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.term}
                  </div>
                  <p className="text-pixel/60 text-xs font-sans leading-relaxed">{item.def}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== TAB: CHECKLISTS ===== */}
        {tab === 'checklists' && (
          <div className="space-y-8">
            {[
              { title: '📱 Адаптивная вёрстка', items: CHECKLIST_ADAPTIVE, color: '#1D9E75' },
              { title: '🖼️ Изображения', items: CHECKLIST_IMAGES, color: '#7F77DD' },
              { title: '⚠️ Консольные ошибки', items: CHECKLIST_CONSOLE, color: '#EF9F27' },
            ].map(section => (
              <div key={section.title}>
                <h2
                  className="font-pixel mb-4"
                  style={{ color: section.color, fontSize: '0.6rem', lineHeight: 1.8 }}
                >
                  {section.title}
                </h2>
                <div
                  className="p-5 rounded space-y-3"
                  style={{
                    background: '#1a1a2e',
                    boxShadow: `2px 0 0 0 ${section.color}40, -2px 0 0 0 ${section.color}40, 0 2px 0 0 ${section.color}40, 0 -2px 0 0 ${section.color}40`,
                  }}
                >
                  {section.items.map((item, idx) => (
                    <ChecklistItem key={idx} text={item} color={section.color} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChecklistItem({ text, color }: { text: string; color: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <button
      onClick={() => setChecked(p => !p)}
      className="w-full flex items-start gap-3 text-left cursor-pointer group"
    >
      <div
        className="shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5 transition-all"
        style={{
          background: checked ? color : 'transparent',
          boxShadow: `1px 0 0 0 ${color}60, -1px 0 0 0 ${color}60, 0 1px 0 0 ${color}60, 0 -1px 0 0 ${color}60`,
        }}
      >
        {checked && <span className="text-game text-xs font-bold">✓</span>}
      </div>
      <span
        className="text-sm font-sans transition-all"
        style={{
          color: checked ? 'rgba(232,232,208,0.3)' : 'rgba(232,232,208,0.7)',
          textDecoration: checked ? 'line-through' : 'none',
        }}
      >
        {text}
      </span>
    </button>
  );
}
