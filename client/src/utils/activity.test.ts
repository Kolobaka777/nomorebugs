import { describe, it, expect } from 'vitest';
import { formatActivityAction, formatTeamEvent } from './activity';

describe('formatActivityAction', () => {
  // A slash form ("Вошёл/Вошла") used to be the unknown-gender fallback —
  // replaced with a real neutral (usually passive) sentence, since nobody
  // actually writes "Вошёл/Вошла в систему" as a sentence.
  it('falls back to a neutral phrasing when gender is unknown', () => {
    expect(formatActivityAction('login')).toBe('Выполнен вход в систему');
    expect(formatActivityAction('register')).toBe('Регистрация в системе');
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

  it('embeds the course title for course_completed when given, falls back to a bare "курс" without it', () => {
    expect(formatActivityAction('course_completed', { gender: 'female', courseTitle: 'Playwright Basics' }))
      .toBe('Прошла курс «Playwright Basics»');
    expect(formatActivityAction('course_completed', { gender: 'male' })).toBe('Прошёл курс');
  });

  it('parses permission_granted/revoked into a readable sentence, resolving the target name when known', () => {
    expect(formatActivityAction('permission_granted:target=4:permission=manage_checklists', {
      gender: 'female',
      nameById: { 4: 'Nazariy Tester' },
    })).toBe('Выдала право «Чек-листы» сотруднику Nazariy Tester');

    expect(formatActivityAction('permission_revoked:target=4:permission=manage_checklists'))
      .toBe('Право «Чек-листы» забрано у сотрудника #4');
  });

  it('parses archive/restore/reset-password/role-change actions', () => {
    expect(formatActivityAction('user_archived:target=7', { gender: 'male' })).toBe('Архивировал сотрудника #7');
    expect(formatActivityAction('user_restored:target=7', { gender: 'female' })).toBe('Восстановила сотрудника #7');
    expect(formatActivityAction('password_reset:target=7')).toBe('Пароль сотрудника #7 сброшен');
    expect(formatActivityAction('admin_role_change:target=7:new_role=lead', { gender: 'male' }))
      .toBe('Изменил роль сотрудника #7 на «Тимлид»');
  });

  it('handles the telegram/password-self-service actions previously only covered by AdminPage\'s own map', () => {
    expect(formatActivityAction('register_telegram', { gender: 'male' })).toBe('Зарегистрировался через Telegram');
    expect(formatActivityAction('login_telegram', { gender: 'female' })).toBe('Вошла через Telegram');
    expect(formatActivityAction('password_changed', { gender: 'male' })).toBe('Сменил пароль');
    expect(formatActivityAction('password_reset_self_service')).toBe('Пароль сброшен через восстановление');
  });

  it('falls back to the raw string for a genuinely unknown action, instead of hiding it', () => {
    expect(formatActivityAction('some_future_action:whatever')).toBe('some_future_action:whatever');
  });
});

describe('formatTeamEvent', () => {
  const base = { id: 1, created_at: '2026-01-01T00:00:00Z', user_id: 5, name: 'Nazariy', avatar_initials: 'NT' };

  it('formats member_joined with gender-correct participle', () => {
    expect(formatTeamEvent({ ...base, event_type: 'member_joined', gender: 'male' }))
      .toBe('Nazariy присоединился к команде');
    expect(formatTeamEvent({ ...base, event_type: 'member_joined', gender: 'female' }))
      .toBe('Nazariy присоединилась к команде');
    expect(formatTeamEvent({ ...base, event_type: 'member_joined', gender: null }))
      .toBe('Nazariy — новый участник команды');
  });

  it('embeds the guide/course title when present', () => {
    expect(formatTeamEvent({ ...base, event_type: 'guide_published', gender: 'male', guide_title: 'DevTools 101' }))
      .toBe('Nazariy опубликовал гайд «DevTools 101»');
    expect(formatTeamEvent({ ...base, event_type: 'course_published', gender: 'female', course_title: 'CSS Basics' }))
      .toBe('Nazariy опубликовала курс «CSS Basics»');
  });

  it('formats lecture_video_added without needing gender, embedding the lecture title', () => {
    expect(formatTeamEvent({ ...base, event_type: 'lecture_video_added', gender: null, lecture_title: 'HTML basics' }))
      .toBe('Добавлено видео к лекции «HTML basics»');
    expect(formatTeamEvent({ ...base, event_type: 'lecture_video_added', gender: null }))
      .toBe('Добавлено видео к лекции');
  });

  it('formats a birthday item without needing gender', () => {
    expect(formatTeamEvent({ ...base, event_type: 'birthday', gender: null })).toBe('У Nazariy сегодня день рождения 🎂');
  });

  it('formats leave start/end with the leave type and gendered verb', () => {
    expect(formatTeamEvent({ ...base, event_type: 'leave_started', gender: 'male', leave_type: 'vacation' }))
      .toBe('Nazariy ушёл в отпуск');
    expect(formatTeamEvent({ ...base, event_type: 'leave_ended', gender: 'female' }))
      .toBe('Nazariy вернулась из отпуска');
  });

  it('leave_started neutral fallback agrees with the LEAVE noun\'s own gender, not the person\'s', () => {
    // отпуск/больничный/отгул are grammatically masculine nouns -> "начался"
    expect(formatTeamEvent({ ...base, event_type: 'leave_started', gender: null, leave_type: 'vacation' }))
      .toBe('У Nazariy начался отпуск');
    expect(formatTeamEvent({ ...base, event_type: 'leave_started', gender: null, leave_type: 'sick' }))
      .toBe('У Nazariy начался больничный');
    // отсутствие is neuter -> "началось"
    expect(formatTeamEvent({ ...base, event_type: 'leave_started', gender: null, leave_type: 'other' }))
      .toBe('У Nazariy началось отсутствие');
  });

  it('guide/course_published and leave_ended fall back to neutral noun phrasing when gender is unknown', () => {
    expect(formatTeamEvent({ ...base, event_type: 'guide_published', gender: null, guide_title: 'DevTools 101' }))
      .toBe('Новый гайд «DevTools 101» — Nazariy');
    expect(formatTeamEvent({ ...base, event_type: 'course_published', gender: null }))
      .toBe('Новый курс — Nazariy');
    expect(formatTeamEvent({ ...base, event_type: 'leave_ended', gender: null }))
      .toBe('Nazariy: возвращение из отпуска');
  });
});
