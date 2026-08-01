// Turns a raw activity_log action string (e.g.
// "permission_granted:target=4:permission=manage_checklists") into a
// readable Russian sentence. Server-side action strings are a compact,
// grep-able audit-log format (see server/src/app.js) — never meant to be
// shown to a user as-is, but several feeds (ProfilePage's "Моя активность",
// UleyPage's "Жучиная нора") did exactly that before this existed.

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
  // Best-effort id → name lookup (e.g. from a team roster already loaded on
  // the page) for actions that reference a target user by id — falls back
  // to "#id" when the id isn't in the map (still far better than the raw
  // action string).
  nameById?: Record<number, string>;
}

export function formatActivityAction(action: string, opts: FormatOptions = {}): string {
  const who = (id: string) => opts.nameById?.[Number(id)] || `#${id}`;

  switch (action) {
    case 'login': return 'Вошёл(-шла) в систему';
    case 'register': return 'Зарегистрировался(-лась)';
    case 'completed_baseline': return 'Заполнил(а) анкету "до"';
    case 'passed_lecture': return `Прошёл(шла) лекцию${opts.lectureTitle ? ` «${opts.lectureTitle}»` : ''}`;
    case 'failed_lecture': return `Не прошёл(шла) лекцию${opts.lectureTitle ? ` «${opts.lectureTitle}»` : ''}`;
    case 'course_completed': return 'Прошёл(шла) курс';
  }

  let m: RegExpMatchArray | null;

  if ((m = action.match(/^permission_granted:target=(\d+):permission=(.+)$/))) {
    return `Выдал(а) право «${PERMISSION_LABELS[m[2]] || m[2]}» сотруднику ${who(m[1])}`;
  }
  if ((m = action.match(/^permission_revoked:target=(\d+):permission=(.+)$/))) {
    return `Забрал(а) право «${PERMISSION_LABELS[m[2]] || m[2]}» у сотрудника ${who(m[1])}`;
  }
  if ((m = action.match(/^user_archived:target=(\d+)$/))) {
    return `Архивировал(а) сотрудника ${who(m[1])}`;
  }
  if ((m = action.match(/^user_restored:target=(\d+)$/))) {
    return `Восстановил(а) сотрудника ${who(m[1])}`;
  }
  if ((m = action.match(/^password_reset:target=(\d+)$/))) {
    return `Сбросил(а) пароль сотруднику ${who(m[1])}`;
  }
  if ((m = action.match(/^admin_role_change:target=(\d+):new_role=(.+)$/))) {
    return `Изменил(а) роль сотрудника ${who(m[1])} на «${ROLE_LABELS[m[2]] || m[2]}»`;
  }
  if (action.match(/^checklist_submitted:/)) {
    return 'Отправил(а) чек-лист';
  }
  if ((m = action.match(/^crafted_badge:(.+)$/))) {
    return `Скрафтил(а) значок «${m[1]}»`;
  }

  // Unknown action — show it plainly rather than hiding it silently, so a
  // future new action type is at least visible (if ugly) instead of vanishing.
  return action;
}
