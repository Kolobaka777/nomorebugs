import { describe, it, expect } from 'vitest';
import { formatActivityAction } from './activity';

describe('formatActivityAction', () => {
  it('falls back to a masc/fem slash form when gender is unknown', () => {
    expect(formatActivityAction('login')).toBe('Вошёл/Вошла в систему');
    expect(formatActivityAction('register')).toBe('Зарегистрировался/Зарегистрировалась');
  });

  it('uses the correct participle when gender is known', () => {
    expect(formatActivityAction('login', { gender: 'male' })).toBe('Вошёл в систему');
    expect(formatActivityAction('login', { gender: 'female' })).toBe('Вошла в систему');
    expect(formatActivityAction('passed_lecture', { gender: 'female', lectureTitle: 'HTML basics' }))
      .toBe('Прошла лекцию «HTML basics»');
  });

  it('appends the lecture title for pass/fail when given', () => {
    expect(formatActivityAction('passed_lecture', { gender: 'male', lectureTitle: 'HTML basics' }))
      .toBe('Прошёл лекцию «HTML basics»');
    expect(formatActivityAction('failed_lecture', { gender: 'male' })).toBe('Не прошёл лекцию');
  });

  it('parses permission_granted/revoked into a readable sentence, resolving the target name when known', () => {
    expect(formatActivityAction('permission_granted:target=4:permission=manage_checklists', {
      gender: 'female',
      nameById: { 4: 'Nazariy Tester' },
    })).toBe('Выдала право «Чек-листы» сотруднику Nazariy Tester');

    expect(formatActivityAction('permission_revoked:target=4:permission=manage_checklists'))
      .toBe('Забрал/Забрала право «Чек-листы» у сотрудника #4');
  });

  it('parses archive/restore/reset-password/role-change actions', () => {
    expect(formatActivityAction('user_archived:target=7', { gender: 'male' })).toBe('Архивировал сотрудника #7');
    expect(formatActivityAction('user_restored:target=7', { gender: 'female' })).toBe('Восстановила сотрудника #7');
    expect(formatActivityAction('password_reset:target=7')).toBe('Сбросил/Сбросила пароль сотруднику #7');
    expect(formatActivityAction('admin_role_change:target=7:new_role=lead', { gender: 'male' }))
      .toBe('Изменил роль сотрудника #7 на «Тимлид»');
  });

  it('handles the telegram/password-self-service actions previously only covered by AdminPage\'s own map', () => {
    expect(formatActivityAction('register_telegram', { gender: 'male' })).toBe('Зарегистрировался через Telegram');
    expect(formatActivityAction('login_telegram', { gender: 'female' })).toBe('Вошла через Telegram');
    expect(formatActivityAction('password_changed', { gender: 'male' })).toBe('Сменил пароль');
    expect(formatActivityAction('password_reset_self_service')).toBe('Сбросил/Сбросила пароль через восстановление');
  });

  it('falls back to the raw string for a genuinely unknown action, instead of hiding it', () => {
    expect(formatActivityAction('some_future_action:whatever')).toBe('some_future_action:whatever');
  });
});
