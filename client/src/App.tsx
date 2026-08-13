import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import BaselineSurvey from './pages/BaselineSurvey';
import InstallPrompt from './components/InstallPrompt';
import OnboardingTour from './components/OnboardingTour';
import BgWatermark from './components/BgWatermark';
import ChangePasswordModal from './components/ChangePasswordModal';
import {
  getAccessToken, getStoredUser, getNeedsBaselineSurvey, getMustChangePassword,
  setSession, setNeedsBaselineSurvey, setMustChangePassword, clearSession, serverLogout,
  updateStoredUser, SESSION_EXPIRED_EVENT,
} from './auth';
import { identifyUser, resetAnalyticsUser } from './monitoring';

// Everything past the login/baseline-survey gate is lazy-loaded — those two
// are needed immediately at auth-boot time, but a tester logging in has no
// reason to pay for the lead's course-builder bundle (and vice versa), and
// the single bundle was already flagged (1.3MB) by Vite's own build warning.
const MoyaNora = lazy(() => import('./pages/MoyaNora'));
const UleyPage = lazy(() => import('./pages/UleyPage'));
const QuizPage = lazy(() => import('./pages/QuizPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const ZhukademiPage = lazy(() => import('./pages/ZhukademiPage'));
const BagodelnyaPage = lazy(() => import('./pages/BagodelnyaPage'));
const CustomCourseDetailPage = lazy(() => import('./pages/CustomCourseDetailPage'));
const CustomCourseLearningPage = lazy(() => import('./pages/CustomCourseLearningPage'));
const CourseBuilderPage = lazy(() => import('./pages/CourseBuilderPage'));
// Чеклисты — route pulled while the feature is reworked; nav entry is
// commented out too (Navigation.tsx). Import/route kept, not deleted.
// const ChecklistsPage = lazy(() => import('./pages/ChecklistsPage'));
// const ChecklistFormPage = lazy(() => import('./pages/ChecklistFormPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const GuidesPage = lazy(() => import('./pages/GuidesPage'));
const SuggestionsPage = lazy(() => import('./pages/SuggestionsPage'));
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage'));
const NewsPage = lazy(() => import('./pages/NewsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  user: any;
  needsBaselineSurvey: boolean;
  mustChangePassword: boolean;
}

const loggedOutState: AuthState = { isAuthenticated: false, token: null, user: null, needsBaselineSurvey: false, mustChangePassword: false };

function App() {
  const [authState, setAuthState] = useState<AuthState>(loggedOutState);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    const user = getStoredUser();
    if (token && user) {
      setAuthState({
        isAuthenticated: true,
        token,
        user,
        needsBaselineSurvey: getNeedsBaselineSurvey(),
        mustChangePassword: getMustChangePassword(),
      });
      identifyUser(user);
    }
    setLoading(false);
  }, []);

  // Fired by api.ts / auth.ts when the refresh token itself is missing,
  // expired, or revoked — the session genuinely can't continue, so log out
  // cleanly and tell the user why, instead of leaving broken UI state around.
  useEffect(() => {
    const onSessionExpired = () => {
      setAuthState(loggedOutState);
      setSessionExpiredNotice(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  const handleLogin = (token: string, user: any, needsBaselineSurvey: boolean, mustChangePassword = false) => {
    setSession(token, user, needsBaselineSurvey, mustChangePassword);
    setSessionExpiredNotice(false);
    setAuthState({ isAuthenticated: true, token, user, needsBaselineSurvey, mustChangePassword });
    identifyUser(user);
  };

  // Lets a page (ProfilePage, MoyaNora) push a change — right now just the
  // display nickname — into the shared user object after a profile edit, so
  // the nav dropdown reflects it immediately instead of showing whatever
  // name was current at login until the next full page reload.
  const handleUserUpdate = (patch: Record<string, any>) => {
    const merged = updateStoredUser(patch);
    setAuthState(prev => ({ ...prev, user: merged }));
  };

  const handlePasswordChanged = () => {
    setMustChangePassword(false);
    setAuthState(prev => ({ ...prev, mustChangePassword: false }));
  };

  const handleLogout = () => {
    serverLogout();
    clearSession();
    resetAnalyticsUser();
    setAuthState(loggedOutState);
  };

  const handleBaselineSurveyComplete = () => {
    setAuthState(prev => ({ ...prev, needsBaselineSurvey: false }));
    setNeedsBaselineSurvey(false);
  };

  if (loading) {
    return (
      <div
        className="flex justify-center items-center h-screen font-pixel text-primary text-xs pixel-pulse"
        style={{ background: '#0B0C10', lineHeight: 1.8 }}
      >
        🐌 уже ползу...
      </div>
    );
  }

  if (!authState.isAuthenticated) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/register" element={<RegisterPage onLogin={handleLogin} />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<LoginPage onLogin={handleLogin} sessionExpired={sessionExpiredNotice} />} />
        </Routes>
      </BrowserRouter>
    );
  }

  if (authState.mustChangePassword) {
    return (
      <div className="min-h-screen" style={{ background: '#0B0C10' }}>
        <ChangePasswordModal forced onDone={handlePasswordChanged} />
      </div>
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
  const sharedProps = { user: u, onLogout: handleLogout, onUserUpdate: handleUserUpdate };

  return (
    <BrowserRouter>
      {/* Global ambient decorations */}
      {/* FrogCompanion (cursor-lean + click-to-catch corner mascot) is
          paused per the user's request — she's designing a different
          interaction for the frog. Component file kept, just unmounted;
          see components/FrogCompanion.tsx.
          ScrollBug (the beetle that walked along a bottom scroll-progress
          bar) was removed outright per her request — old-design cruft,
          unlike FrogCompanion which she's actively redesigning. */}
      <InstallPrompt />
      <OnboardingTour user={u} />

      {/* Sits behind every routed page — see BgWatermark.tsx. The routes
          wrapper below gets an explicit z-index so it paints on top
          regardless of DOM order (position:fixed + z-index:auto siblings
          are ordered by z-index value first, not just tree order). */}
      <BgWatermark />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Suspense fallback={
          <div className="flex justify-center items-center h-screen font-pixel text-primary text-xs pixel-pulse" style={{ background: '#0B0C10', lineHeight: 1.8 }}>
            🐌 уже ползу...
          </div>
        }>
          <Routes>
            {/* ===== SHARED ROUTES ===== */}
            <Route path="/"                        element={<HomePage {...sharedProps} />} />
            <Route path="/zhukademia"              element={<ZhukademiPage {...sharedProps} />} />
            <Route path="/bagodelnya"              element={<BagodelnyaPage {...sharedProps} />} />
            <Route path="/custom-course/:id"       element={<CustomCourseDetailPage {...sharedProps} />} />
            <Route path="/custom-course/:id/learn" element={<CustomCourseLearningPage {...sharedProps} />} />
            <Route path="/lead/course-builder"     element={<CourseBuilderPage {...sharedProps} />} />
            <Route path="/lead/course-builder/:id" element={<CourseBuilderPage {...sharedProps} />} />
            {/* Same builder component, own URL — a tester proposing a
                course shouldn't see "/lead/..." in their address bar. No
                :id variant: proposals are one-shot submissions, not
                editable by their author after the fact (see courses.js). */}
            <Route path="/propose-course"          element={<CourseBuilderPage {...sharedProps} />} />
            {/* <Route path="/checklists"              element={<ChecklistsPage {...sharedProps} />} /> */}
            {/* <Route path="/checklists/:typeId"      element={<ChecklistFormPage {...sharedProps} />} /> */}
            <Route path="/guides"                  element={<GuidesPage {...sharedProps} />} />
            <Route path="/suggestions"             element={<SuggestionsPage {...sharedProps} />} />
            <Route path="/profile/:id"             element={<PublicProfilePage {...sharedProps} />} />
            <Route path="/news"                    element={<NewsPage {...sharedProps} />} />
            <Route path="/help"                    element={<HelpPage {...sharedProps} />} />

            {/* ===== TESTER ROUTES ===== */}
            {u.role === 'tester' && (
              <>
                <Route path="/cabinet"            element={<MoyaNora {...sharedProps} />} />
                <Route path="/lecture/:id/quiz"   element={<QuizPage {...sharedProps} />} />
                <Route path="*"                   element={<Navigate to="/cabinet" replace />} />
              </>
            )}

            {/* ===== LEAD + ADMIN ROUTES ===== (admin can do everything lead
                can — see requireRole()'s admin bypass server-side — so it
                shares this branch rather than duplicating the route) */}
            {(u.role === 'lead' || u.role === 'admin') && (
              <>
                <Route path="/dashboard" element={<UleyPage {...sharedProps} />} />
                <Route path="/profile" element={<ProfilePage {...sharedProps} />} />
              </>
            )}

            {/* ===== ADMIN-ONLY ROUTES ===== */}
            {u.role === 'admin' && (
              <Route path="/admin" element={<AdminPage {...sharedProps} />} />
            )}

            {(u.role === 'lead' || u.role === 'admin') && (
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            )}
          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}

export default App;
