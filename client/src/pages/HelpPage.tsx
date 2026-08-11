import { useState } from 'react';
import Navigation from '../components/Navigation';
import Icon, { IconName } from '../components/Icon';
import { PAGE_GRADIENT, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, CARD_SHADOW, TRACK_WIDE } from '../utils/theme';

interface Props {
  user: any;
  onLogout: () => void;
}

interface FaqItem {
  q: string;
  a: string;
  icon: IconName;
}

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
    icon: 'clipboard',
    q: 'Как отправить чек-лист на проверку?',
    a: 'В разделе «Чеклисты» выбери нужный шаблон, заполни, отметь пункты (ок/ошибка/не применимо) и отправь. Результат появится в общей истории проверок, лид увидит его там.',
  },
  {
    icon: 'card',
    q: 'Что такое баг-коины и Багодельня?',
    a: 'Баг-коины начисляются за сдачу тестов. В «Багодельне» на них можно купить косметику для профиля — рамки аватара, фон и т.д. Это никак не влияет на прогресс обучения.',
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
    a: 'Прогресс сохраняется: уже пройденные уроки остаются пройденными, даже если ты поменяла текст, добавила или удалила другие уроки в курсе. Сбросить прогресс по конкретному уроку может только его удаление.',
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

function FaqSection({ items }: { items: FaqItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div className="space-y-2">
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
  const faq = user.role === 'lead' ? LEAD_FAQ : TESTER_FAQ;

  return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-8 fade-in">
        <div className="mb-8">
          <h1 className="font-montserrat font-bold mb-2 flex items-center gap-2" style={{ fontSize: 24, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
            <Icon name="lightbulb" size={22} color={ACCENT} /> Помощь
          </h1>
          <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>Частые вопросы о том, как всё устроено</p>
        </div>
        <FaqSection items={faq} />
      </div>
    </div>
  );
}
