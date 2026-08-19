import { ACCENT, TEXT_PRIMARY } from './theme';

// Lecture skill_area strings are free-text ("HTML structure", "CSS reading",
// "Bug report quality", ...) rather than the canonical topic-tag keys used
// for badge coloring (TOPIC_TAGS in types.ts) — this maps one to the other
// via substring match. Shared here (rather than duplicated per page) so
// every skill_area-driven badge resolves to the same tag/color everywhere.
export function getTopicTag(area: string): string {
  if (area.includes('HTML')) return 'HTML';
  if (area.includes('CSS')) return 'CSS';
  if (area.includes('DevTools')) return 'DevTools';
  if (area.includes('Console')) return 'Console';
  if (area.includes('Bug')) return 'Bug Reports';
  if (area.includes('JavaScript')) return 'JS';
  if (area.includes('Network')) return 'Network';
  return 'AIO';
}

// Courses-catalog tag palette — its own map, deliberately separate from
// TOPIC_TAGS above (used for skill_area badges on HomePage's test history).
// Same tag *labels* carry different colors in each context per the source
// mockups; shared here so the catalog grid, course detail, and the quiz
// page header all agree on one color per tag instead of drifting.
const COURSE_TAG_COLORS: Record<string, string> = {
  HTML: '#EF9F27',
  CSS: ACCENT,
  DevTools: '#4EA1E8',
  Console: 'rgba(197, 198, 199, 0.55)',
  'Bug Reports': '#e05252',
  JS: '#7F77DD',
  Network: '#4EA1E8',
  AIO: TEXT_PRIMARY,
};
export function getCourseTagColor(tag: string): string {
  return COURSE_TAG_COLORS[tag] || TEXT_PRIMARY;
}
