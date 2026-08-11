import SnailLoader from '../SnailLoader';
import { SKillChart, TesterSkillBreakdown } from '../../types';
import { ACCENT, BADGE_NOTIFY, TEXT_PRIMARY, TEXT_MUTED } from '../../utils/theme';

export default function BeforeAfterTab({
  skillChart,
  byTester,
  byTesterError,
  loadByTester,
}: {
  skillChart: SKillChart[];
  byTester: TesterSkillBreakdown[] | null;
  byTesterError: string;
  loadByTester: () => void;
}) {
  return (
    <div className="space-y-5">
      <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>
        Сравнение средних навыков команды до и после обучения
      </p>
      {skillChart.map(skill => (
        <div key={skill.skill} className="card">
          <div className="flex justify-between items-center mb-4">
            <p className="font-geist font-semibold text-sm" style={{ color: TEXT_PRIMARY }}>{skill.skill}</p>
            <span
              className="font-geist text-xs font-bold px-2 py-1 rounded"
              style={{
                color: skill.delta > 0 ? ACCENT : TEXT_MUTED,
                background: skill.delta > 0 ? 'rgba(102, 252, 241, 0.15)' : 'transparent',
              }}
            >
              {skill.delta > 0 ? `+${skill.delta}` : skill.delta === 0 ? '—' : skill.delta}
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="font-geist text-xs w-12 shrink-0" style={{ color: TEXT_MUTED }}>ДО</span>
              <div className="xp-bar-track-amber flex-1">
                <div
                  className="xp-bar-fill-amber"
                  style={{ width: `${(skill.before / 5) * 100}%` }}
                />
              </div>
              <span className="font-geist text-xs w-10 text-right" style={{ color: BADGE_NOTIFY }}>{skill.before}/5</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-geist text-xs w-12 shrink-0" style={{ color: TEXT_MUTED }}>ПОСЛЕ</span>
              <div className="xp-bar-track flex-1">
                <div
                  className="xp-bar-fill"
                  style={{ width: `${(skill.after / 5) * 100}%` }}
                />
              </div>
              <span className="font-geist text-xs w-10 text-right" style={{ color: ACCENT }}>{skill.after}/5</span>
            </div>
          </div>
        </div>
      ))}

      {/* Per-employee breakdown — the chart above answers "is the team
          improving", this answers "who specifically, in which topic" —
          so a lead can tell who's grown and who might need a topic
          re-explained one-on-one. */}
      <div className="mt-2">
        <p className="font-geist text-xs mb-3" style={{ color: TEXT_MUTED }}>По сотрудникам — самооценка «до» против реального результата тестов «после» по той же теме</p>
        {byTesterError ? (
          <div className="card text-center py-6">
            <p className="font-geist text-sm mb-3" style={{ color: '#e05252' }}>{byTesterError}</p>
            <button onClick={loadByTester} className="btn-secondary text-xs px-4 py-2">Повторить</button>
          </div>
        ) : byTester ? (
          byTester.length === 0 ? (
            <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>В команде пока нет тестировщиков.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full font-geist text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(197, 198, 199, 0.12)' }}>
                    <th className="text-left py-2 pr-3 font-normal" style={{ color: TEXT_MUTED }}>Тестировщик</th>
                    {byTester[0]?.skills.map(s => (
                      <th key={s.skill} className="text-center py-2 px-2 font-normal whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s.skill}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byTester.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(197, 198, 199, 0.06)' }}>
                      <td className="py-2 pr-3 font-semibold whitespace-nowrap" style={{ color: TEXT_PRIMARY }}>{t.name}</td>
                      {t.skills.map(s => {
                        const noData = s.after === null;
                        // Green = grew since baseline; amber = still weak
                        // (below the midpoint) even after taking the
                        // related lectures — a candidate for a
                        // one-on-one re-explanation; gray = no quiz
                        // attempts in this topic yet.
                        const needsHelp = !noData && (s.after as number) < 3;
                        const color = noData ? TEXT_MUTED : needsHelp ? BADGE_NOTIFY : (s.delta ?? 0) > 0 ? ACCENT : 'rgba(197, 198, 199, 0.6)';
                        return (
                          <td key={s.skill} className="text-center py-2 px-2" style={{ color }}>
                            {noData ? '—' : `${s.before ?? '—'} → ${s.after}`}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="font-geist text-xs mt-3" style={{ color: TEXT_MUTED }}>
                <span style={{ color: BADGE_NOTIFY }}>●</span> результат ниже среднего даже после лекций — возможно, стоит объяснить тему ещё раз ·{' '}
                <span style={{ color: ACCENT }}>●</span> заметный рост
              </p>
            </div>
          )
        ) : (
          <SnailLoader />
        )}
      </div>
    </div>
  );
}
