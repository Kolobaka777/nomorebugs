import { useNavigate } from 'react-router-dom';
import Icon, { IconName } from '../Icon';
import { TeamMember, PresenceEntry, getLevel } from '../../types';
import { parseServerDate } from '../../utils/date';
import { ALL_PERMISSIONS, LEAVE_LABELS, PERMISSION_LABELS } from './constants';
import { ACCENT, BADGE_NOTIFY, CARD_BG, CARD_SHADOW, PAGE_BG, TEXT_PRIMARY, TEXT_MUTED, TRACK_WIDE } from '../../utils/theme';

interface ArchivedMember { id: number; name: string; avatar_initials: string; archived_at: string; gender?: 'male' | 'female' | null }
interface Grant { id: number; user_id: number; permission: string; expires_at: string | null; granted_by_name?: string; granted_by_role?: string }

export default function TeamTab({
  team,
  presence,
  archived,
  showArchived,
  setShowArchived,
  grants,
  expiryByMember,
  setExpiryByMember,
  resettingId,
  resetResult,
  archivingId,
  bonusResult,
  noteDrafts,
  setNoteDrafts,
  savingNoteId,
  onSetPresenceTarget,
  noteValue,
  saveNote,
  togglePermission,
  resetPassword,
  setBonusTarget,
  archiveMember,
  restoreMember,
}: {
  team: TeamMember[];
  presence: PresenceEntry[];
  archived: ArchivedMember[];
  showArchived: boolean;
  setShowArchived: (fn: (prev: boolean) => boolean) => void;
  grants: Grant[];
  expiryByMember: Record<number, string>;
  setExpiryByMember: (fn: (prev: Record<number, string>) => Record<number, string>) => void;
  resettingId: number | null;
  resetResult: { id: number; message: string } | null;
  archivingId: number | null;
  bonusResult: { id: number; message: string } | null;
  noteDrafts: Record<number, string>;
  setNoteDrafts: (fn: (prev: Record<number, string>) => Record<number, string>) => void;
  savingNoteId: number | null;
  onSetPresenceTarget: (target: { id: number; name: string }) => void;
  noteValue: (member: TeamMember) => string;
  saveNote: (memberId: number) => void;
  togglePermission: (userId: number, permission: string, currentlyGranted: number | null) => void;
  resetPassword: (userId: number) => void;
  setBonusTarget: (target: { id: number; name: string }) => void;
  archiveMember: (memberId: number, name: string) => void;
  restoreMember: (memberId: number) => void;
}) {
  const navigate = useNavigate();

  return (
    <>
      <div className="space-y-4">
        {presence.length > 0 && (
          <div className="p-4 rounded-lg mb-2" style={{ background: CARD_BG, border: `1px solid ${ACCENT}40`, boxShadow: CARD_SHADOW }}>
            <p className="font-montserrat font-semibold text-xs mb-3" style={{ color: ACCENT, letterSpacing: TRACK_WIDE }}>Работают сейчас</p>
            <div className="flex flex-wrap gap-2">
              {presence.map(p => {
                const dotColor = p.currentLeave ? BADGE_NOTIFY : p.isWorkingNow ? ACCENT : 'rgba(197, 198, 199, 0.3)';
                const subtitle = p.currentLeave
                  ? `${LEAVE_LABELS[p.currentLeave.type]}${p.currentLeave.end_date ? ` до ${p.currentLeave.end_date}` : ''}`
                  : (p.workStart && p.workEnd) ? `${p.workStart}–${p.workEnd}` : 'часы не заданы';
                return (
                  <button
                    key={p.id}
                    onClick={() => onSetPresenceTarget({ id: p.id, name: p.name })}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-left"
                    style={{ background: 'rgba(197, 198, 199, 0.04)' }}
                    title="Настроить рабочее время"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                    <span>
                      <span className="block font-geist text-xs font-semibold" style={{ color: TEXT_PRIMARY }}>{p.name}</span>
                      <span className="block font-geist" style={{ fontSize: 11, color: TEXT_MUTED }}>{subtitle}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {team.map(member => {
          const lvl = getLevel(member.lecturesCompleted);
          const progPct = Math.round((member.lecturesCompleted / 10) * 100);
          return (
            <div
              key={member.id}
              className="p-5 rounded-lg"
              style={{
                background: CARD_BG,
                border: '1px solid rgba(197, 198, 199, 0.2)',
                boxShadow: CARD_SHADOW,
              }}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                {/* Avatar + name */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-montserrat font-bold text-xs shrink-0"
                    style={{ background: ACCENT, color: PAGE_BG }}
                  >
                    {member.avatar_initials}
                  </div>
                  <div>
                    <p
                      className="font-geist font-semibold text-sm cursor-pointer hover:underline"
                      style={{ color: TEXT_PRIMARY }}
                      onClick={() => navigate(`/profile/${member.id}`)}
                    >
                      {member.name}
                    </p>
                    <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>
                      <span className="flex items-center gap-1"><Icon name={lvl.icon as IconName} size={14} color="currentColor" />{lvl.name}</span>
                    </p>
                  </div>
                </div>

                {/* Stats */}
                <div className="text-right shrink-0">
                  <p className="font-geist text-sm font-semibold" style={{ color: ACCENT }}>
                    {member.avgScore}%
                  </p>
                  <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>средний балл</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-3">
                <div className="xp-bar-track flex-1">
                  <div className="xp-bar-fill" style={{ width: `${progPct}%` }} />
                </div>
                <span className="font-geist text-xs shrink-0" style={{ minWidth: 80, textAlign: 'right', color: TEXT_MUTED }}>
                  {member.lecturesCompleted}/10 лекций
                </span>
              </div>

              {/* Skill growth */}
              <div className="flex items-center justify-between mt-3 pt-3"
                style={{ borderTop: '1px solid rgba(197, 198, 199, 0.12)' }}
              >
                <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>
                  {member.daysInactive < 999
                    ? `Активность: ${member.daysInactive === 0 ? 'сегодня' : `${member.daysInactive} дн назад`}`
                    : 'Активность: —'}
                </p>
                <p className="font-geist text-xs font-semibold" style={{ color: ACCENT }}>
                  рост: +{member.skillGrowth}
                </p>
              </div>

              {/* Soft anti-cheat signals — never an accusation, just a
                  "might be worth a look" flag for a lead to interpret. */}
              {(member.fastAnswers > 0 || member.tabSwitches > 0) && (
                <p className="font-geist text-xs mt-2" style={{ color: BADGE_NOTIFY }}>
                  {member.fastAnswers > 0 && `⚡ ${member.fastAnswers} слишком быстрых ответов`}
                  {member.fastAnswers > 0 && member.tabSwitches > 0 && ' · '}
                  {member.tabSwitches > 0 && `↔ ${member.tabSwitches} переключений вкладки во время тестов`}
                </p>
              )}

              {/* Task-type breakdown — same data the tester sees about
                  themselves in "Моя нора", surfaced here so a lead can
                  tell at a glance who's handling which kind of work. */}
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(197, 198, 199, 0.12)' }}>
                <p className="font-geist text-xs uppercase mb-2" style={{ color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>Задачи</p>
                {(member.taskCounts ?? []).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(member.taskCounts ?? []).map(tc => (
                      <span
                        key={tc.name}
                        className="font-geist text-xs px-2 py-1 rounded"
                        style={{ background: `${tc.color}20`, color: tc.color }}
                      >
                        {tc.name}: {tc.count}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>
                    Пока не {member.gender === 'female' ? 'отправляла' : member.gender === 'male' ? 'отправлял' : 'отправлял(а)'} чек-листы
                  </p>
                )}
              </div>

              {/* Private lead notes — free-text characteristics, never
                  shown to the tester themselves (see /api/lead/team). */}
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(197, 198, 199, 0.12)' }}>
                <p className="font-geist text-xs uppercase mb-2" style={{ color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>Заметки (видно только лиду/админу)</p>
                <textarea
                  className="pixel-input w-full font-geist text-xs"
                  style={{ minHeight: 56 }}
                  value={noteValue(member)}
                  onChange={e => setNoteDrafts(d => ({ ...d, [member.id]: e.target.value }))}
                  placeholder="Например: сильна в вёрстке, можно доверять сложные вайты; иногда путает статусы задач..."
                  maxLength={2000}
                />
                {noteValue(member) !== (member.lead_note ?? '') && (
                  <button
                    onClick={() => saveNote(member.id)}
                    disabled={savingNoteId === member.id}
                    className="btn-secondary text-xs px-3 py-1 mt-1.5 flex items-center gap-1.5"
                  >
                    {savingNoteId === member.id ? '...' : <><Icon name="floppy" size={13} color="currentColor" /> Сохранить заметку</>}
                  </button>
                )}
              </div>

              {/* Scoped permissions — точечный доступ к разделам без
                  полной смены роли. Отмеченный чекбокс = выдано. */}
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(197, 198, 199, 0.12)' }}>
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  {ALL_PERMISSIONS.map(perm => {
                    const grant = grants.find(g => g.user_id === member.id && g.permission === perm);
                    return (
                      <label key={perm} className="flex items-center gap-1.5 font-geist text-xs cursor-pointer" style={{ color: grant ? ACCENT : TEXT_MUTED }}>
                        <input
                          type="checkbox"
                          checked={!!grant}
                          onChange={() => togglePermission(member.id, perm, grant?.id ?? null)}
                        />
                        {PERMISSION_LABELS[perm]}
                        {grant?.expires_at && ` (до ${parseServerDate(grant.expires_at).toLocaleDateString('ru-RU')})`}
                        {grant && grant.granted_by_role && grant.granted_by_role !== 'lead' && grant.granted_by_role !== 'admin' && (
                          <span
                            title={`Выдал(а) ${grant.granted_by_name ?? 'сотрудник'}, который(ая) больше не лид/админ — стоит перепроверить`}
                            style={{ color: BADGE_NOTIFY }}
                          >
                            ⚠
                          </span>
                        )}
                      </label>
                    );
                  })}
                  <select
                    className="pixel-input text-xs"
                    style={{ width: 150 }}
                    value={expiryByMember[member.id] || 'never'}
                    onChange={e => setExpiryByMember(m => ({ ...m, [member.id]: e.target.value }))}
                    title="Срок действия для следующей выдачи прав"
                  >
                    <option value="never">Без срока</option>
                    <option value="24h">На 24 часа</option>
                    <option value="7d">На 7 дней</option>
                    <option value="30d">На 30 дней</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => resetPassword(member.id)}
                    disabled={resettingId === member.id}
                    className="btn-secondary text-xs px-3 py-1 flex items-center gap-1.5"
                  >
                    <Icon name="key" size={13} color="currentColor" /> {resettingId === member.id ? '...' : 'Сбросить пароль'}
                  </button>
                  <button onClick={() => setBonusTarget({ id: member.id, name: member.name })} className="btn-secondary text-xs px-3 py-1 flex items-center gap-1.5">
                    <Icon name="trophy" size={13} color="currentColor" /> Премия
                  </button>
                  <button
                    onClick={() => archiveMember(member.id, member.name)}
                    disabled={archivingId === member.id}
                    className="btn-secondary text-xs px-3 py-1 flex items-center gap-1.5"
                    style={{ color: '#e05252' }}
                  >
                    <Icon name="archive" size={13} color="currentColor" /> {archivingId === member.id ? '...' : 'Архивировать'}
                  </button>
                  {resetResult?.id === member.id && (
                    <span className="font-geist text-xs" style={{ color: TEXT_MUTED }}>{resetResult.message}</span>
                  )}
                  {bonusResult?.id === member.id && (
                    <span className="font-geist text-xs flex items-center gap-1" style={{ color: ACCENT }}>
                      <Icon name="trophy" size={12} color="currentColor" /> {bonusResult.message}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {archived.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowArchived(p => !p)}
            className="font-geist text-xs cursor-pointer flex items-center gap-1"
            style={{ color: TEXT_MUTED }}
          >
            <Icon name={showArchived ? 'chevronDown' : 'chevronRight'} size={14} color="currentColor" /> Архив ({archived.length})
          </button>
          {showArchived && (
            <div className="space-y-1.5 mt-2">
              {archived.map(a => (
                <div key={a.id} className="p-2.5 rounded-lg flex items-center justify-between gap-3" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.12)' }}>
                  <span className="font-geist text-sm" style={{ color: TEXT_PRIMARY }}>{a.name}</span>
                  <span className="font-geist text-xs" style={{ color: TEXT_MUTED }}>
                    {a.gender === 'female' ? 'архивирована' : a.gender === 'male' ? 'архивирован' : 'архивирован(а)'} {parseServerDate(a.archived_at).toLocaleDateString('ru-RU')}
                  </span>
                  <button
                    onClick={() => restoreMember(a.id)}
                    disabled={archivingId === a.id}
                    className="btn-secondary text-xs px-3 py-1 flex items-center gap-1.5"
                  >
                    <Icon name="undo" size={13} color="currentColor" /> {archivingId === a.id ? '...' : 'Восстановить'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
