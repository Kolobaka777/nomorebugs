import { useState } from 'react';
import Navigation from '../components/Navigation';
import PixelIcon, { IconName } from '../components/PixelIcon';

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
    icon: 'lightning',
    q: 'Что такое «серия дней» (стрик)?',
    a: 'Считаются только дни с реальным прогрессом — пройденная лекция, чек-лист или урок. Просто зайти в приложение не считается.',
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
  {
    icon: 'bug',
    q: 'Что значит «Могут ждать поддержки» в команде?',
    a: 'Так помечены тестировщики, которые не заходили неделю или больше. Это не показатель лени — иногда стоит просто написать и спросить, всё ли в порядке.',
  },
];

function FaqSection({ items }: { items: FaqItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const open = openIdx === i;
        return (
          <div key={i} className="rounded overflow-hidden" style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.08)' }}>
            <button
              onClick={() => setOpenIdx(open ? null : i)}
              aria-expanded={open}
              className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
            >
              <PixelIcon name={item.icon} size={14} color="#1D9E75" />
              <span className="flex-1 font-sans text-sm font-semibold" style={{ color: '#e8e8d0' }}>{item.q}</span>
              <span className="font-sans text-xs" style={{ color: 'rgba(232,232,208,0.6)', transform: open ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>›</span>
            </button>
            {open && (
              <p className="px-4 pb-4 font-sans text-sm leading-relaxed" style={{ color: 'rgba(232,232,208,0.65)' }}>
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
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-8 fade-in">
        <div className="mb-8">
          <h1 className="font-pixel text-primary mb-2" style={{ fontSize: '0.8rem', lineHeight: 1.8 }}>
            <span className="flex items-center gap-2"><PixelIcon name="lightbulb" size={14} color="#1D9E75" /> Помощь</span>
          </h1>
          <p className="text-pixel/60 text-sm font-sans">Частые вопросы о том, как всё устроено</p>
        </div>
        <FaqSection items={faq} />
      </div>
    </div>
  );
}
