// Russian counts need three forms, not two: 1 урок, 2 урока, 5 уроков — and
// the teens are the trap, since 11–14 take the many-form despite ending in
// 1–4. Written once here because the course header alone needs it for three
// different nouns, and every one of them would have got it wrong by hand.
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2];
  const last = abs % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

// The header renders "8 УРОКОВ" — the number and its noun as one string.
export function counted(n: number, forms: [string, string, string]): string {
  return `${n} ${plural(n, forms)}`;
}
