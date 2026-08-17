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
// COIN_REWARDS mirrors server/src/routeHelpers.js by hand — the same
// arrangement SHOP_ITEMS/shop.ts already has with the server's SHOP_CATALOG,
// since this repo has no shared-types boundary. Change one, change the other.

export interface RewardRow {
  action: string;
  amount: string;
  note?: string;
}

export const COIN_REWARDS: RewardRow[] = [
  { action: 'Тест сдан на 90% и выше', amount: '25', note: 'только за первую попытку по лекции' },
  { action: 'Тест сдан на 75–89%', amount: '18', note: 'только за первую попытку по лекции' },
  { action: 'Тест сдан на 60–74%', amount: '10', note: 'только за первую попытку по лекции' },
  { action: 'Тест не сдан (меньше 60%)', amount: '3', note: 'утешительные, тоже только за первую попытку' },
  { action: 'Курс пройден целиком', amount: '50', note: 'один раз на курс; сервер проверяет, что закрыты все уроки' },
  { action: 'Предложенный курс одобрен', amount: '100', note: 'начисляется автору, если одобрил кто-то другой' },
  { action: 'Предложенный гайд одобрен', amount: '60', note: 'начисляется автору, если одобрил кто-то другой' },
  { action: 'Пример бага одобрен', amount: '30', note: 'начисляется автору, если одобрил кто-то другой' },
  { action: 'Термин в глоссарии одобрен', amount: '20', note: 'начисляется автору, если одобрил кто-то другой' },
];

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
