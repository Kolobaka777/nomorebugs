// Who is allowed to wear what.
//
// The shop deducts coins (POST /api/tester/shop/buy) and badges are earned,
// but neither of those was ever consulted when a profile was saved: PUT
// /api/tester/profile wrote whatever avatar_frame/profile_bg/avatar_id it
// was handed. A tester with nothing purchased and zero coins could equip the
// 350-coin frame and the 250-coin background with one ordinary profile save,
// which made every priced item in the shop free to anyone calling the API
// directly — and made the whole bug-coin economy decorative, since the shop
// is the only thing coins are for.
//
// This module is the one place that decides ownership. The client used to
// work it out for itself in MoyaNora.tsx to grey out locked tiles; it now
// reads GET /api/tester/entitlements instead, so the rule that draws a lock
// and the rule that enforces it are the same rule and cannot drift apart.
import { db } from '../db/schema.js';

// Always available to everyone. Backgrounds are the plain/gradient set added
// so a new tester has something to choose from before earning anything.
export const FREE_BG_IDS = ['default', 'forest', 'console', 'ink', 'deep', 'moss', 'dusk', 'ember', 'slate', 'grid'];
export const FREE_FRAME_IDS = ['default', 'code'];

// Eight of the nine frogs are free. frog1 is the shop's single priced avatar
// tile (SHOP_CATALOG in routes/tester.js) and frog9 unlocks with a badge,
// matching the reference design's mixed free/priced/earned grid.
export const FREE_AVATAR_IDS = ['frog2', 'frog3', 'frog4', 'frog5', 'frog6', 'frog7', 'frog8'];

// The default has to be one of the free ones. It used to be 'frog1' — the
// priced tile — so every new profile was already wearing an avatar the
// shop offered them for 120 coins, and the profile page drew it as equipped
// and locked-for-sale at the same time.
export const DEFAULT_AVATAR_ID = 'frog2';

// Procedural bug sprites from before the frog reskin. Not selectable any
// more, but an account that still has one stored keeps rendering it, so they
// stay valid values (see LEGACY_BUG_AVATARS in PixelAvatar.tsx).
const LEGACY_AVATAR_IDS = ['bug1', 'bug2', 'bug3', 'bug4', 'bug5', 'bug6', 'bug7', 'bug8'];

// The five craftable skill badges. Achievements live in the same
// user_badges table with an 'achievement_' prefix and deliberately do NOT
// count here: "скрафти все значки" is what the crown and the amber
// background promise on screen, and counting every row of that table let
// five achievements — none of them a crafted badge — unlock both.
export const SKILL_BADGES = ['HTML structure', 'CSS reading', 'DevTools', 'Console errors', 'Bug report quality'];

export function entitlements(userId) {
  const badges = db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ?').all(userId)
    .map(r => r.badge_id)
    .filter(id => SKILL_BADGES.includes(id));
  const row = db.prepare('SELECT purchased_items, avatar_id, avatar_frame, profile_bg FROM user_profiles WHERE user_id = ?').get(userId);
  let purchased = [];
  try {
    const parsed = JSON.parse(row?.purchased_items || '[]');
    if (Array.isArray(parsed)) purchased = parsed;
  } catch {
    // A corrupt purchased_items column means "owns nothing extra" rather
    // than a 500 on every profile read.
  }

  const anyBadge = badges.length > 0;
  const allBadges = badges.length >= SKILL_BADGES.length;
  const has = item => purchased.includes(item);

  // Whatever the account is already wearing is always on its own list. Two
  // things follow from that and both are wanted: a save that merely repeats
  // the current appearance is never refused, and the profile page can never
  // draw the avatar someone is looking at as locked with a price on it — the
  // state a new account was actually in, because the column default handed
  // out the shop's one priced frog. Same rule as cosmeticAllowed's, in the
  // one place both the picker and the check read from.
  const worn = (list, current) => (current && !list.includes(current) ? [...list, current] : list);

  return {
    frames: worn([
      ...FREE_FRAME_IDS,
      ...(anyBadge || has('frame_gold') ? ['gold'] : []),
      ...(badges.includes('CSS reading') || has('frame_rainbow') ? ['rainbow'] : []),
      ...(badges.includes('DevTools') || has('frame_glitch') ? ['glitch'] : []),
      ...(badges.includes('Bug report quality') ? ['crimescene'] : []),
      ...(allBadges ? ['crown'] : []),
    ], row?.avatar_frame),
    bgs: worn([
      ...FREE_BG_IDS,
      ...(anyBadge || has('bg_hive') ? ['hive'] : []),
      ...(allBadges || has('bg_amber') ? ['amber'] : []),
    ], row?.profile_bg),
    avatars: worn([
      ...FREE_AVATAR_IDS,
      ...(has('avatar_frog1') ? ['frog1'] : []),
      ...(anyBadge ? ['frog9'] : []),
    ], row?.avatar_id),
  };
}

// Validates one cosmetic slot on a profile save.
//
// `current` is what the account already has stored. Something already worn
// always stays wearable: entitlement rules change over time (frog1 was the
// default for every account before it became the shop's priced tile), and
// re-deciding old accounts' appearance on every save would strip people of
// what they are wearing rather than stop anyone taking something new.
export function cosmeticAllowed(owned, value, current, extraValid = []) {
  if (value === undefined || value === null || value === '') return true;
  if (value === current) return true;
  return owned.includes(value) || extraValid.includes(value);
}

export const LEGACY_AVATARS = LEGACY_AVATAR_IDS;
