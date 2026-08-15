// Tiny decoupled signal from "a route just told us the user earned a new
// achievement" to "the frog mascot should celebrate" — a plain window
// CustomEvent rather than lifting state into App.tsx, since FrogCompanion
// is mounted once at the app root and has no other reason to know about
// individual pages' API responses. Call this wherever a response includes
// a `newAchievements` array (see server/src/routeHelpers.js's
// awardAchievement — it already reports whether a grant was newly made,
// this just needs to reach the one place that shows it).
export const ACHIEVEMENT_EARNED_EVENT = 'frog:achievement-earned';

export function celebrateAchievements(badgeIds?: string[] | null) {
  if (!badgeIds?.length || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ACHIEVEMENT_EARNED_EVENT, { detail: badgeIds }));
}