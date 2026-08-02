// Turns a raw activity_log action string (e.g.
// "permission_granted:target=4:permission=manage_checklists") into a
// readable Russian sentence. Server-side action strings are a compact,
// grep-able audit-log format (see server/src/app.js) — never meant to be
// shown to a user as-is, but several feeds (ProfilePage's "Моя активность",
// UleyPage's "Жучиная нора", AdminPage's activity log) did exactly that, or
// hedged the verb ending with a "(-а)" hack, before this existed.

import { Gender, TeamNewsItem } from '../types';

const PERMISSION_LABELS: Record<string, string> = {
  manage_knowledge_base: 'Багодельня',
  manage_courses: 'Курсы',
  manage_checklists: 'Чек-листы',
  manage_guides: 'Гайды',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Админ',
  lead: 'Тимлид',
  tester: 'Тестировщик',
};

// Picks the grammatically correct participle when the actor's gender is
// known; otherwise falls back to "Masc/Fem" rather than a suffix hack —
// most of these verbs are irregular (прошёл→прошла, not "прошёл(-а)"), so a
// real fallback needs both full forms, not a stitched-together guess.
function verb(masculine: string, feminine: string, gender: Gender | undefined): string {
  if (gender === 'male') return masculine;
  if (gender === 'female') return feminine;
  return `${masculine}/${feminine}`;
}

interface FormatOptions {
  lectureTitle?: string | null;
  // Best-effort id → name lookup (e.g. from a team roster already loaded on
  // the page) for actions that reference a target user by id — falls back
  // to "#id" when the id isn't in the map (still far better than the raw
  // action string).
  nameById?: Record<number, string>;
  // Gender of whoever performed *this specific* action — resolve per-row
  // from wherever the caller has it (team roster, the viewed profile's own
  // gender, etc.), not a single fixed value for the whole feed.
  gender?: Gender;
}

export function formatActivityAction(action: string, opts: FormatOptions = {}): string {
  const who = (id: string) => opts.nameById?.[Number(id)] || `#${id}`;
  const g = opts.gender;

  switch (action) {
    case 'login': return `${verb('Вошёл', 'Вошла', g)} в систему`;
    case 'register': return verb('Зарегистрировался', 'Зарегистрировалась', g);
    case 'completed_baseline': return `${verb('Заполнил', 'Заполнила', g)} анкету "до"`;
    case 'passed_lecture': return `${verb('Прошёл', 'Прошла', g)} лекцию${opts.lectureTitle ? ` «${opts.lectureTitle}»` : ''}`;
    case 'failed_lecture': return `${verb('Не прошёл', 'Не прошла', g)} лекцию${opts.lectureTitle ? ` «${opts.lectureTitle}»` : ''}`;
    case 'course_completed': return `${verb('Прошёл', 'Прошла', g)} курс`;
  }

  let m: RegExpMatchArray | null;

  if ((m = action.match(/^permission_granted:target=(\d+):permission=(.+)$/))) {
    return `${verb('Выдал', 'Выдала', g)} право «${PERMISSION_LABELS[m[2]] || m[2]}» сотруднику ${who(m[1])}`;
  }
  if ((m = action.match(/^permission_revoked:target=(\d+):permission=(.+)$/))) {
    return `${verb('Забрал', 'Забрала', g)} право «${PERMISSION_LABELS[m[2]] || m[2]}» у сотрудника ${who(m[1])}`;
  }
  if ((m = action.match(/^user_archived:target=(\d+)$/))) {
    return `${verb('Архивировал', 'Архивировала', g)} сотрудника ${who(m[1])}`;
  }
  if ((m = action.match(/^user_restored:target=(\d+)$/))) {
    return `${verb('Восстановил', 'Восстановила', g)} сотрудника ${who(m[1])}`;
  }
  if ((m = action.match(/^password_reset:target=(\d+)$/))) {
    return `${verb('Сбросил', 'Сбросила', g)} пароль сотруднику ${who(m[1])}`;
  }
  if ((m = action.match(/^admin_role_change:target=(\d+):new_role=(.+)$/))) {
    return `${verb('Изменил', 'Изменила', g)} роль сотрудника ${who(m[1])} на «${ROLE_LABELS[m[2]] || m[2]}»`;
  }
  if (action.match(/^checklist_submitted:/)) {
    return `${verb('Отправил', 'Отправила', g)} чек-лист`;
  }
  if ((m = action.match(/^crafted_badge:(.+)$/))) {
    return `${verb('Скрафтил', 'Скрафтила', g)} значок «${m[1]}»`;
  }
  // A few actions logged by non-activity routes (see server/src/app.js) —
  // covering these here too so AdminPage's full log (which shows every
  // action, not just the common ones) doesn't fall back to a raw string.
  switch (action) {
    case 'register_telegram': return `${verb('Зарегистрировался', 'Зарегистрировалась', g)} через Telegram`;
    case 'login_telegram': return `${verb('Вошёл', 'Вошла', g)} через Telegram`;
    case 'password_changed': return `${verb('Сменил', 'Сменила', g)} пароль`;
    case 'password_reset_self_service': return `${verb('Сбросил', 'Сбросила', g)} пароль через восстановление`;
  }

  // Unknown action — show it plainly rather than hiding it silently, so a
  // future new action type is at least visible (if ugly) instead of vanishing.
  return action;
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  vacation: 'отпуск', sick: 'больничный', day_off: 'отгул', other: 'отсутствие',
};

// Team news feed items (GET /api/team/news) have a genuinely different shape
// from activity_log rows (event_type + optional guide/course/leave fields,
// no free-text action string to parse) — a sibling formatter rather than
// another branch in formatActivityAction above.
export function formatTeamEvent(item: TeamNewsItem): string {
  const g = item.gender;
  switch (item.event_type) {
    case 'member_joined': return `${item.name} ${verb('присоединился', 'присоединилась', g)} к команде`;
    case 'guide_published': return `${item.name} ${verb('опубликовал', 'опубликовала', g)} гайд${item.guide_title ? ` «${item.guide_title}»` : ''}`;
    case 'course_published': return `${item.name} ${verb('опубликовал', 'опубликовала', g)} курс${item.course_title ? ` «${item.course_title}»` : ''}`;
    case 'birthday': return `У ${item.name} сегодня день рождения 🎂`;
    case 'leave_started': return `${item.name} ${verb('ушёл', 'ушла', g)} в ${LEAVE_TYPE_LABELS[item.leave_type || 'other']}`;
    case 'leave_ended': return `${item.name} ${verb('вернулся', 'вернулась', g)} из отпуска`;
    default: return item.event_type;
  }
}
