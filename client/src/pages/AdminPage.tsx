import { useEffect, useState } from 'react';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import PixelIcon from '../components/PixelIcon';
import { adminApi } from '../api';

interface AdminPageProps {
  user: any;
  onLogout: () => void;
}

interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: string;
  avatar_initials: string;
  created_at: string;
}

// Mirrors server/src/roles.js — the server is the actual source of truth
// (it validates and rejects anything not in ROLES), this list only drives
// the dropdown. Adding a role means updating both, same as any other
// client/server contract.
const ROLE_OPTIONS = ['tester', 'lead', 'admin'];

const ROLE_LABELS: Record<string, string> = {
  tester: 'Тестировщик',
  lead: 'Тимлид',
  admin: 'Админ',
};

export default function AdminPage({ user, onLogout }: AdminPageProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const res = await adminApi.getUsers();
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const changeRole = async (targetId: number, role: string) => {
    setError('');
    setSavingId(targetId);
    const prev = users;
    // Optimistic update — the confirm-then-refetch round trip is
    // noticeable on a plain <select>, and a failure just gets reverted.
    setUsers(u => u.map(row => (row.id === targetId ? { ...row, role } : row)));
    try {
      await adminApi.setUserRole(targetId, role);
    } catch (err: any) {
      setUsers(prev);
      setError(err.response?.data?.error || 'Не удалось изменить роль');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-5xl mx-auto px-6 pt-16 pb-8 fade-in">
        <div className="mb-8">
          <h1 className="font-pixel text-primary mb-2" style={{ fontSize: '0.8rem', lineHeight: 1.8 }}>
            <span className="flex items-center gap-2"><PixelIcon name="crown" size={14} color="#EF9F27" /> Админка</span>
          </h1>
          <p className="text-pixel/60 text-sm font-sans">Пользователи и роли — {users.length} всего</p>
        </div>

        {error && (
          <div
            className="px-4 py-3 rounded text-sm font-sans mb-4"
            style={{
              background: 'rgba(224,82,82,0.1)',
              color: '#e05252',
              boxShadow: '1px 0 0 0 #e05252, -1px 0 0 0 #e05252, 0 1px 0 0 #e05252, 0 -1px 0 0 #e05252',
            }}
          >
            {error}
          </div>
        )}

        <div className="space-y-2">
          {users.map(row => (
            <div
              key={row.id}
              className="p-3 rounded flex items-center gap-4"
              style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.08)' }}
            >
              <div
                className="w-8 h-8 rounded flex items-center justify-center font-pixel text-xs shrink-0"
                style={{ background: '#1D9E75', color: '#0f0f1a' }}
              >
                {row.avatar_initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-pixel text-sm font-sans font-semibold">{row.name}</p>
                <p className="text-pixel/60 text-xs font-sans">{row.email}</p>
              </div>
              <select
                value={row.role}
                onChange={e => changeRole(row.id, e.target.value)}
                disabled={savingId === row.id || row.id === user.id}
                className="pixel-input text-xs"
                style={{ width: 140 }}
                aria-label={`Роль пользователя ${row.name}`}
              >
                {ROLE_OPTIONS.map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <p className="text-pixel/55 text-xs font-sans mt-4">
          Свою роль можно изменить только через другого администратора — это защита от случайной потери доступа.
        </p>
      </div>
    </div>
  );
}
