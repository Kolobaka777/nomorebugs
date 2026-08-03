import { LectureStat } from '../../types';

export default function LecturesTab({ lectureStats }: { lectureStats: LectureStat[] }) {
  return (
    <div className="space-y-3">
      <p className="text-pixel/60 text-xs font-sans mb-2">
        Средний балл и процент сдачи по каждой лекции — помогает увидеть, где команде тяжелее всего
      </p>
      {lectureStats.map(lec => {
        const noData = lec.attempts === 0;
        const passColor = noData ? 'rgba(232,232,208,0.55)'
          : lec.passRate! >= 70 ? '#1D9E75'
          : lec.passRate! >= 40 ? '#EF9F27'
          : '#e05252';
        return (
          <div key={lec.id} className="card">
            <div className="flex justify-between items-center mb-2">
              <div>
                <p className="text-pixel font-sans font-semibold text-sm">{lec.title}</p>
                <p className="text-pixel/55 text-xs font-sans">{lec.skill_area}</p>
              </div>
              <div className="text-right shrink-0">
                {noData ? (
                  <p className="text-pixel/55 text-xs font-sans">нет данных</p>
                ) : (
                  <>
                    <p className="text-sm font-sans font-semibold" style={{ color: passColor }}>{lec.passRate}% сдали</p>
                    <p className="text-pixel/55 text-xs font-sans">ср. балл {lec.avgScore}% · {lec.attempts} чел.</p>
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
