// Single source of truth for how a role is labelled in the UI — this used
// to be three separate hardcoded maps (Navigation, ProfilePage, AdminPage)
// that had drifted out of sync ("Лидер" in one place, "Тимлид" in another,
// "Админ" vs "Администратор" in a third) for the exact same role.
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Админ',
  lead: 'Тимлид',
  tester: 'Тестировщик',
};

export const ROLE_META: Record<string, { label: string; icon: 'crown' | 'bug'; color: string }> = {
  admin: { label: ROLE_LABELS.admin, icon: 'crown', color: '#e05252' },
  lead: { label: ROLE_LABELS.lead, icon: 'crown', color: '#EF9F27' },
  tester: { label: ROLE_LABELS.tester, icon: 'bug', color: '#1D9E75' },
};
