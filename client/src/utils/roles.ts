// Single source of truth for how a role is labelled in the UI — this used
// to be three separate hardcoded maps (Navigation, ProfilePage, AdminPage)
// that had drifted out of sync ("Лидер" in one place, "Тимлид" in another,
// "Админ" vs "Администратор" in a third) for the exact same role.
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Админ',
  lead: 'Тимлид',
  tester: 'Тестировщик',
};

// The Latin short form the design puts on a badge — beside the avatar in
// the header and on the profile card. Kept in this file rather than inlined
// at the two call sites for the same reason the Russian labels are: the
// hardcoded copies are what drifted last time. One of them was a literal
// "TESTER" on the profile card, which a lead saw on their own profile.
export const ROLE_SHORT: Record<string, string> = {
  admin: 'ADMIN',
  lead: 'LEAD',
  tester: 'TESTER',
};

export const ROLE_META: Record<string, { label: string; icon: 'crown' | 'frog'; color: string }> = {
  admin: { label: ROLE_LABELS.admin, icon: 'crown', color: '#e05252' },
  lead: { label: ROLE_LABELS.lead, icon: 'crown', color: '#EF9F27' },
  tester: { label: ROLE_LABELS.tester, icon: 'frog', color: '#66FCF1' },
};
