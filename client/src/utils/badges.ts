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
};
