import SnailLoader from '../SnailLoader';
import { SKillChart, TesterSkillBreakdown } from '../../types';

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
      <p className="text-pixel/60 text-xs font-sans">
        Сравнение средних навыков команды до и после обучения
      </p>
      {skillChart.map(skill => (
        <div key={skill.skill} className="card">
          <div className="flex justify-between items-center mb-4">
            <p className="text-pixel font-sans font-semibold text-sm">{skill.skill}</p>
            <span
              className="text-xs font-sans font-bold px-2 py-1 rounded"
              style={{
                color: skill.delta > 0 ? '#1D9E75' : 'rgba(232,232,208,0.4)',
                background: skill.delta > 0 ? 'rgba(29,158,117,0.15)' : 'transparent',
              }}
            >
              {skill.delta > 0 ? `+${skill.delta}` : skill.delta === 0 ? '—' : skill.delta}
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-pixel/60 text-xs font-sans w-12 shrink-0">ДО</span>
              <div className="xp-bar-track-amber flex-1">
                <div
                  className="xp-bar-fill-amber"
                  style={{ width: `${(skill.before / 5) * 100}%` }}
                />
              </div>
              <span className="text-amber text-xs font-sans w-10 text-right">{skill.before}/5</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-pixel/60 text-xs font-sans w-12 shrink-0">ПОСЛЕ</span>
              <div className="xp-bar-track flex-1">
                <div
                  className="xp-bar-fill"
                  style={{ width: `${(skill.after / 5) * 100}%` }}
                />
              </div>
              <span className="text-primary text-xs font-sans w-10 text-right">{skill.after}/5</span>
            </div>
          </div>
        </div>
      ))}

      {/* Per-employee breakdown — the chart above answers "is the team
          improving", this answers "who specifically, in which topic" —
          so a lead can tell who's grown and who might need a topic
          re-explained one-on-one. */}
      <div className="mt-2">
        <p className="text-pixel/60 text-xs font-sans mb-3">По сотрудникам — самооценка «до» против реального результата тестов «после» по той же теме</p>
        {byTesterError ? (
          <div className="card text-center py-6">
            <p className="text-sm font-sans mb-3" style={{ color: '#e05252' }}>{byTesterError}</p>
            <button onClick={loadByTester} className="btn-secondary text-xs px-4 py-2">Повторить</button>
          </div>
        ) : byTester ? (
          byTester.length === 0 ? (
            <p className="text-pixel/50 text-sm font-sans">В команде пока нет тестировщиков.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-sans" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(232,232,208,0.1)' }}>
                    <th className="text-left py-2 pr-3 text-pixel/50 font-normal">Тестировщик</th>
                    {byTester[0]?.skills.map(s => (
                      <th key={s.skill} className="text-center py-2 px-2 text-pixel/50 font-normal whitespace-nowrap">{s.skill}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byTester.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(232,232,208,0.05)' }}>
                      <td className="py-2 pr-3 text-pixel font-semibold whitespace-nowrap">{t.name}</td>
                      {t.skills.map(s => {
                        const noData = s.after === null;
                        // Green = grew since baseline; amber = still weak
                        // (below the midpoint) even after taking the
                        // related lectures — a candidate for a
                        // one-on-one re-explanation; gray = no quiz
                        // attempts in this topic yet.
                        const needsHelp = !noData && (s.after as number) < 3;
                        const color = noData ? 'rgba(232,232,208,0.35)' : needsHelp ? '#EF9F27' : (s.delta ?? 0) > 0 ? '#1D9E75' : 'rgba(232,232,208,0.6)';
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
              <p className="text-pixel/40 text-xs font-sans mt-3">
                <span style={{ color: '#EF9F27' }}>●</span> результат ниже среднего даже после лекций — возможно, стоит объяснить тему ещё раз ·{' '}
                <span style={{ color: '#1D9E75' }}>●</span> заметный рост
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
