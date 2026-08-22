// The only form through which a person edits their profile — 828 lines at
// 0.44% coverage before these tests. On 2026-08-21 the endpoint it posts to
// turned out to erase every field the request did not mention, and that
// survived unnoticed precisely because nothing here could fail. What is
// covered is what would let it happen again: a complete save, typed text
// surviving a tab switch, and a refusal being visible.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProfileEditModal from './ProfileEditModal';
import { testerApi } from '../api';
import { DEFAULT_AVATAR_ID } from '../utils/shop';

vi.mock('../api', () => ({
  testerApi: {
    updateProfile: vi.fn(),
    getAvatarGallery: vi.fn(),
    publishAvatarToGallery: vi.fn(),
    equipGalleryAvatar: vi.fn(),
    deleteGalleryAvatar: vi.fn(),
    buyShopItem: vi.fn(),
  },
  authApi: { changePassword: vi.fn(), changeEmail: vi.fn(), changePhone: vi.fn() },
  telegramApi: { getStatus: vi.fn(), linkStart: vi.fn(), unlink: vi.fn() },
}));

const profile: any = {
  nickname: 'Назарий',
  status_quote: 'ищу баги',
  specialization: '',
  info_box: 'обо мне',
  snail_joke: 'улитка',
  is_public: true,
  avatar_id: 'frog2',
  avatar_frame: 'default',
  profile_bg: 'default',
  profile_accent_color: '#66FCF1',
  showcase_badges: [],
  favorite_lecture_id: null,
  custom_avatar: null,
  gender: 'male',
  bug_coins: 0,
  purchased_items: [],
  badges: [],
  stats: {},
  cards: [],
};

const renderModal = (over: Partial<any> = {}) => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <ProfileEditModal
      profile={{ ...profile, ...over }}
      unlockedFrames={['default', 'code']}
      unlockedBgs={['default', 'forest']}
      unlockedAvatars={['frog2', 'frog3']}
      badgeIds={[]}
      onSave={onSave}
      onClose={onClose}
    />
  );
  return { onSave, onClose };
};

const save = () => fireEvent.click(screen.getByRole('button', { name: /Сохранить/i }));
const openTab = (name: RegExp) => fireEvent.click(screen.getByText(name));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(testerApi.updateProfile).mockResolvedValue({ data: { success: true } } as any);
  vi.mocked(testerApi.getAvatarGallery).mockResolvedValue({ data: { rows: [], hasMore: false } } as any);
});

describe('what reaches the server', () => {
  it('sends the whole profile, not only what was touched', async () => {
    // The endpoint takes both a whole form and a partial update. An
    // incomplete body from here is the silent loss of everything absent
    // from it.
    renderModal();
    save();

    await waitFor(() => expect(testerApi.updateProfile).toHaveBeenCalled());
    const sent = vi.mocked(testerApi.updateProfile).mock.calls[0][0];
    for (const key of [
      'nickname', 'status_quote', 'specialization', 'info_box', 'snail_joke',
      'is_public', 'avatar_id', 'avatar_frame', 'profile_bg',
      'profile_accent_color', 'showcase_badges', 'favorite_lecture_id',
      'custom_avatar', 'gender',
    ]) {
      expect(sent).toHaveProperty(key);
    }
  });

  it('carries the edited value rather than the original', async () => {
    renderModal();
    fireEvent.change(screen.getByDisplayValue('Назарий'), { target: { value: 'Назар' } });
    save();

    await waitFor(() => expect(testerApi.updateProfile).toHaveBeenCalled());
    expect(vi.mocked(testerApi.updateProfile).mock.calls[0][0].nickname).toBe('Назар');
  });

  it('reports upward exactly what it saved', async () => {
    const { onSave } = renderModal();
    fireEvent.change(screen.getByDisplayValue('ищу баги'), { target: { value: 'чиню баги' } });
    save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].status_quote).toBe('чиню баги');
  });

  it('clears a field that was genuinely emptied', async () => {
    renderModal();
    fireEvent.change(screen.getByDisplayValue('обо мне'), { target: { value: '' } });
    save();

    await waitFor(() => expect(testerApi.updateProfile).toHaveBeenCalled());
    expect(vi.mocked(testerApi.updateProfile).mock.calls[0][0].info_box).toBe('');
  });
});

describe('switching tabs', () => {
  it('does not lose typed text while the form is open', async () => {
    // The tabs unmount their own fields. If state lived in them rather than
    // in the modal, someone switching to Внешний вид and back would find the
    // field empty — silently, with no error at all.
    renderModal();
    fireEvent.change(screen.getByDisplayValue('Назарий'), { target: { value: 'Совсем другой' } });

    openTab(/Внешний вид/);
    openTab(/Основное/);

    expect(screen.getByDisplayValue('Совсем другой')).toBeInTheDocument();
  });

  it('saves text typed before a switch, even from another tab', async () => {
    renderModal();
    fireEvent.change(screen.getByDisplayValue('обо мне'), { target: { value: 'обновлённый текст' } });
    openTab(/Внешний вид/);
    save();

    await waitFor(() => expect(testerApi.updateProfile).toHaveBeenCalled());
    expect(vi.mocked(testerApi.updateProfile).mock.calls[0][0].info_box).toBe('обновлённый текст');
  });
});

describe('when the server refuses', () => {
  it('shows the refusal instead of closing as though it worked', async () => {
    vi.mocked(testerApi.updateProfile).mockRejectedValue({ response: { data: { error: 'Эта рамка ещё не открыта' } } });
    const { onSave, onClose } = renderModal();
    save();

    expect(await screen.findByText('Эта рамка ещё не открыта')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('allows another attempt rather than locking up for good', async () => {
    vi.mocked(testerApi.updateProfile).mockRejectedValueOnce({ response: { data: { error: 'Не сохранилось' } } });
    renderModal();
    save();
    await screen.findByText('Не сохранилось');

    vi.mocked(testerApi.updateProfile).mockResolvedValue({ data: { success: true } } as any);
    save();
    await waitFor(() => expect(testerApi.updateProfile).toHaveBeenCalledTimes(2));
  });
});

describe('the default avatar', () => {
  it('is a free one for a profile with none stored, not a shop item', () => {
    // frog1 sells for 120 coins. While it was the default, the editor opened
    // wearing an avatar the same screen was offering to sell.
    const { onSave } = renderModal({ avatar_id: null });
    save();
    return waitFor(() => {
      expect(vi.mocked(testerApi.updateProfile).mock.calls[0][0].avatar_id).toBe(DEFAULT_AVATAR_ID);
      expect(onSave).toHaveBeenCalled();
    });
  });
});
