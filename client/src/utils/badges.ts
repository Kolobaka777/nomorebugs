// Crafted-badge display metadata (name/icon/color per skill_area) — shared
// between MoyaNora's own "Коллекция" tab and PublicProfilePage's read-only
// view of a teammate's badges, so the two never drift out of sync.
import { IconName } from '../components/Icon';
import { ACCENT } from './theme';

export const BADGE_META: Record<string, { name: string; icon: IconName; color: string }> = {
  'HTML structure':     { name: 'HTML-жук',        icon: 'globe',     color: ACCENT },
  'CSS reading':        { name: 'CSS-жук',         icon: 'palette',   color: '#7F77DD' },
  'DevTools':           { name: 'DevTools-жук',    icon: 'search',    color: '#EF9F27' },
  'Console errors':     { name: 'Консольный жук',  icon: 'lightning', color: '#e05252' },
  'Bug report quality': { name: 'Жук-репортёр',    icon: 'bug',       color: '#EF9F27' },

  // Achievements — auto-awarded milestone badges, distinct from the 5
  // craftable skill badges above (see routeHelpers.js's ACHIEVEMENT_IDS for
  // the exact trigger each one checks server-side). Same user_badges table,
  // same rendering path (Коллекция tab, PublicProfilePage) — just a
  // different kind of badge_id.
  achievement_otlichnik:      { name: 'Отличник',         icon: 'trophy',     color: '#FFD700' },
  achievement_avtor:          { name: 'Автор',            icon: 'pencil',     color: '#4ADE80' },
  achievement_bibliotekar:    { name: 'Библиотекарь',     icon: 'books',      color: '#4fc3f7' },
  achievement_nastavnik:      { name: 'Наставник',        icon: 'graduation', color: '#a78bfa' },
  achievement_golos_komandy:  { name: 'Голос команды',    icon: 'sparkle',    color: '#f472b6' },
  achievement_polunochny_zhuk:{ name: 'Полуночный жук',   icon: 'bug',        color: '#4B4E9E' },
  achievement_kollektsioner:  { name: 'Коллекционер',     icon: 'card',       color: '#d946ef' },
};
