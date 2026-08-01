// Server-side `avatar_initials` is computed once, from the real name, at
// registration — it goes stale the moment someone sets a nickname (the nav
// badge kept showing initials from a name nobody sees anywhere else
// anymore). This computes initials live from whatever name is actually
// being displayed, so the badge always matches the name right next to it.
export function computeInitials(name: string): string {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
