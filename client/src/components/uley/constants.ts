import type { LeaveType } from '../../types';

export type Tab = 'team' | 'before-after' | 'activity' | 'lectures' | 'ratings';

// Was two native browser prompt() calls back to back — worked, but looked
// broken (an unstyled OS dialog titled with the raw production domain,
// asking for two separate inputs one after another) and gave no real
// feedback beyond a generic alert on failure. A proper modal, matching the
// styling other forms in the app already use.
export const MAX_BONUS_AMOUNT = 500;

export const WEEKDAY_LABELS: [string, string][] = [['1', 'Пн'], ['2', 'Вт'], ['3', 'Ср'], ['4', 'Чт'], ['5', 'Пт'], ['6', 'Сб'], ['7', 'Вс']];
export const LEAVE_LABELS: Record<LeaveType, string> = { vacation: 'Отпуск', sick: 'Больничный', day_off: 'Отгул', other: 'Другое' };

export const PERMISSION_LABELS: Record<string, string> = {
  manage_knowledge_base: 'Багодельня',
  manage_courses: 'Курсы',
  manage_guides: 'Гайды',
};
export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS);
