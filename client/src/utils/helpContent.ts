import { IconName } from '../components/Icon';
import { PREMIUM_POINT_MAX } from './coins';

// Every answer the app gives about itself, in one place. This used to live
// inside HelpPage.tsx, which was fine while the Help page was the only thing
// that showed it — then the mascot's chat started answering the same
// questions in the corner. Two copies of "what does 60% mean" is how they
// end up disagreeing, so both read from here.
//
// Ids exist so the chat can group items into topics by reference instead of
// restating their text; nothing else uses them.

export interface HowToItem {
  id: string;
  icon: IconName;
  title: string;
  body: string;
}

export interface FaqItem {
  id: string;
  icon: IconName;
  q: string;
  a: string;
}

// "What can I actually do here" — the thing the Help page was missing. The
// FAQ answers questions someone already knows to ask; this answers the one
// nobody asks out loud, which is what the service is for. Split by role for
// the same reason the FAQ is: half of each list is unreachable for the other
// one, and a list of things you can't do is worse than no list.
export const TESTER_HOW_TO: HowToItem[] = [
  {
    id: 'courses',
    icon: 'graduation',
    title: 'Проходи курсы',
    body: 'Лекции идут по порядку, следующая открывается после сданного теста (60% и выше). Пересдавать можно сколько угодно: сохраняется лучший результат, прогресс по остальным урокам не сбрасывается.',
  },
  {
    id: 'propose-course',
    icon: 'sparkle',
    title: 'Предложи свой курс',
    body: '«Курсы» → «Создать курс». Курс уйдёт лиду на проверку и после одобрения опубликуется под твоим именем — как и любой курс от лида.',
  },
  {
    id: 'bagodelnya',
    icon: 'bug',
    title: 'Пополняй Багодельню',
    body: 'Свой пример бага «как плохо / как хорошо» или термин в глоссарий. Тоже через проверку лида, после неё материал видит вся команда.',
  },
  {
    id: 'guides',
    icon: 'books',
    title: 'Пиши гайды',
    body: 'Раздел «Гайды» — редактор с заголовками, списками, блоками кода и картинками. Свой гайд предлагается на проверку так же, как курс.',
  },
  {
    id: 'coins',
    icon: 'card',
    title: 'Зарабатывай баг-коины',
    body: 'Копятся сами: за сданные тесты, пройденные целиком курсы и за каждый одобренный материал. Тратятся в Багодельне на рамки, фоны и аватарки — на обучение не влияют никак.',
  },
  {
    id: 'cards',
    icon: 'trophy',
    title: 'Собирай карточки и бейджи',
    body: 'За сданную лекцию падает карточка, редкость зависит от балла. Собрал все карточки по теме — из них крафтится бейдж. Отдельно есть ачивки за поступки вроде первого одобренного материала.',
  },
  {
    id: 'profile',
    icon: 'user',
    title: 'Обустрой профиль',
    body: 'Ник, статус-цитата, специализация, инфобокс, лягушачья шутка. Аватар можно загрузить свой и выложить в общую галерею, а рамку, фон и акцентный цвет — купить в Багодельне. Профиль можно открыть для всех или держать закрытым.',
  },
  {
    id: 'streak',
    icon: 'lightning',
    title: 'Держи стрик',
    body: 'Дни подряд, в которые ты что-то делал. Считается по твоему дню, а не по серверному времени — про полночь можно не переживать.',
  },
  {
    id: 'suggestions',
    icon: 'memo',
    title: 'Кидай идеи и жалобы',
    body: 'Доска «Идеи»: своё предложение, лайк чужому. Лид правда читает — это не ящик в никуда.',
  },
  {
    id: 'premium',
    icon: 'star',
    title: 'Премиальные баллы',
    body: 'Отдельная от баг-коинов история: их начисляет лид вручную за заметный вклад, с причиной, и видно их в профиле. Косметику на них не купить — они про признание.',
  },
];

export const LEAD_HOW_TO: HowToItem[] = [
  {
    id: 'build-courses',
    icon: 'sparkle',
    title: 'Собирай курсы',
    body: 'Модули, уроки и тесты, у каждого урока — тип и пререквизит: нет / рекомендация (не блокирует) / обязательно (блокирует до прохождения). Правки не сбрасывают чужой прогресс.',
  },
  {
    id: 'review-queue',
    icon: 'clipboard',
    title: 'Разбирай очередь предложений',
    body: 'Курсы, гайды, примеры багов и термины от команды приходят на проверку. Одобрение публикует материал под именем автора, шлёт ему уведомление и начисляет баг-коины — суммы в блоке ниже.',
  },
  {
    id: 'team',
    icon: 'barchart',
    title: 'Следи за командой',
    body: '«Команда»: прогресс по курсам у каждого, аналитика по лекциям (средний балл и процент сдачи — видно, где команде тяжелее всего), рейтинг и лента активности.',
  },
  {
    id: 'bonuses',
    icon: 'star',
    title: 'Начисляй премии',
    body: `«Команда» → карточка человека → «Премия». От 1 до ${PREMIUM_POINT_MAX} баллов с обязательной причиной; человек увидит и сумму, и текст. Рекомендуемая шкала — в блоке ниже.`,
  },
  {
    id: 'permissions',
    icon: 'key',
    title: 'Выдавай права',
    body: 'Багодельня, Курсы, Гайды — точечные права, которые можно дать тестировщику без смены роли. Он получит и редактирование нужного раздела, и очередь заявок по нему.',
  },
  {
    id: 'deadlines',
    icon: 'calendar',
    title: 'Ставь персональные дедлайны',
    body: 'Если человек был в отпуске — индивидуальное продление по конкретному курсу, вместо сдвига дедлайна для всей команды.',
  },
];

export const TESTER_FAQ: FaqItem[] = [
  {
    id: 'how-courses',
    icon: 'graduation',
    q: 'Как проходить курсы?',
    a: 'Открой «Курсы» в меню. Лекции идут по порядку — следующая открывается, когда пройдена предыдущая (тест сдан на 60% и выше). У дополнительных курсов от лида порядок уроков такой же, но иногда пререквизит — просто рекомендация к прочтению, а не обязательное условие (это будет видно в описании урока).',
  },
  {
    id: 'failed-test',
    icon: 'memo',
    q: 'Что будет, если не сдать тест?',
    a: 'Ничего страшного — попытку можно повторить в любой момент, старый результат просто заменится новым. Прогресс по остальным лекциям не сбрасывается.',
  },
  {
    id: 'what-coins',
    icon: 'card',
    q: 'Что такое баг-коины и Багодельня?',
    a: 'Баг-коины начисляются автоматически: за сдачу тестов (только за первую попытку по лекции), за пройденный целиком курс и за каждый одобренный материал — курс, гайд, пример бага, термин. В «Багодельне» на них можно купить косметику для профиля — рамки аватара, фон и т.д. Это никак не влияет на прогресс обучения.',
  },
  {
    id: 'coins-vs-premium',
    icon: 'star',
    q: 'Чем премиальные баллы отличаются от баг-коинов?',
    a: 'Баг-коины сервис начисляет сам и тратятся они только на косметику. Премиальные баллы начисляет лид вручную и с причиной, за что-то заметное — потратить их в магазине нельзя, они копятся как признание вклада.',
  },
  {
    id: 'locked-lesson',
    icon: 'lock',
    q: 'Почему урок недоступен?',
    a: 'Если рядом с уроком иконка замка — сначала нужно пройти обязательный урок-пререквизит перед ним. Он указан в описании при наведении в списке уроков курса.',
  },
];

export const LEAD_FAQ: FaqItem[] = [
  {
    id: 'create-course',
    icon: 'sparkle',
    q: 'Как создать курс?',
    a: '«Курсы» → «Создать курс». Добавляй модули и уроки, для уроков можно выбрать тип (урок или тест) и настроить пререквизит: нет / рекомендация (не блокирует доступ) / обязательно (блокирует, пока не пройден выбранный урок).',
  },
  {
    id: 'edit-progress',
    icon: 'floppy',
    q: 'Что будет с прогрессом тестировщиков, если я отредактирую курс?',
    a: 'Прогресс сохраняется: уже пройденные уроки остаются пройденными, даже после правок текста или добавления/удаления других уроков в курсе. Сбросить прогресс по конкретному уроку может только его удаление.',
  },
  {
    id: 'concurrent-edit',
    icon: 'warning',
    q: 'Что если кто-то ещё редактирует этот же курс?',
    a: 'При сохранении приложение проверит, не изменил ли курс кто-то ещё, пока он был открыт у тебя. Если да — предупредит и спросит подтверждение перед перезаписью.',
  },
  {
    id: 'lecture-stats',
    icon: 'barchart',
    q: 'Где посмотреть аналитику по лекциям?',
    a: '«Команда» → вкладка «Лекции» — средний балл и процент сдачи по каждой лекции, помогает увидеть, где команде тяжелее всего.',
  },
];

export const isLeadRole = (role: string) => role === 'lead' || role === 'admin';

export const howToFor = (role: string) => (isLeadRole(role) ? LEAD_HOW_TO : TESTER_HOW_TO);
export const faqFor = (role: string) => (isLeadRole(role) ? LEAD_FAQ : TESTER_FAQ);

// ===== CHAT TOPICS =====
// The mascot's chat asks "what's it about?" before answering, so the items
// above need a grouping the Help page doesn't. Topics reference items by id
// rather than repeating their text — the answer a person gets in the chat is
// the same string the Help page renders, character for character.
//
// Ordering inside a topic is deliberate: the how-to item ("here's how this
// works") comes before the FAQ items ("here's the thing that trips people
// up"), because someone who opened a chat to ask usually needs the first
// before the second.

export interface ChatAnswer {
  id: string;
  label: string;
  text: string;
}

export interface ChatTopic {
  id: string;
  label: string;
  icon: IconName;
  answers: ChatAnswer[];
}

type Ref = { how: string } | { faq: string };

const TESTER_TOPICS: { id: string; label: string; icon: IconName; refs: Ref[] }[] = [
  {
    id: 'learning', label: 'Курсы и тесты', icon: 'graduation',
    refs: [{ how: 'courses' }, { faq: 'how-courses' }, { faq: 'failed-test' }, { faq: 'locked-lesson' }],
  },
  {
    id: 'points', label: 'Баллы и магазин', icon: 'card',
    refs: [{ how: 'coins' }, { faq: 'what-coins' }, { how: 'premium' }, { faq: 'coins-vs-premium' }],
  },
  {
    id: 'contribute', label: 'Свои материалы', icon: 'sparkle',
    refs: [{ how: 'propose-course' }, { how: 'guides' }, { how: 'bagodelnya' }],
  },
  {
    id: 'me', label: 'Профиль и прогресс', icon: 'user',
    refs: [{ how: 'profile' }, { how: 'cards' }, { how: 'streak' }],
  },
  {
    id: 'team', label: 'Связь с командой', icon: 'memo',
    refs: [{ how: 'suggestions' }],
  },
];

const LEAD_TOPICS: { id: string; label: string; icon: IconName; refs: Ref[] }[] = [
  {
    id: 'courses', label: 'Курсы', icon: 'sparkle',
    refs: [{ how: 'build-courses' }, { faq: 'create-course' }, { faq: 'edit-progress' }, { faq: 'concurrent-edit' }],
  },
  {
    id: 'queue', label: 'Заявки от команды', icon: 'clipboard',
    refs: [{ how: 'review-queue' }],
  },
  {
    id: 'team', label: 'Команда и аналитика', icon: 'barchart',
    refs: [{ how: 'team' }, { faq: 'lecture-stats' }],
  },
  {
    id: 'rewards', label: 'Премии и права', icon: 'star',
    refs: [{ how: 'bonuses' }, { how: 'permissions' }, { how: 'deadlines' }],
  },
];

export function chatTopicsFor(role: string): ChatTopic[] {
  const how = howToFor(role);
  const faq = faqFor(role);
  const source = isLeadRole(role) ? LEAD_TOPICS : TESTER_TOPICS;

  return source.map(t => ({
    id: t.id,
    label: t.label,
    icon: t.icon,
    answers: t.refs
      .map((ref): ChatAnswer | null => {
        if ('how' in ref) {
          const item = how.find(h => h.id === ref.how);
          return item ? { id: item.id, label: item.title, text: item.body } : null;
        }
        const item = faq.find(f => f.id === ref.faq);
        return item ? { id: item.id, label: item.q, text: item.a } : null;
      })
      // A ref that no longer resolves means an item was renamed or removed;
      // dropping it keeps the chat working rather than rendering a blank
      // button, and the Help page stays the complete list either way.
      .filter((a): a is ChatAnswer => a !== null),
  }));
}
