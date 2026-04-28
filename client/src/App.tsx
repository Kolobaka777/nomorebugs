import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import TesterCabinet from './pages/TesterCabinet';
import LeadDashboard from './pages/LeadDashboard';
import QuizPage from './pages/QuizPage';
import BaselineSurvey from './pages/BaselineSurvey';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  user: any;
  needsBaselineSurvey: boolean;
}

function App() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    token: null,
    user: null,
    needsBaselineSurvey: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
      setAuthState({
        isAuthenticated: true,
        token,
        user: JSON.parse(user),
        needsBaselineSurvey: localStorage.getItem('needsBaselineSurvey') === 'true',
      });
    }
    setLoading(false);
  }, []);

  const handleLogin = (token: string, user: any, needsBaselineSurvey: boolean) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('needsBaselineSurvey', String(needsBaselineSurvey));
    setAuthState({
      isAuthenticated: true,
      token,
      user,
      needsBaselineSurvey,
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('needsBaselineSurvey');
    setAuthState({
      isAuthenticated: false,
      token: null,
      user: null,
      needsBaselineSurvey: false,
    });
  };

  const handleBaselineSurveyComplete = () => {
    setAuthState(prev => ({ ...prev, needsBaselineSurvey: false }));
    localStorage.setItem('needsBaselineSurvey', 'false');
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Загрузка...</div>;
  }

  if (!authState.isAuthenticated) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<LoginPage onLogin={handleLogin} />} />
        </Routes>
      </BrowserRouter>
    );
  }

  if (authState.needsBaselineSurvey && authState.user.role === 'tester') {
    return (
      <BrowserRouter>
        <Routes>
          <Route
            path="*"
            element={<BaselineSurvey onComplete={handleBaselineSurveyComplete} />}
          />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {authState.user.role === 'tester' ? (
          <>
            <Route
              path="/cabinet"
              element={<TesterCabinet user={authState.user} onLogout={handleLogout} />}
            />
            <Route
              path="/lecture/:id/quiz"
              element={<QuizPage user={authState.user} onLogout={handleLogout} />}
            />
            <Route path="*" element={<Navigate to="/cabinet" replace />} />
          </>
        ) : (
          <>
            <Route
              path="/dashboard"
              element={<LeadDashboard user={authState.user} onLogout={handleLogout} />}
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
