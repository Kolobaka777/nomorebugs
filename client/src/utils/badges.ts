// Crafted-badge display metadata (name/icon/color per skill_area) — shared
// between MoyaNora's own "Коллекция" tab and PublicProfilePage's read-only
// view of a teammate's badges, so the two never drift out of sync.
import { IconName } from '../components/Icon';
import { ACCENT } from './theme';

export const BADGE_META: Record<string, { name: string; icon: IconName; color: string }> = {
  'HTML structure':     { name: 'HTML-лягушка',       icon: 'globe',     color: ACCENT },
  'CSS reading':        { name: 'CSS-лягушка',        icon: 'palette',   color: '#7F77DD' },
  'DevTools':           { name: 'DevTools-лягушка',   icon: 'search',    color: '#EF9F27' },
  'Console errors':     { name: 'Консольная лягушка', icon: 'lightning', color: '#e05252' },
  'Bug report quality': { name: 'Лягушка-репортёр',   icon: 'frog',      color: '#EF9F27' },

  // Achievements — auto-awarded milestone badges, distinct from the 5
  // craftable skill badges above (see routeHelpers.js's ACHIEVEMENT_IDS for
  // the exact trigger each one checks server-side). Same user_badges table,
  // same rendering path (Коллекция tab, PublicProfilePage) — just a
  // different kind of badge_id. Note: the `achievement_polunochny_zhuk` key
  // itself is a stored badge_id (server-side ACHIEVEMENT_IDS, DB rows) —
  // left unchanged to avoid a data migration; only its display name/icon
  // are reskinned here.
  achievement_otlichnik:      { name: 'Отличник',         icon: 'trophy',     color: '#FFD700' },
  achievement_avtor:          { name: 'Автор',            icon: 'pencil',     color: '#4ADE80' },
  achievement_bibliotekar:    { name: 'Библиотекарь',     icon: 'books',      color: '#4fc3f7' },
  achievement_nastavnik:      { name: 'Наставник',        icon: 'graduation', color: '#a78bfa' },
  achievement_golos_komandy:  { name: 'Голос команды',    icon: 'sparkle',    color: '#f472b6' },
  achievement_polunochny_zhuk:{ name: 'Полуночная лягушка', icon: 'frog',     color: '#4B4E9E' },
  achievement_kollektsioner:  { name: 'Коллекционер',     icon: 'card',       color: '#d946ef' },
};

// The 7 real, auto-awarded achievement ids in display order, with a
// user-facing description of what earns each one — mirrors
// routeHelpers.js's ACHIEVEMENT_IDS comments (the actual server-side
// trigger for each). Used to render the full achievements list/showcase
// picker (MoyaNora's achievements panel, ProfileEditModal's "Внешний вид"
// tab) — BADGE_META alone only has name/icon/color, not a description.
export const ACHIEVEMENTS_CATALOG: { id: string; description: string }[] = [
  { id: 'achievement_otlichnik',       description: 'Последние 5 пройденных тестов — все на 90% и выше' },
  { id: 'achievement_avtor',           description: 'Первое одобренное предложение — курс, гайд, баг-пример или термин' },
  { id: 'achievement_bibliotekar',     description: '5 одобренных терминов в глоссарии' },
  { id: 'achievement_nastavnik',       description: '3 одобренных гайда' },
  { id: 'achievement_golos_komandy',   description: '10+ лайков на досках предложений или 5 отвеченных вопросов' },
  { id: 'achievement_polunochny_zhuk', description: 'Заходил на сайт после полуночи 5 раз' },
  { id: 'achievement_kollektsioner',   description: 'Скрафчены все 5 значков умений' },
];
