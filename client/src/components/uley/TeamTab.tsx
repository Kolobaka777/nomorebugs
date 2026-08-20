import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../Icon';
import Modal from '../Modal';
import { TeamMember, PresenceEntry } from '../../types';
import { parseServerDate } from '../../utils/date';
import { pickByGender } from '../../utils/gender';
import { parseRichContent, richContentToPlainText } from '../../utils/richContent';
import { ALL_PERMISSIONS, LEAVE_LABELS, PERMISSION_LABELS } from './constants';
import { ACCENT, BADGE_NOTIFY, CARD_BG, CARD_SHADOW, PAGE_BG, TEXT_PRIMARY, TEXT_MUTED, TRACK_WIDE, ERROR } from '../../utils/theme';

// Same lazy-split reasoning as GuidesPage.tsx.
const RichTextEditor = lazy(() => import('../RichTextEditor'));

function RichTextEditorFallback() {
  return (
    <div className="flex items-center justify-center py-6">
      <div className="pixel-pulse font-geist text-xs" style={{ color: TEXT_MUTED }}>загружаю редактор...</div>
    </div>
  );
}

interface ArchivedMember { id: number; name: string; avatar_initials: string; archived_at: string; gender?: 'male' | 'female' | null }
interface Grant { id: number; user_id: number; permission: string; expires_at: string | null; granted_by_name?: string; granted_by_role?: string; granted_by_gender?: 'male' | 'female' | null }

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
  // Which member's note modal is open, if any — the note itself now needs
  // the full RichTextEditor toolbar, too heavy to mount once per row in a
  // team list that can run to dozens of testers, so it opens in a modal
  // instead of inline (unlike the old always-visible per-row textarea).
  const [editingNoteFor, setEditingNoteFor] = useState<TeamMember | null>(null);

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
                    <span className="min-w-0">
                      <span className="block font-geist text-xs font-semibold break-words" style={{ color: TEXT_PRIMARY }}>{p.name}</span>
                      <span className="block font-geist break-words" style={{ fontSize: 11, color: TEXT_MUTED }}>{subtitle}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {team.map(member => {
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
                  <div className="min-w-0">
                    <p
                      className="font-geist font-semibold text-sm cursor-pointer hover:underline break-words"
                      style={{ color: TEXT_PRIMARY }}
                      onClick={() => navigate(`/profile/${member.id}`)}
                    >
                      {member.name}
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
                  {member.fastAnswers > 0 && <><Icon name="lightning" size={13} color="currentColor" /> {member.fastAnswers} слишком быстрых ответов</>}
                  {member.fastAnswers > 0 && member.tabSwitches > 0 && ' · '}
                  {member.tabSwitches > 0 && `${member.tabSwitches} переключений вкладки во время тестов`}
                </p>
              )}

              {/* Private lead notes — free-text characteristics, never
                  shown to the tester themselves (see /api/lead/team). Full
                  editor lives in a modal (below); the row itself only
                  shows a plain-text preview — see editingNoteFor above. */}
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(197, 198, 199, 0.12)' }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="font-geist text-xs uppercase" style={{ color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>Заметки (видно только лиду/админу)</p>
                  <button
                    onClick={() => setEditingNoteFor(member)}
                    className="text-xs font-geist cursor-pointer flex items-center gap-1 shrink-0"
                    style={{ color: ACCENT }}
                  >
                    <Icon name="pencil" size={12} color="currentColor" /> {member.lead_note ? 'Редактировать' : 'Добавить'}
                  </button>
                </div>
                <p className="font-geist text-xs break-words" style={{ color: member.lead_note ? 'rgba(197, 198, 199,0.7)' : 'rgba(197, 198, 199,0.4)' }}>
                  {member.lead_note ? richContentToPlainText(member.lead_note).slice(0, 140) || '(пусто)' : 'Заметок пока нет'}
                </p>
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
                            title={pickByGender(
                              grant.granted_by_gender,
                              `Выдал ${grant.granted_by_name ?? 'сотрудник'}, который больше не лид/админ — стоит перепроверить`,
                              `Выдала ${grant.granted_by_name ?? 'сотрудник'}, которая больше не лид/админ — стоит перепроверить`,
                              `Выдано сотрудником ${grant.granted_by_name ?? ''}, который больше не лид/админ — стоит перепроверить`
                            )}
                            style={{ color: BADGE_NOTIFY }}
                          >
                            <Icon name="warning" size={14} color="currentColor" />
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
                    style={{ color: ERROR }}
                  >
                    <Icon name="archive" size={13} color="currentColor" /> {archivingId === member.id ? '...' : 'Архивировать'}
                  </button>
                  {resetResult?.id === member.id && (
                    <span className="font-geist text-xs break-words min-w-0" style={{ color: TEXT_MUTED }}>{resetResult.message}</span>
                  )}
                  {bonusResult?.id === member.id && (
                    <span className="font-geist text-xs flex items-center gap-1" style={{ color: ACCENT }}>
                      <Icon name="trophy" size={12} color="currentColor" /> <span className="break-words min-w-0">{bonusResult.message}</span>
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
                  <span className="font-geist text-sm break-words min-w-0" style={{ color: TEXT_PRIMARY }}>{a.name}</span>
                  <span className="font-geist text-xs" style={{ color: TEXT_MUTED }}>
                    {pickByGender(a.gender, 'Архивирован', 'Архивирована', 'В архиве с')} {parseServerDate(a.archived_at).toLocaleDateString('ru-RU')}
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

      {editingNoteFor && (
        <Modal title={`Заметка: ${editingNoteFor.name}`} onClose={() => setEditingNoteFor(null)} maxWidth={640}>
          <Suspense fallback={<RichTextEditorFallback />}>
            <RichTextEditor
              content={parseRichContent(noteValue(editingNoteFor))}
              editable
              onChangeJSON={json => setNoteDrafts(d => ({ ...d, [editingNoteFor.id]: json }))}
              placeholder="Например: сильна в вёрстке, можно доверять сложные вайты; иногда путает статусы задач..."
            />
          </Suspense>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => { saveNote(editingNoteFor.id); setEditingNoteFor(null); }}
              disabled={savingNoteId === editingNoteFor.id}
              className="btn-primary text-xs px-4 py-2 disabled:opacity-50"
            >
              {savingNoteId === editingNoteFor.id ? '...' : 'Сохранить'}
            </button>
            <button onClick={() => setEditingNoteFor(null)} className="btn-secondary text-xs px-4 py-2">Отмена</button>
          </div>
        </Modal>
      )}
    </>
  );
}
