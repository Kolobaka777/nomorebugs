import { useState } from 'react';
import SnailLoader from '../SnailLoader';
import { parseServerDate } from '../../utils/date';

export default function RatingsTab({
  ratings,
  ratingsError,
  loadRatings,
}: {
  ratings: any[] | null;
  ratingsError: string;
  loadRatings: () => void;
}) {
  const [expandedRatingId, setExpandedRatingId] = useState<number | null>(null);

  return (
    <div>
      <p className="text-pixel/60 text-xs font-sans mb-1">
        Автоматический рейтинг качества + скорости — тестировщики его не видят.
      </p>
      <div className="text-pixel/45 text-xs font-sans mb-4 space-y-1">
        <p>⭐ <b>+5 баллов</b> — лекция сдана на ≥90%, без единого подозрительно быстрого ответа и без переключений вкладки во время теста.</p>
        <p>⭐ <b>+3 балла</b> — чек-лист из 5+ пунктов пройден без единого «fail» (максимум 5 раз в день за один и тот же тип задачи, чтобы нельзя было фармить повторной отправкой).</p>
        <p>Списать баллы, срезав угол, не получится — начисление идёт только по серверной проверке, не по тому, что прислал браузер.</p>
      </div>
      {ratingsError ? (
        <div className="card text-center py-8">
          <p className="text-sm font-sans mb-3" style={{ color: '#e05252' }}>{ratingsError}</p>
          <button onClick={loadRatings} className="btn-secondary text-xs px-4 py-2">Повторить</button>
        </div>
      ) : ratings ? (
        <div className="space-y-1.5">
          {ratings.map((r: any, i: number) => {
            const expanded = expandedRatingId === r.id;
            return (
              <div key={r.id} className="rounded" style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.08)' }}>
                <button
                  onClick={() => setExpandedRatingId(expanded ? null : r.id)}
                  className="w-full p-3 flex items-center justify-between gap-3 flex-wrap text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-pixel/40 text-xs font-sans w-5">{i + 1}.</span>
                    <span className="text-pixel text-sm font-sans font-semibold">{r.name}</span>
                    <span className="text-pixel/40 text-xs font-sans">{expanded ? '▾' : '▸'}</span>
                  </div>
                  <span className="text-xs font-sans" style={{ color: 'rgba(232,232,208,0.6)' }}>
                    {r.excellentQuizzes} отличных тестов · {r.cleanChecklists} чистых чеклистов · видимых баллов: {r.premiumPoints}
                  </span>
                  <span className="text-primary text-sm font-pixel font-semibold shrink-0">★ {r.hiddenScore}</span>
                </button>
                {expanded && (
                  <div className="px-3 pb-3 pt-1" style={{ borderTop: '1px solid rgba(232,232,208,0.06)' }}>
                    {r.recentEvents?.length > 0 ? (
                      <div className="space-y-1 mt-2">
                        {r.recentEvents.map((e: any, ei: number) => (
                          <div key={ei} className="flex items-center justify-between gap-3 text-xs font-sans" style={{ color: 'rgba(232,232,208,0.6)' }}>
                            <span>+{e.points} — {e.reason}</span>
                            <span className="text-pixel/40 shrink-0">{parseServerDate(e.created_at).toLocaleDateString('ru-RU')}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-pixel/40 text-xs font-sans mt-2">Пока нет начислений.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {ratings.length === 0 && <p className="text-pixel/50 text-sm font-sans">Пока нет данных.</p>}
        </div>
      ) : <SnailLoader />}
    </div>
  );
}
