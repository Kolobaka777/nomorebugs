import { LectureStat } from '../../types';
import { ACCENT, BADGE_NOTIFY, TEXT_PRIMARY, TEXT_MUTED } from '../../utils/theme';

export default function LecturesTab({ lectureStats }: { lectureStats: LectureStat[] }) {
  return (
    <div className="space-y-3">
      <p className="font-geist text-xs mb-2" style={{ color: TEXT_MUTED }}>
        Средний балл и процент сдачи по каждой лекции — помогает увидеть, где команде тяжелее всего
      </p>
      {lectureStats.map(lec => {
        const noData = lec.attempts === 0;
        const passColor = noData ? TEXT_MUTED
          : lec.passRate! >= 70 ? ACCENT
          : lec.passRate! >= 40 ? BADGE_NOTIFY
          : '#e05252';
        return (
          <div key={lec.id} className="card">
            <div className="flex justify-between items-center mb-2">
              <div className="min-w-0">
                <p className="font-geist font-semibold text-sm break-words" style={{ color: TEXT_PRIMARY }}>{lec.title}</p>
                <p className="font-geist text-xs break-words" style={{ color: TEXT_MUTED }}>{lec.skill_area}</p>
              </div>
              <div className="text-right shrink-0">
                {noData ? (
                  <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>нет данных</p>
                ) : (
                  <>
                    <p className="font-geist text-sm font-semibold" style={{ color: passColor }}>{lec.passRate}% сдали</p>
                    <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>ср. балл {lec.avgScore}% · {lec.attempts} чел.</p>
                  </>
                )}
              </div>
            </div>
            {!noData && (
              <div className="xp-bar-track">
                <div className="xp-bar-fill" style={{ width: `${lec.passRate}%`, background: passColor }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
