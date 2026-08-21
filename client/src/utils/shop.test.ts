// The shop's client-side mirror of what can be bought and what is free.
import { describe, it, expect } from 'vitest';
import { SHOP_ITEMS, FREE_BG_IDS, shopItemFor } from './shop';
import { BG_LIST } from '../components/PixelAvatar';

describe('shop catalogue', () => {
  it('names only backgrounds that actually exist', () => {
    const known = new Set(BG_LIST.map(b => b.id));
    for (const id of FREE_BG_IDS) expect(known.has(id as any), `unknown background: ${id}`).toBe(true);
    for (const item of SHOP_ITEMS.filter(i => i.kind === 'bg')) {
      expect(known.has(item.refId as any), `unknown background: ${item.refId}`).toBe(true);
    }
  });

  it('never charges for a background it also gives away', () => {
    // Both lists are hand-maintained; an id in both would show a price tag
    // on something already unlocked.
    for (const item of SHOP_ITEMS.filter(i => i.kind === 'bg')) {
      expect(FREE_BG_IDS).not.toContain(item.refId);
    }
  });

  it('offers enough free backgrounds to be a choice', () => {
    // There used to be three, two of them locked behind badges, so the
    // picker offered a choice of one.
    expect(FREE_BG_IDS.length).toBeGreaterThanOrEqual(8);
  });

  it('finds an item by what it unlocks', () => {
    expect(shopItemFor('bg', 'hive')?.cost).toBeGreaterThan(0);
    expect(shopItemFor('bg', 'ink')).toBeUndefined();
  });
});
