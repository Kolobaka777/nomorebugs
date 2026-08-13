// Single source of truth for picking gendered Russian phrasing. Used to be
// scattered per-file as a "(а)" suffix hack (readable but grammatically
// wrong for irregular verbs — "прошёл(-а)" isn't a word) or, in
// utils/activity.ts, a "Masc/Fem" slash fallback when gender is unknown —
// neither reads as a sentence a person would actually write. Every call
// site now supplies a real neutral phrasing for the unknown case (usually
// a passive/impersonal rewrite, e.g. "Пароль изменён" instead of picking a
// gender at random), same idea as this app's existing convention of using
// a role noun ("Тестировщик") as a gender-neutral default elsewhere.
import { Gender } from '../types';

export function pickByGender(gender: Gender | undefined, masculine: string, feminine: string, neutral: string): string {
  if (gender === 'male') return masculine;
  if (gender === 'female') return feminine;
  return neutral;
}
