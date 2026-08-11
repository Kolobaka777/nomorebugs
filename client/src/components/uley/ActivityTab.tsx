import Icon from '../Icon';
import { ActivityItem } from '../../types';
import { parseServerDate } from '../../utils/date';
import { formatActivityAction } from '../../utils/activity';
import { ACCENT, BADGE_NOTIFY, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, TRACK_WIDE } from '../../utils/theme';

export default function ActivityTab({
  activity,
  activityHasMore,
  activityLoading,
  loadMoreActivity,
  teamNameById,
}: {
  activity: ActivityItem[];
  activityHasMore: boolean;
  activityLoading: boolean;
  loadMoreActivity: () => void;
  teamNameById: Record<number, string>;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h2 className="font-montserrat font-semibold flex items-center gap-2" style={{ fontSize: 14, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>
          <Icon name="bug" size={16} color="currentColor" />Жучиная нора
        </h2>
      </div>
      <div className="space-y-2">
        {(Array.isArray(activity) ? activity : []).length === 0 ? (
          <div className="card text-center py-8">
            <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>Нет активности</p>
          </div>
        ) : (
          (Array.isArray(activity) ? activity : []).map(item => (
            <div
              key={item.id}
              className="p-3 rounded-lg flex items-start justify-between gap-4"
              style={{
                background: CARD_BG,
                borderLeft: `3px solid ${
                  item.action === 'passed_lecture' ? ACCENT :
                  item.action === 'failed_lecture' ? '#e05252' :
                  BADGE_NOTIFY
                }`,
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="font-geist font-semibold text-sm break-words" style={{ color: TEXT_PRIMARY }}>{item.name}</p>
                <p className="font-geist text-xs break-words" style={{ color: TEXT_MUTED }}>
                  {formatActivityAction(item.action, { lectureTitle: item.lecture_title, courseTitle: item.course_title, nameById: teamNameById, gender: item.gender })}
                </p>
              </div>
              <p className="font-geist text-xs shrink-0" style={{ color: TEXT_MUTED }}>
                {parseServerDate(item.created_at).toLocaleString('ru-RU', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          ))
        )}
      </div>
      {activityHasMore && (
        <div className="text-center mt-4">
          <button onClick={loadMoreActivity} disabled={activityLoading} className="btn-secondary text-xs px-4 py-2 disabled:opacity-50">
            {activityLoading ? '...' : 'Показать ещё'}
          </button>
        </div>
      )}
    </div>
  );
}
