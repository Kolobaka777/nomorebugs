// The app's two point ledgers, written down for the Помощь page.
//
// They are deliberately not the same thing and are never mixed:
//  - bug-coins are automatic. The server grants them, the tester spends
//    them in Багодельня on cosmetics, and nothing about them touches the
//    real world.
//  - premium points are manual. A lead awards them with a reason (see
//    POST /api/lead/award-bonus), they're meant to convert into something
//    real like an отгул, and that conversion is a human decision made off
//    the app.
//
// Only the premium-point guidance lives here now. That one is genuinely
// editorial — a recommended scale for a human decision, enforced nowhere —
// so it has no server-side counterpart to drift from. The bug-coin table
// does, and is fetched rather than copied; see the note below.

export interface RewardRow {
  action: string;
  amount: string;
  note?: string;
}

// The bug-coin price list is NOT mirrored here.
//
// It used to be, and it drifted: after the scheme was rebuilt around
// modules the copy here still promised coins by score band (25/18/10),
// consolation coins for a failed test, and 50 for finishing a course —
// none of which the server had paid for some time. The lead read that on
// the Помощь page and the real numbers on their own page, both at once.
//
// It comes from GET /api/coins/rules now, which serves COIN_REWARDS in
// server/src/routeHelpers.js directly, so the only description of the
// economy anyone can read is the one the economy actually runs on. See
// HelpPage.tsx and components/uley/CoinRulesCard.tsx.

// Not enforced anywhere — the award form takes any amount from 1 to 500 with
// a reason. This is the scale to keep the numbers meaning the same thing
// across different leads and different months, which is the only way a point
// total stays comparable between people.
export const PREMIUM_POINT_GUIDE: RewardRow[] = [
  { action: 'Разовое «спасибо» за мелочь', amount: '10–25', note: 'помог с окружением, подсказал, быстро глянул чужой баг' },
  { action: 'Помог коллеге разобраться, провёл разбор', amount: '25–50', note: 'потратил своё время на чужое обучение' },
  { action: 'Закрыл курс до дедлайна без пересдач', amount: '30', note: 'видно в «Команда» → прогресс по курсу' },
  { action: 'Регулярно пополняет Багодельню и гайды', amount: '50', note: 'разово по итогам месяца, а не за каждый материал — за них уже идут баг-коины' },
  { action: 'Нашёл критичный баг вне своих задач', amount: '100', note: 'то, что не поймал бы никто по плану' },
  { action: 'Взял на себя чужую задачу, подменил, переработал', amount: '150', note: 'выручил команду в ущерб своему времени' },
  { action: 'Автор курса или гайда, который взяли в онбординг', amount: '200', note: 'материал, которым теперь учат новичков' },
];

export const PREMIUM_POINT_MAX = 500;
