// Turns a raw activity_log action string (e.g.
// "permission_granted:target=4:permission=manage_checklists") into a
// readable Russian sentence. Server-side action strings are a compact,
// grep-able audit-log format (see server/src/app.js) — never meant to be
// shown to a user as-is, but several feeds (ProfilePage's "Моя активность",
// UleyPage's "Лягушачье болото", AdminPage's activity log) did exactly that, or
// hedged the verb ending with a "(-а)" hack, before this existed.

import { Gender, TeamNewsItem } from '../types';
import { pickByGender } from './gender';

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

interface FormatOptions {
  lectureTitle?: string | null;
  courseTitle?: string | null;
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
  // Shorthand bound to this call's gender — every phrase below supplies its
  // own masculine/feminine/neutral triplet; the neutral form is a real
  // sentence (usually passive/impersonal), never a slash or "(-а)" hedge.
  const pick = (m: string, f: string, n: string) => pickByGender(g, m, f, n);

  switch (action) {
    case 'login': return pick('Вошёл в систему', 'Вошла в систему', 'Выполнен вход в систему');
    case 'register': return pick('Зарегистрировался', 'Зарегистрировалась', 'Регистрация в системе');
    case 'completed_baseline': return pick('Заполнил анкету "до"', 'Заполнила анкету "до"', 'Анкета "до" заполнена');
    case 'passed_lecture': {
      const title = opts.lectureTitle ? ` «${opts.lectureTitle}»` : '';
      return pick(`Прошёл лекцию${title}`, `Прошла лекцию${title}`, `Лекция${title} пройдена`);
    }
    case 'failed_lecture': {
      const title = opts.lectureTitle ? ` «${opts.lectureTitle}»` : '';
      return pick(`Не прошёл лекцию${title}`, `Не прошла лекцию${title}`, `Лекция${title} не пройдена`);
    }
    case 'course_completed': {
      const title = opts.courseTitle ? ` «${opts.courseTitle}»` : '';
      return pick(`Прошёл курс${title}`, `Прошла курс${title}`, `Курс${title} пройден`);
    }
  }

  let m: RegExpMatchArray | null;

  if ((m = action.match(/^permission_granted:target=(\d+):permission=(.+)$/))) {
    const label = PERMISSION_LABELS[m[2]] || m[2];
    const target = who(m[1]);
    return pick(`Выдал право «${label}» сотруднику ${target}`, `Выдала право «${label}» сотруднику ${target}`, `Право «${label}» выдано сотруднику ${target}`);
  }
  if ((m = action.match(/^permission_revoked:target=(\d+):permission=(.+)$/))) {
    const label = PERMISSION_LABELS[m[2]] || m[2];
    const target = who(m[1]);
    return pick(`Забрал право «${label}» у сотрудника ${target}`, `Забрала право «${label}» у сотрудника ${target}`, `Право «${label}» забрано у сотрудника ${target}`);
  }
  if ((m = action.match(/^user_archived:target=(\d+)$/))) {
    const target = who(m[1]);
    return pick(`Архивировал сотрудника ${target}`, `Архивировала сотрудника ${target}`, `Сотрудник ${target} перемещён в архив`);
  }
  if ((m = action.match(/^user_restored:target=(\d+)$/))) {
    const target = who(m[1]);
    return pick(`Восстановил сотрудника ${target}`, `Восстановила сотрудника ${target}`, `Сотрудник ${target} восстановлен из архива`);
  }
  if ((m = action.match(/^password_reset:target=(\d+)$/))) {
    const target = who(m[1]);
    return pick(`Сбросил пароль сотруднику ${target}`, `Сбросила пароль сотруднику ${target}`, `Пароль сотрудника ${target} сброшен`);
  }
  if ((m = action.match(/^admin_role_change:target=(\d+):new_role=(.+)$/))) {
    const target = who(m[1]);
    const role = ROLE_LABELS[m[2]] || m[2];
    return pick(`Изменил роль сотрудника ${target} на «${role}»`, `Изменила роль сотрудника ${target} на «${role}»`, `Роль сотрудника ${target} изменена на «${role}»`);
  }
  if (action.match(/^checklist_submitted:/)) {
    return pick('Отправил чек-лист', 'Отправила чек-лист', 'Чек-лист отправлен');
  }
  if ((m = action.match(/^crafted_badge:(.+)$/))) {
    return pick(`Скрафтил значок «${m[1]}»`, `Скрафтила значок «${m[1]}»`, `Получен значок «${m[1]}»`);
  }
  // A few actions logged by non-activity routes (see server/src/app.js) —
  // covering these here too so AdminPage's full log (which shows every
  // action, not just the common ones) doesn't fall back to a raw string.
  switch (action) {
    case 'register_telegram': return pick('Зарегистрировался через Telegram', 'Зарегистрировалась через Telegram', 'Регистрация через Telegram');
    case 'login_telegram': return pick('Вошёл через Telegram', 'Вошла через Telegram', 'Вход через Telegram');
    case 'password_changed': return pick('Сменил пароль', 'Сменила пароль', 'Пароль изменён');
    case 'password_reset_self_service': return pick('Сбросил пароль через восстановление', 'Сбросила пароль через восстановление', 'Пароль сброшен через восстановление');
  }

  // Unknown action — show it plainly rather than hiding it silently, so a
  // future new action type is at least visible (if ugly) instead of vanishing.
  return action;
}

const LEAVE_TYPE_LABELS: Record<string, { label: string; neuter?: boolean }> = {
  vacation: { label: 'отпуск' },
  sick: { label: 'больничный' },
  day_off: { label: 'отгул' },
  other: { label: 'отсутствие', neuter: true },
};

// Team news feed items (GET /api/team/news) have a genuinely different shape
// from activity_log rows (event_type + optional guide/course/leave fields,
// no free-text action string to parse) — a sibling formatter rather than
// another branch in formatActivityAction above.
export function formatTeamEvent(item: TeamNewsItem): string {
  const g = item.gender;
  const pick = (m: string, f: string, n: string) => pickByGender(g, m, f, n);

  switch (item.event_type) {
    // A lead's own post is already a sentence — the only event type whose
    // text is written rather than derived.
    case 'announcement':
      return item.text || '';
    case 'member_joined':
      return pick(`${item.name} присоединился к команде`, `${item.name} присоединилась к команде`, `${item.name} — новый участник команды`);
    case 'guide_published': {
      const title = item.guide_title ? ` «${item.guide_title}»` : '';
      return pick(`${item.name} опубликовал гайд${title}`, `${item.name} опубликовала гайд${title}`, `Новый гайд${title} — ${item.name}`);
    }
    case 'course_published': {
      const title = item.course_title ? ` «${item.course_title}»` : '';
      return pick(`${item.name} опубликовал курс${title}`, `${item.name} опубликовала курс${title}`, `Новый курс${title} — ${item.name}`);
    }
    case 'lecture_video_added':
      return `Добавлено видео к лекции${item.lecture_title ? ` «${item.lecture_title}»` : ''}`;
    case 'birthday':
      return `У ${item.name} сегодня день рождения 🎂`;
    case 'leave_started': {
      // Neutral form agrees with the LEAVE noun's own grammatical gender
      // (отпуск/больничный/отгул are masculine, отсутствие is neuter), not
      // the person's — "У Насти начался отпуск" never needed Настя's
      // gender in the first place, so this reads naturally either way.
      const leave = LEAVE_TYPE_LABELS[item.leave_type || 'other'];
      const started = leave.neuter ? 'началось' : 'начался';
      return pick(`${item.name} ушёл в ${leave.label}`, `${item.name} ушла в ${leave.label}`, `У ${item.name} ${started} ${leave.label}`);
    }
    case 'leave_ended':
      return pick(`${item.name} вернулся из отпуска`, `${item.name} вернулась из отпуска`, `${item.name}: возвращение из отпуска`);
    default:
      return item.event_type;
  }
}
