import { describe, it, expect } from 'vitest';
import { formatActivityAction } from './activity';

describe('formatActivityAction', () => {
  it('translates known simple actions to readable Russian', () => {
    expect(formatActivityAction('login')).toBe('Вошёл(-шла) в систему');
    expect(formatActivityAction('register')).toBe('Зарегистрировался(-лась)');
  });

  it('appends the lecture title for pass/fail when given', () => {
    expect(formatActivityAction('passed_lecture', { lectureTitle: 'HTML basics' }))
      .toBe('Прошёл(шла) лекцию «HTML basics»');
    expect(formatActivityAction('failed_lecture')).toBe('Не прошёл(шла) лекцию');
  });

  it('parses permission_granted/revoked into a readable sentence, resolving the target name when known', () => {
    expect(formatActivityAction('permission_granted:target=4:permission=manage_checklists', {
      nameById: { 4: 'Nazariy Tester' },
    })).toBe('Выдал(а) право «Чек-листы» сотруднику Nazariy Tester');

    expect(formatActivityAction('permission_revoked:target=4:permission=manage_checklists'))
      .toBe('Забрал(а) право «Чек-листы» у сотрудника #4');
  });

  it('parses archive/restore/reset-password/role-change actions', () => {
    expect(formatActivityAction('user_archived:target=7')).toBe('Архивировал(а) сотрудника #7');
    expect(formatActivityAction('user_restored:target=7')).toBe('Восстановил(а) сотрудника #7');
    expect(formatActivityAction('password_reset:target=7')).toBe('Сбросил(а) пароль сотруднику #7');
    expect(formatActivityAction('admin_role_change:target=7:new_role=lead'))
      .toBe('Изменил(а) роль сотрудника #7 на «Тимлид»');
  });

  it('falls back to the raw string for a genuinely unknown action, instead of hiding it', () => {
    expect(formatActivityAction('some_future_action:whatever')).toBe('some_future_action:whatever');
  });
});
