import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import MoyaNora from './pages/MoyaNora';
import UleyPage from './pages/UleyPage';
import QuizPage from './pages/QuizPage';
import BaselineSurvey from './pages/BaselineSurvey';
import HomePage from './pages/HomePage';
import ZhukademiPage from './pages/ZhukademiPage';
import BagodelnyaPage from './pages/BagodelnyaPage';
import ZhukovodstvoPage from './pages/ZhukovodstvoPage';
import AmbientSnail from './components/AmbientSnail';
import ScrollBug from './components/ScrollBug';

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
    setAuthState({ isAuthenticated: true, token, user, needsBaselineSurvey });
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('needsBaselineSurvey');
    setAuthState({ isAuthenticated: false, token: null, user: null, needsBaselineSurvey: false });
  };

  const handleBaselineSurveyComplete = () => {
    setAuthState(prev => ({ ...prev, needsBaselineSurvey: false }));
    localStorage.setItem('needsBaselineSurvey', 'false');
  };

  if (loading) {
    return (
      <div
        className="flex justify-center items-center h-screen font-pixel text-primary text-xs pixel-pulse"
        style={{ background: '#0f0f1a', lineHeight: 1.8 }}
      >
        🐌 уже ползу...
      </div>
    );
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
          <Route path="*" element={<BaselineSurvey onComplete={handleBaselineSurveyComplete} />} />
        </Routes>
      </BrowserRouter>
    );
  }

  const u = authState.user;
  const sharedProps = { user: u, onLogout: handleLogout };

  return (
    <BrowserRouter>
      {/* Global ambient decorations */}
      <AmbientSnail />
      <ScrollBug />

      <Routes>
        {/* ===== SHARED ROUTES ===== */}
        <Route path="/"              element={<HomePage {...sharedProps} />} />
        <Route path="/zhukademia"    element={<ZhukademiPage {...sharedProps} />} />
        <Route path="/bagodelnya"    element={<BagodelnyaPage {...sharedProps} />} />
        <Route path="/zhukovodstvo"  element={<ZhukovodstvoPage {...sharedProps} />} />

        {/* ===== TESTER ROUTES ===== */}
        {u.role === 'tester' && (
          <>
            <Route path="/cabinet"            element={<MoyaNora {...sharedProps} />} />
            <Route path="/lecture/:id/quiz"   element={<QuizPage {...sharedProps} />} />
            <Route path="*"                   element={<Navigate to="/cabinet" replace />} />
          </>
        )}

        {/* ===== LEAD ROUTES ===== */}
        {u.role === 'lead' && (
          <>
            <Route path="/dashboard" element={<UleyPage {...sharedProps} />} />
            <Route path="*"          element={<Navigate to="/dashboard" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
