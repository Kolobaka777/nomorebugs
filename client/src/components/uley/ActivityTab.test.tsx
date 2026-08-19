// The log's filter bar. The component holds no filter state of its own —
// UleyPage owns it and refetches — so what's asserted here is that every
// control reports the right change upward, and that the two empty states
// stay distinguishable.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ActivityTab, { EMPTY_ACTIVITY_FILTERS } from './ActivityTab';
import { ActivityItem, ActivityFilters, TeamMember } from '../../types';

const team = [
  { id: 4, name: 'Назарий', role: 'tester' },
  { id: 5, name: 'Глеб', role: 'tester' },
] as unknown as TeamMember[];

function row(overrides: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: 1,
    action: 'login',
    created_at: '2026-08-19 10:00:00',
    name: 'Назарий',
    category: 'account',
    ...overrides,
  };
}

const onFiltersChange = vi.fn();

function renderTab(activity: ActivityItem[] = [row()], filters: ActivityFilters = EMPTY_ACTIVITY_FILTERS) {
  return render(
    <ActivityTab
      activity={activity}
      activityHasMore={false}
      activityLoading={false}
      loadMoreActivity={vi.fn()}
      teamNameById={{ 4: 'Назарий', 5: 'Глеб' }}
      team={team}
      filters={filters}
      onFiltersChange={onFiltersChange}
    />,
  );
}

beforeEach(() => onFiltersChange.mockClear());

describe('ActivityTab', () => {
  it('reports the category behind a chip', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Контент' }));
    expect(onFiltersChange).toHaveBeenCalledWith({ ...EMPTY_ACTIVITY_FILTERS, category: 'content' });
  });

  it('reports a search term, a person and a date range', () => {
    renderTab();
    fireEvent.change(screen.getByLabelText('Поиск по журналу'), { target: { value: 'премия' } });
    expect(onFiltersChange).toHaveBeenLastCalledWith({ ...EMPTY_ACTIVITY_FILTERS, q: 'премия' });

    fireEvent.change(screen.getByLabelText('Сотрудник'), { target: { value: '5' } });
    expect(onFiltersChange).toHaveBeenLastCalledWith({ ...EMPTY_ACTIVITY_FILTERS, userId: '5' });

    fireEvent.change(screen.getByLabelText('Дата с'), { target: { value: '2026-08-01' } });
    expect(onFiltersChange).toHaveBeenLastCalledWith({ ...EMPTY_ACTIVITY_FILTERS, from: '2026-08-01' });
  });

  it('lists the team in the person filter', () => {
    renderTab();
    const select = screen.getByLabelText('Сотрудник');
    expect(select).toHaveTextContent('Все сотрудники');
    expect(select).toHaveTextContent('Назарий');
    expect(select).toHaveTextContent('Глеб');
  });

  it('offers a reset only once something is filtered', () => {
    const { rerender } = renderTab();
    expect(screen.queryByRole('button', { name: 'Сбросить' })).not.toBeInTheDocument();

    rerender(
      <ActivityTab
        activity={[row()]} activityHasMore={false} activityLoading={false}
        loadMoreActivity={vi.fn()} teamNameById={{}} team={team}
        filters={{ ...EMPTY_ACTIVITY_FILTERS, category: 'admin' }}
        onFiltersChange={onFiltersChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
    expect(onFiltersChange).toHaveBeenCalledWith(EMPTY_ACTIVITY_FILTERS);
  });

  // The distinction that matters: one of these is fixed by changing the
  // filter and the other isn't, and they used to be the same sentence.
  it('says the log is empty, or that the filter matched nothing', () => {
    renderTab([]);
    expect(screen.getByText('Нет активности')).toBeInTheDocument();

    renderTab([], { ...EMPTY_ACTIVITY_FILTERS, q: 'ничего такого' });
    expect(screen.getByText('Под фильтры ничего не подошло')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    expect(onFiltersChange).toHaveBeenCalledWith(EMPTY_ACTIVITY_FILTERS);
  });

  it('reads the new content and security actions as sentences', () => {
    renderTab([
      row({ id: 1, action: 'course_deleted:Основы багрепорта', category: 'content', gender: 'female' }),
      row({ id: 2, action: 'account_locked', category: 'account' }),
      row({ id: 3, action: 'bonus_awarded:target=5:amount=100', category: 'admin' }),
    ]);
    expect(screen.getByText('Удалила курс «Основы багрепорта»')).toBeInTheDocument();
    expect(screen.getByText(/Аккаунт временно заблокирован/)).toBeInTheDocument();
    expect(screen.getByText('Сотруднику Глеб начислено 100 премиальных баллов')).toBeInTheDocument();
  });
});
