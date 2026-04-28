import { useState } from 'react';
import { authApi } from '../api';

interface LoginPageProps {
  onLogin: (token: string, user: any, needsBaselineSurvey: boolean) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await authApi.login(email, password);
      onLogin(data.token, data.user, data.needsBaselineSurvey);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center bg-gradient-to-br from-primary to-teal-900 p-4 min-h-screen">
      <div className="bg-white shadow-lg p-8 rounded-lg w-full max-w-md">
        <h1 className="mb-2 font-bold text-gray-900 text-3xl text-center">QA Learning Hub</h1>
        <p className="mb-8 text-gray-600 text-center">Портал обучения QA тестированию</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-100 p-3 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block mb-1 font-medium text-gray-700 text-sm">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-4 py-2 border border-gray-300 focus:border-transparent rounded-lg focus:ring-2 focus:ring-primary w-full"
              placeholder="your@email.com"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block mb-1 font-medium text-gray-700 text-sm">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="px-4 py-2 border border-gray-300 focus:border-transparent rounded-lg focus:ring-2 focus:ring-primary w-full"
              placeholder="••••••"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="disabled:opacity-50 w-full font-semibold btn-primary"
          >
            {loading ? 'Загрузка...' : 'Войти'}
          </button>
        </form>

        <div className="bg-gray-50 mt-8 p-4 rounded-lg text-gray-600 text-sm">
          <p className="mb-2 font-semibold">Тестовые учётные записи:</p>
          <p><strong>Lead:</strong> lead@qa.com / lead123</p>
          <p><strong>Tester:</strong> nazar@qa.com / test123</p>
        </div>
      </div>
    </div>
  );
}
