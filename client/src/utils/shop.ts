// Client-side mirror of the server's SHOP_CATALOG (server/src/routes/
// tester.js) — kept in sync by hand since there's no shared-types boundary
// between client/server in this repo. Single source of truth for "what can
// be bought, for how much, and what does it unlock", used by both the
// profile editor's frame/background picker and the cabinet's Магазин tab
// so that mapping only needs updating in one client-side place.
export interface ShopItem {
  id: string;
  cost: number;
  label: string;
  kind: 'frame' | 'bg' | 'avatar';
  refId: string; // FrameId / BgId / AvatarId this item unlocks, see PixelAvatar.tsx
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'frame_gold',    cost: 200, label: 'Золотая рамка', kind: 'frame',  refId: 'gold' },
  { id: 'frame_rainbow', cost: 350, label: 'Рамка-радуга',  kind: 'frame',  refId: 'rainbow' },
  { id: 'frame_glitch',  cost: 300, label: 'Глитч-рамка',   kind: 'frame',  refId: 'glitch' },
  { id: 'bg_hive',       cost: 150, label: 'Фон «Улей»',    kind: 'bg',     refId: 'hive' },
  { id: 'bg_amber',      cost: 250, label: 'Фон «Янтарь»',  kind: 'bg',     refId: 'amber' },
  { id: 'avatar_frog1',  cost: 120, label: 'Лягуха Кваки',  kind: 'avatar', refId: 'frog1' },
];

// Backgrounds that cost nothing and are available from day one. Named here
// rather than read out of BG_LIST's `unlock` label, which is display copy —
// deciding access by string-matching it would turn a wording change into an
// access change. Both profile pages read this, so the lead's editor and the
// tester's cabinet can't drift apart on what is free.
// What everybody has without buying or earning anything.
//
// These are only the fallback the profile page shows while GET
// /api/tester/entitlements is still in flight — the server decides what may
// actually be worn (server/src/entitlements.js) and refuses a save that
// claims otherwise. Falling back to the free set means a slow request
// under-offers rather than offering a tile the save would bounce.
export const FREE_BG_IDS = ['default', 'forest', 'console', 'ink', 'deep', 'moss', 'dusk', 'ember', 'slate', 'grid'];
export const FREE_FRAME_IDS = ['default', 'code'];
export const FREE_AVATAR_IDS = ['frog2', 'frog3', 'frog4', 'frog5', 'frog6', 'frog7', 'frog8'];

export function shopItemFor(kind: 'frame' | 'bg' | 'avatar', refId: string): ShopItem | undefined {
  return SHOP_ITEMS.find(i => i.kind === kind && i.refId === refId);
}

// Profile accent-color palette — a personal preference, not a shop/unlock
// gate, so this is just a curated set of swatches to pick from rather than
// anything server-derived.
export const ACCENT_PALETTE = [
  '#4A90D9', '#66FCF1', '#45A29E', '#4ADE80', '#86efac',
  '#f5e060', '#EF9F27', '#e05252', '#C5C6C7',
];