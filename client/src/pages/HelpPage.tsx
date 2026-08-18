import { useState } from 'react';
import Navigation from '../components/Navigation';
import Icon, { IconName } from '../components/Icon';
import TeamQuestions from '../components/TeamQuestions';
import { COIN_REWARDS, PREMIUM_POINT_GUIDE, PREMIUM_POINT_MAX, RewardRow } from '../utils/coins';
import { FaqItem, HowToItem, faqFor, howToFor, isLeadRole } from '../utils/helpContent';
import { PAGE_GRADIENT, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, BADGE_NOTIFY, CARD_SHADOW, TRACK_WIDE } from '../utils/theme';

interface Props {
  user: any;
  onLogout: () => void;
}

// The lists this page renders moved to utils/helpContent.ts when the frog's
// chat started answering the same questions in the corner — see the comment
// there. This page still shows all of it; the chat shows a grouped subset.
//
// Split into two tabs, same pattern as Багодельня's словарь/примеры: «Про
// платформу» is the reference material — what exists and how it works —
// while «Частые вопросы» is where someone goes when they are stuck. Asking
// the team lives on that second tab, moved over from the Идеи board: a
// person with a question opens Помощь, and the answer to "what if the FAQ
// doesn't cover it" should be right there rather than one page away.

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

type Tab = 'platform' | 'questions';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'platform', label: 'Про платформу', icon: 'rocket' },
  { id: 'questions', label: 'Частые вопросы', icon: 'memo' },
];

export default function HelpPage({ user, onLogout }: Props) {
  // Admin sees the lead's view here: the server's requireRole('lead') lets
  // admin through everywhere, so the lead material is all reachable for them
  // too — same reasoning as Navigation.tsx building adminLinks from leadLinks.
  const isLead = isLeadRole(user.role);
  const faq = faqFor(user.role);
  const [tab, setTab] = useState<Tab>('platform');

  return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-8 fade-in">
        <div className="mb-6">
          <h1 className="font-montserrat font-bold mb-2 flex items-center gap-2" style={{ fontSize: 24, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
            <Icon name="lightbulb" size={22} color={ACCENT} /> Помощь
          </h1>
          <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>Как всё устроено — и куда писать, если ответа тут не нашлось</p>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap" role="tablist">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="rounded-lg font-geist cursor-pointer px-3.5 py-2 flex items-center gap-1.5 transition-colors"
              style={{
                fontSize: 13,
                background: tab === t.id ? `${ACCENT}22` : 'rgba(197, 198, 199, 0.06)',
                color: tab === t.id ? ACCENT : 'rgba(197, 198, 199, 0.6)',
                border: `1px solid ${tab === t.id ? `${ACCENT}66` : 'transparent'}`,
              }}
            >
              <Icon name={t.icon} size={15} color="currentColor" /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'platform' && (
          <div className="fade-in">
            <section className="mb-10">
              <SectionHeading
                icon="rocket"
                title="Что тут можно делать"
                subtitle={isLead ? 'Коротко про всё, до чего дотягивается лид' : 'Коротко про всё, что доступно тебе'}
              />
              <HowToSection items={howToFor(user.role)} />
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
              <section>
                <SectionHeading
                  icon="star"
                  title="Премиальные баллы: сколько начислять"
                  subtitle={`Начисляешь руками ты, форма принимает от 1 до ${PREMIUM_POINT_MAX} с причиной. Это рекомендуемая шкала, а не ограничение — она нужна, чтобы баллы у разных людей и в разные месяцы значили одно и то же.`}
                />
                <RewardTable rows={PREMIUM_POINT_GUIDE} accent={BADGE_NOTIFY} />
              </section>
            )}
          </div>
        )}

        {tab === 'questions' && (
          <div className="fade-in">
            <section className="mb-10">
              <SectionHeading icon="memo" title="Частые вопросы" subtitle="То, о чём чаще всего спрашивают" />
              <FaqSection items={faq} />
            </section>

            <section>
              <SectionHeading
                icon="lightbulb"
                title="Вопросы команды"
                subtitle="Всё, что уже спрашивали, вместе с ответами тимлида. Раньше это жило на доске «Идеи»."
              />
              <TeamQuestions user={user} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
