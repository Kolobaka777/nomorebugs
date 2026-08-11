import { useState } from 'react';
import SnailLoader from '../SnailLoader';
import Icon from '../Icon';
import { parseServerDate } from '../../utils/date';
import { ACCENT, CARD_BG, TEXT_PRIMARY, TEXT_MUTED } from '../../utils/theme';

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
      <p className="font-geist text-xs mb-1" style={{ color: TEXT_MUTED }}>
        Автоматический рейтинг качества + скорости — тестировщики его не видят.
      </p>
      <div className="font-geist text-xs mb-4 space-y-1" style={{ color: TEXT_MUTED }}>
        <p>⭐ <b>+5 баллов</b> — лекция сдана на ≥90%, без единого подозрительно быстрого ответа и без переключений вкладки во время теста.</p>
        <p>⭐ <b>+3 балла</b> — чек-лист из 5+ пунктов пройден без единого «fail» (максимум 5 раз в день за один и тот же тип задачи, чтобы нельзя было фармить повторной отправкой).</p>
        <p>Списать баллы, срезав угол, не получится — начисление идёт только по серверной проверке, не по тому, что прислал браузер.</p>
      </div>
      {ratingsError ? (
        <div className="card text-center py-8">
          <p className="font-geist text-sm mb-3 break-words" style={{ color: '#e05252' }}>{ratingsError}</p>
          <button onClick={loadRatings} className="btn-secondary text-xs px-4 py-2">Повторить</button>
        </div>
      ) : ratings ? (
        <div className="space-y-1.5">
          {ratings.map((r: any, i: number) => {
            const expanded = expandedRatingId === r.id;
            return (
              <div key={r.id} className="rounded-lg" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.2)' }}>
                <button
                  onClick={() => setExpandedRatingId(expanded ? null : r.id)}
                  className="w-full p-3 flex items-center justify-between gap-3 flex-wrap text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-geist text-xs w-5" style={{ color: TEXT_MUTED }}>{i + 1}.</span>
                    <span className="font-geist text-sm font-semibold break-words min-w-0" style={{ color: TEXT_PRIMARY }}>{r.name}</span>
                    <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={16} color={TEXT_MUTED} />
                  </div>
                  <span className="font-geist text-xs" style={{ color: TEXT_MUTED }}>
                    {r.excellentQuizzes} отличных тестов · {r.cleanChecklists} чистых чеклистов · видимых баллов: {r.premiumPoints}
                  </span>
                  <span className="font-montserrat font-semibold text-sm shrink-0" style={{ color: ACCENT }}>★ {r.hiddenScore}</span>
                </button>
                {expanded && (
                  <div className="px-3 pb-3 pt-1" style={{ borderTop: '1px solid rgba(197, 198, 199, 0.12)' }}>
                    {r.recentEvents?.length > 0 ? (
                      <div className="space-y-1 mt-2">
                        {r.recentEvents.map((e: any, ei: number) => (
                          <div key={ei} className="flex items-center justify-between gap-3 font-geist text-xs" style={{ color: TEXT_MUTED }}>
                            <span className="break-words min-w-0">+{e.points} — {e.reason}</span>
                            <span className="shrink-0">{parseServerDate(e.created_at).toLocaleDateString('ru-RU')}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="font-geist text-xs mt-2" style={{ color: TEXT_MUTED }}>Пока нет начислений.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {ratings.length === 0 && <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>Пока нет данных.</p>}
        </div>
      ) : <SnailLoader />}
    </div>
  );
}
