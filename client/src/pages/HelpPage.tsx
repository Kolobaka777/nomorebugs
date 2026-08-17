import { useState } from 'react';
import Navigation from '../components/Navigation';
import Icon, { IconName } from '../components/Icon';
import { COIN_REWARDS, PREMIUM_POINT_GUIDE, PREMIUM_POINT_MAX, RewardRow } from '../utils/coins';
import { PAGE_GRADIENT, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, BADGE_NOTIFY, CARD_SHADOW, TRACK_WIDE } from '../utils/theme';

interface Props {
  user: any;
  onLogout: () => void;
}

interface FaqItem {
  q: string;
  a: string;
  icon: IconName;
}

interface HowToItem {
  icon: IconName;
  title: string;
  body: string;
}

// "What can I actually do here" — the thing the page was missing. The FAQ
// below answers questions someone already knows to ask; this answers the
// one nobody asks out loud, which is what the service is for. Split by role
// for the same reason the FAQ is: half of each list is unreachable for the
// other one, and a list of things you can't do is worse than no list.
const TESTER_HOW_TO: HowToItem[] = [
  {
    icon: 'graduation',
    title: 'Проходи курсы',
    body: 'Лекции идут по порядку, следующая открывается после сданного теста (60% и выше). Пересдавать можно сколько угодно: сохраняется лучший результат, прогресс по остальным урокам не сбрасывается.',
  },
  {
    icon: 'sparkle',
    title: 'Предложи свой курс',
    body: '«Курсы» → «Создать курс». Курс уйдёт лиду на проверку и после одобрения опубликуется под твоим именем — как и любой курс от лида.',
  },
  {
    icon: 'bug',
    title: 'Пополняй Багодельню',
    body: 'Свой пример бага «как плохо / как хорошо» или термин в глоссарий. Тоже через проверку лида, после неё материал видит вся команда.',
  },
  {
    icon: 'books',
    title: 'Пиши гайды',
    body: 'Раздел «Гайды» — редактор с заголовками, списками, блоками кода и картинками. Свой гайд предлагается на проверку так же, как курс.',
  },
  {
    icon: 'card',
    title: 'Зарабатывай баг-коины',
    body: 'Копятся сами: за сданные тесты, пройденные целиком курсы и за каждый одобренный материал. Тратятся в Багодельне на рамки, фоны и аватарки — на обучение не влияют никак.',
  },
  {
    icon: 'trophy',
    title: 'Собирай карточки и бейджи',
    body: 'За сданную лекцию падает карточка, редкость зависит от балла. Собрал все карточки по теме — из них крафтится бейдж. Отдельно есть ачивки за поступки вроде первого одобренного материала.',
  },
  {
    icon: 'user',
    title: 'Обустрой профиль',
    body: 'Ник, статус-цитата, специализация, инфобокс, лягушачья шутка. Аватар можно загрузить свой и выложить в общую галерею, а рамку, фон и акцентный цвет — купить в Багодельне. Профиль можно открыть для всех или держать закрытым.',
  },
  {
    icon: 'lightning',
    title: 'Держи стрик',
    body: 'Дни подряд, в которые ты что-то делал. Считается по твоему дню, а не по серверному времени — про полночь можно не переживать.',
  },
  {
    icon: 'memo',
    title: 'Кидай идеи и жалобы',
    body: 'Доска «Идеи»: своё предложение, лайк чужому. Лид правда читает — это не ящик в никуда.',
  },
  {
    icon: 'star',
    title: 'Премиальные баллы',
    body: 'Отдельная от баг-коинов история: их начисляет лид вручную за заметный вклад, с причиной, и видно их в профиле. Косметику на них не купить — они про признание.',
  },
];

const LEAD_HOW_TO: HowToItem[] = [
  {
    icon: 'sparkle',
    title: 'Собирай курсы',
    body: 'Модули, уроки и тесты, у каждого урока — тип и пререквизит: нет / рекомендация (не блокирует) / обязательно (блокирует до прохождения). Правки не сбрасывают чужой прогресс.',
  },
  {
    icon: 'clipboard',
    title: 'Разбирай очередь предложений',
    body: 'Курсы, гайды, примеры багов и термины от команды приходят на проверку. Одобрение публикует материал под именем автора, шлёт ему уведомление и начисляет баг-коины — суммы в блоке ниже.',
  },
  {
    icon: 'barchart',
    title: 'Следи за командой',
    body: '«Команда»: прогресс по курсам у каждого, аналитика по лекциям (средний балл и процент сдачи — видно, где команде тяжелее всего), рейтинг и лента активности.',
  },
  {
    icon: 'star',
    title: 'Начисляй премии',
    body: `«Команда» → карточка человека → «Премия». От 1 до ${PREMIUM_POINT_MAX} баллов с обязательной причиной; человек увидит и сумму, и текст. Рекомендуемая шкала — в блоке ниже.`,
  },
  {
    icon: 'key',
    title: 'Выдавай права',
    body: 'Багодельня, Курсы, Гайды — точечные права, которые можно дать тестировщику без смены роли. Он получит и редактирование нужного раздела, и очередь заявок по нему.',
  },
  {
    icon: 'calendar',
    title: 'Ставь персональные дедлайны',
    body: 'Если человек был в отпуске — индивидуальное продление по конкретному курсу, вместо сдвига дедлайна для всей команды.',
  },
];

const TESTER_FAQ: FaqItem[] = [
  {
    icon: 'graduation',
    q: 'Как проходить курсы?',
    a: 'Открой «Курсы» в меню. Лекции идут по порядку — следующая открывается, когда пройдена предыдущая (тест сдан на 60% и выше). У дополнительных курсов от лида порядок уроков такой же, но иногда пререквизит — просто рекомендация к прочтению, а не обязательное условие (это будет видно в описании урока).',
  },
  {
    icon: 'memo',
    q: 'Что будет, если не сдать тест?',
    a: 'Ничего страшного — попытку можно повторить в любой момент, старый результат просто заменится новым. Прогресс по остальным лекциям не сбрасывается.',
  },
  {
    icon: 'card',
    q: 'Что такое баг-коины и Багодельня?',
    a: 'Баг-коины начисляются автоматически: за сдачу тестов (только за первую попытку по лекции), за пройденный целиком курс и за каждый одобренный материал — курс, гайд, пример бага, термин. В «Багодельне» на них можно купить косметику для профиля — рамки аватара, фон и т.д. Это никак не влияет на прогресс обучения.',
  },
  {
    icon: 'star',
    q: 'Чем премиальные баллы отличаются от баг-коинов?',
    a: 'Баг-коины сервис начисляет сам и тратятся они только на косметику. Премиальные баллы начисляет лид вручную и с причиной, за что-то заметное — потратить их в магазине нельзя, они копятся как признание вклада.',
  },
  {
    icon: 'lock',
    q: 'Почему урок недоступен?',
    a: 'Если рядом с уроком иконка замка — сначала нужно пройти обязательный урок-пререквизит перед ним. Он указан в описании при наведении в списке уроков курса.',
  },
];

const LEAD_FAQ: FaqItem[] = [
  {
    icon: 'sparkle',
    q: 'Как создать курс?',
    a: '«Курсы» → «Создать курс». Добавляй модули и уроки, для уроков можно выбрать тип (урок или тест) и настроить пререквизит: нет / рекомендация (не блокирует доступ) / обязательно (блокирует, пока не пройден выбранный урок).',
  },
  {
    icon: 'floppy',
    q: 'Что будет с прогрессом тестировщиков, если я отредактирую курс?',
    a: 'Прогресс сохраняется: уже пройденные уроки остаются пройденными, даже после правок текста или добавления/удаления других уроков в курсе. Сбросить прогресс по конкретному уроку может только его удаление.',
  },
  {
    icon: 'warning',
    q: 'Что если кто-то ещё редактирует этот же курс?',
    a: 'При сохранении приложение проверит, не изменил ли курс кто-то ещё, пока он был открыт у тебя. Если да — предупредит и спросит подтверждение перед перезаписью.',
  },
  {
    icon: 'barchart',
    q: 'Где посмотреть аналитику по лекциям?',
    a: '«Команда» → вкладка «Лекции» — средний балл и процент сдачи по каждой лекции, помогает увидеть, где команде тяжелее всего.',
  },
];

function SectionHeading({ icon, title, subtitle }: { icon: IconName; title: string; subtitle: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-montserrat font-bold flex items-center gap-2" style={{ fontSize: 16, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
        <Icon name={icon} size={20} color={ACCENT} /> {title}
      </h2>
      <p className="font-geist text-sm mt-1" style={{ color: TEXT_MUTED }}>{subtitle}</p>
    </div>
  );
}

// Flat list, always expanded — unlike the FAQ below, nothing here is a
// question you skip past, so hiding items behind an accordion would just
// mean nobody reads the one they didn't know to look for.
function HowToSection({ items }: { items: HowToItem[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 stagger-in">
      {items.map((item, i) => (
        <div
          key={i}
          className="rounded-lg p-4"
          style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.2)', boxShadow: CARD_SHADOW }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Icon name={item.icon} size={20} color={ACCENT} />
            <span className="font-geist text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{item.title}</span>
          </div>
          <p className="font-geist text-sm leading-relaxed" style={{ color: TEXT_MUTED }}>{item.body}</p>
        </div>
      ))}
    </div>
  );
}

// Lead-only. Deliberately a plain two-column list rather than a <table>:
// every row is "action → number", and at this width a real table's header
// row costs more than it explains.
function RewardTable({ rows, accent }: { rows: RewardRow[]; accent: string }) {
  return (
    <div className="rounded-lg overflow-hidden stagger-in" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.2)', boxShadow: CARD_SHADOW }}>
      {rows.map((row, i) => (
        <div
          key={i}
          className="flex items-baseline gap-3 px-4 py-3"
          style={i > 0 ? { borderTop: '1px solid rgba(197, 198, 199, 0.12)' } : undefined}
        >
          <div className="flex-1 min-w-0">
            <p className="font-geist text-sm" style={{ color: TEXT_PRIMARY }}>{row.action}</p>
            {row.note && <p className="font-geist text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{row.note}</p>}
          </div>
          <span className="font-montserrat font-bold shrink-0" style={{ fontSize: 15, color: accent }}>{row.amount}</span>
        </div>
      ))}
    </div>
  );
}

function FaqSection({ items }: { items: FaqItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div className="space-y-2 stagger-in">
      {items.map((item, i) => {
        const open = openIdx === i;
        return (
          <div key={i} className="rounded-lg overflow-hidden" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.2)', boxShadow: CARD_SHADOW }}>
            <button
              onClick={() => setOpenIdx(open ? null : i)}
              aria-expanded={open}
              className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
            >
              <Icon name={item.icon} size={22} color={ACCENT} />
              <span className="flex-1 font-geist text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{item.q}</span>
              <Icon
                name="chevronRight"
                size={22}
                color={TEXT_MUTED}
                style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
              />
            </button>
            {open && (
              <p className="px-4 pb-4 font-geist text-sm leading-relaxed" style={{ color: TEXT_MUTED }}>
                {item.a}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function HelpPage({ user, onLogout }: Props) {
  // Admin sees the lead's view here: the server's requireRole('lead') lets
  // admin through everywhere, so the lead material is all reachable for them
  // too — same reasoning as Navigation.tsx building adminLinks from leadLinks.
  const isLead = user.role === 'lead' || user.role === 'admin';
  const faq = isLead ? LEAD_FAQ : TESTER_FAQ;

  return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-8 fade-in">
        <div className="mb-8">
          <h1 className="font-montserrat font-bold mb-2 flex items-center gap-2" style={{ fontSize: 24, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
            <Icon name="lightbulb" size={22} color={ACCENT} /> Помощь
          </h1>
          <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>Что тут можно делать и как всё устроено</p>
        </div>

        <section className="mb-10">
          <SectionHeading
            icon="rocket"
            title="Что тут можно делать"
            subtitle={isLead ? 'Коротко про всё, до чего дотягивается лид' : 'Коротко про всё, что доступно тебе'}
          />
          <HowToSection items={isLead ? LEAD_HOW_TO : TESTER_HOW_TO} />
        </section>

        {isLead && (
          <section className="mb-10">
            <SectionHeading
              icon="card"
              title="Баг-коины: за что начисляет сервис"
              subtitle="Автоматически, без участия лида. Тратятся только на косметику в Багодельне."
            />
            <RewardTable rows={COIN_REWARDS} accent={ACCENT} />
          </section>
        )}

        {isLead && (
          <section className="mb-10">
            <SectionHeading
              icon="star"
              title="Премиальные баллы: сколько начислять"
              subtitle={`Начисляешь руками ты, форма принимает от 1 до ${PREMIUM_POINT_MAX} с причиной. Это рекомендуемая шкала, а не ограничение — она нужна, чтобы баллы у разных людей и в разные месяцы значили одно и то же.`}
            />
            <RewardTable rows={PREMIUM_POINT_GUIDE} accent={BADGE_NOTIFY} />
          </section>
        )}

        <section>
          <SectionHeading icon="memo" title="Частые вопросы" subtitle="То, о чём чаще всего спрашивают" />
          <FaqSection items={faq} />
        </section>
      </div>
    </div>
  );
}
