import PixelIcon from '../PixelIcon';
import { ActivityItem } from '../../types';
import { parseServerDate } from '../../utils/date';
import { formatActivityAction } from '../../utils/activity';

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
        <h2
          className="font-pixel text-pixel/60"
          style={{ fontSize: '0.6rem', lineHeight: 1.8 }}
        >
          <span className="flex items-center gap-2"><PixelIcon name="bug" size={12} color="currentColor" />Жучиная нора</span>
        </h2>
      </div>
      <div className="space-y-2">
        {(Array.isArray(activity) ? activity : []).length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-pixel/60 text-sm font-sans">Нет активности</p>
          </div>
        ) : (
          (Array.isArray(activity) ? activity : []).map(item => (
            <div
              key={item.id}
              className="p-3 rounded flex items-start justify-between gap-4"
              style={{
                background: '#1a1a2e',
                borderLeft: `3px solid ${
                  item.action === 'passed_lecture' ? '#1D9E75' :
                  item.action === 'failed_lecture' ? '#e05252' :
                  '#EF9F27'
                }`,
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-pixel font-sans font-semibold text-sm">{item.name}</p>
                <p className="text-pixel/60 text-xs font-sans">
                  {formatActivityAction(item.action, { lectureTitle: item.lecture_title, nameById: teamNameById, gender: item.gender })}
                </p>
              </div>
              <p className="text-pixel/55 text-xs font-sans shrink-0">
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
