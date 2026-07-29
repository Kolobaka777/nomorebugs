import { useState } from 'react';
import Navigation from '../components/Navigation';
import PixelIcon, { IconName } from '../components/PixelIcon';

interface BagodelnyaPageProps {
  user: any;
  onLogout: () => void;
}

type Tab = 'examples' | 'glossary';

const GLOSSARY = [
  { term: 'DevTools', def: 'Инструменты разработчика в браузере для отладки' },
  { term: 'Bug', def: 'Дефект в программном обеспечении — отклонение от ожидаемого поведения' },
  { term: 'Viewport', def: 'Видимая область экрана — размер окна браузера' },
  { term: 'DOM', def: 'Document Object Model — структура HTML-документа в виде дерева' },
  { term: 'Console', def: 'Консоль браузера — показывает ошибки JS и логи' },
];

interface BugPair {
  tag: string;
  tagColor: string;
  problem: string;
  bad: {
    title: string;
    desc: string;
  };
  good: {
    title: string;
    body: { label: string; value: string }[];
  };
}

const BUG_PAIRS: BugPair[] = [
  {
    tag: 'Визуал',
    tagColor: '#7F77DD',
    problem: 'Неверный отступ в секции',
    bad: {
      title: '"Отступ слишком большой"',
      desc: 'Нет конкретики: какой элемент, в какой секции, на каком устройстве, насколько большой. Разработчик не знает что исправлять.',
    },
    good: {
      title: 'padding-top секции .features на 20px больше макета — десктоп 1920px',
      body: [
        { label: 'Где', value: 'Секция .features, десктоп (1920×1080, Chrome 124, Windows)' },
        { label: 'Воспроизведение', value: 'Открыть страницу → DevTools → Elements → найти .features → проверить padding-top' },
        { label: 'Что', value: 'padding-top: 80px, по макету Figma должно быть 60px — лишние 20px сверху' },
        { label: 'Ожидалось', value: '.features { padding-top: 60px } согласно Figma-макету' },
        { label: 'Пункт', value: 'Визуал → Отступы соответствуют макету' },
      ],
    },
  },
];

export default function BagodelnyaPage({ user, onLogout }: BagodelnyaPageProps) {
  const [tab, setTab] = useState<Tab>('examples');

  const TABS: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'examples', label: 'Примеры багов', icon: 'bug' },
    { id: 'glossary', label: 'Словарь', icon: 'books' },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />

      <div className="max-w-6xl mx-auto px-6 pt-16 pb-8 fade-in">
        <div className="mb-8">
          <h1 className="font-pixel text-primary mb-2 flex items-center gap-2" style={{ fontSize: '0.8rem', lineHeight: 1.8 }}>
            <PixelIcon name="books" size={14} color="#1D9E75" />
            Багодельня
          </h1>
          <p className="text-pixel/60 text-sm font-sans">База знаний тестировщика</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`win98-tab flex-1 py-3 ${tab === t.id ? 'win98-tab-active' : ''}`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <PixelIcon name={t.icon} size={12} color="currentColor" />
                {t.label}
              </span>
            </button>
          ))}
        </div>

        {/* ===== TAB: BUG EXAMPLES ===== */}
        {tab === 'examples' && (
          <div>
            {/* Column headers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 px-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: '#e05252' }} />
                <span className="font-pixel" style={{ color: '#e05252', fontSize: '0.6rem', lineHeight: 1.8 }}>✗ Как писать НЕ надо</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: '#1D9E75' }} />
                <span className="font-pixel" style={{ color: '#1D9E75', fontSize: '0.6rem', lineHeight: 1.8 }}>✓ Как писать правильно</span>
              </div>
            </div>

            {/* Pairs */}
            <div className="space-y-5">
              {BUG_PAIRS.map((pair, i) => (
                <div key={i}>
                  {/* Problem label */}
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span
                      className="text-xs font-sans px-2 py-0.5 rounded font-semibold"
                      style={{ background: `${pair.tagColor}18`, color: pair.tagColor, fontSize: '0.65rem' }}
                    >
                      {pair.tag}
                    </span>
                    <span className="text-pixel/60 text-xs font-sans">{pair.problem}</span>
                  </div>

                  {/* Side-by-side cards */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {/* BAD */}
                    <div className="p-4 win98-panel-red flex flex-col gap-2">
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-pixel shrink-0 mt-0.5" style={{ color: '#e05252', fontSize: '0.5rem', lineHeight: 1.8 }}>✗ ПЛОХО</span>
                      </div>
                      <p className="text-pixel/75 text-xs font-sans font-semibold">{pair.bad.title}</p>
                      <p className="text-pixel/60 text-xs font-sans leading-relaxed">{pair.bad.desc}</p>
                    </div>

                    {/* GOOD */}
                    <div className="p-4 win98-panel-green flex flex-col gap-2">
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-pixel shrink-0 mt-0.5" style={{ color: '#1D9E75', fontSize: '0.5rem', lineHeight: 1.8 }}>✓ ПРАВИЛЬНО</span>
                      </div>
                      <p className="text-pixel/80 text-xs font-sans font-semibold">{pair.good.title}</p>
                      <div className="space-y-1 mt-1">
                        {pair.good.body.map((row, j) => (
                          <div key={j} className="flex gap-2 text-xs font-sans">
                            <span className="shrink-0 font-semibold" style={{ color: '#1D9E75', minWidth: 68 }}>{row.label}:</span>
                            <span style={{ color: 'rgba(232,232,208,0.6)' }}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tips block */}
            <div className="mt-10 p-5 win98-panel-amber">
              <p className="font-pixel mb-3 flex items-center gap-2" style={{ fontSize: '0.55rem', color: '#EF9F27', lineHeight: 1.8 }}>
                <PixelIcon name="lightbulb" size={12} color="#EF9F27" />
                Правила хорошего баг-отчёта
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  ['Конкретность', 'Укажи точное место: блок, элемент, порядковый номер пункта чеклиста'],
                  ['Воспроизводимость', 'Опиши шаги так, чтобы любой мог повторить и увидеть тот же баг'],
                  ['Ссылка на стандарт', 'Всегда указывай пункт чеклиста — это доказывает что это действительно ошибка'],
                  ['Факт, не мнение', '"Цвет #000 вместо #FF0000" — факт. "Выглядит некрасиво" — мнение'],
                  ['Один баг — один отчёт', 'Не смешивай несколько проблем в одном сообщении'],
                  ['Скриншот', 'Если возможно — прикрепи скриншот с выделенной областью ошибки'],
                ].map(([title, desc]) => (
                  <div key={title}>
                    <p className="text-pixel/70 text-xs font-sans font-semibold mb-1">{title}</p>
                    <p className="text-pixel/60 text-xs font-sans">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB: GLOSSARY ===== */}
        {tab === 'glossary' && (
          <div>
            <h2 className="font-pixel text-pixel/60 mb-6 flex items-center gap-2" style={{ fontSize: '0.6rem', lineHeight: 1.8 }}>
              <PixelIcon name="books" size={12} color="currentColor" />
              Словарь тестировщика
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {GLOSSARY.map(item => (
                <div
                  key={item.term}
                  className="p-4 win98-panel flex gap-4"
                  style={{ outline: '1px solid rgba(29,158,117,0.28)', outlineOffset: '-3px' }}
                >
                  <div
                    className="shrink-0 px-2 py-1 rounded text-xs font-pixel"
                    style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75', fontSize: '0.5rem', lineHeight: 1.8, alignSelf: 'flex-start', whiteSpace: 'nowrap' }}
                  >
                    {item.term}
                  </div>
                  <p className="text-pixel/60 text-xs font-sans leading-relaxed">{item.def}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
