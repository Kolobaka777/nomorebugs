import axios from 'axios';
import { API_BASE_URL } from './config';
import { getAccessToken, serverLogout, tryRefreshAccessToken } from './auth';

const api = axios.create({
  baseURL: API_BASE_URL,
  // Needed so the browser attaches the httpOnly refresh-token cookie on
  // /auth/refresh and /auth/logout — harmless no-op on every other route,
  // since that cookie is scoped server-side to the /api/auth path.
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On a 401 (expired/invalid access token), transparently refresh once and
// retry the original request instead of surfacing a broken/logged-out state
// for what's usually just a routine 15-minute access-token expiry.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original?._retriedAfterRefresh && !original?.url?.includes('/auth/')) {
      original._retriedAfterRefresh = true;
      const newToken = await tryRefreshAccessToken();
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const { token, user, needsBaselineSurvey, mustChangePassword } = res.data;
    return { data: { token, user, needsBaselineSurvey, mustChangePassword: !!mustChangePassword } };
  },

  register: async (email: string, password: string, name: string, gender: 'male' | 'female' | null = null, birthday: string | null = null) => {
    const res = await api.post('/auth/register', { email, password, name, gender, birthday });
    const { token, user, needsBaselineSurvey } = res.data;
    return { data: { token, user, needsBaselineSurvey, mustChangePassword: false } };
  },

  logout: serverLogout,

  changePassword: (current_password: string, new_password: string) =>
    api.put('/me/password', { current_password, new_password }),

  changeEmail: (current_password: string, new_email: string) =>
    api.put('/me/email', { current_password, new_email }),

  changePhone: (current_password: string, new_phone: string) =>
    api.put('/me/phone', { current_password, new_phone }),

  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, new_password: string) => api.post('/auth/reset-password', { token, new_password }),
};

export const adminApi = {
  getUsers: (params?: { archived?: boolean }) => api.get('/admin/users', { params: params?.archived ? { archived: '1' } : undefined }),
  setUserRole: (userId: number, role: string) => api.patch(`/admin/users/${userId}/role`, { role }),
  resetPassword: (userId: number) => api.post(`/admin/users/${userId}/reset-password`),
  archiveUser: (userId: number) => api.post(`/admin/users/${userId}/archive`),
  restoreUser: (userId: number) => api.post(`/admin/users/${userId}/restore`),
  getOverview: () => api.get('/admin/overview'),
  getBonusCandidates: () => api.get('/admin/bonus-candidates'),

  getTaskTypes: () => api.get('/admin/task-types'),
  createTaskType: (name: string) => api.post('/admin/task-types', { name }),
  deleteTaskType: (id: number) => api.delete(`/admin/task-types/${id}`),

  getTrash: () => api.get('/admin/trash'),
  restoreTrash: (type: string, id: number) => api.post(`/admin/trash/${type}/${id}/restore`),
  purgeTrash: (type: string, id: number) => api.delete(`/admin/trash/${type}/${id}`),
};

export const telegramApi = {
  // No auth — used from the login/register screens, before a session exists.
  start: () => api.post('/auth/telegram/start'),
  poll: (token: string) => api.get(`/auth/telegram/poll/${token}`),

  // Authenticated — lets an already-logged-in user attach Telegram after
  // the fact (e.g. an email/password account that wants notifications).
  linkStart: () => api.post('/auth/telegram/link/start'),
  status: () => api.get('/auth/telegram/status'),
  unlink: () => api.post('/auth/telegram/unlink'),
};

export const testerApi = {
  getProfile: () => api.get('/tester/profile'),

  getProfileFull: () => api.get('/tester/profile-full'),

  updateProfile: (data: any) => api.put('/tester/profile', data),

  // Returns { rows, hasMore } and, deliberately, no image data — the bytes
  // come one at a time from getGalleryImage below so the browser can cache
  // them, instead of arriving together in one very large JSON response.
  getAvatarGallery: (params?: { offset?: number }) => api.get('/avatars/gallery', { params }),

  getGalleryImage: (id: number) => api.get(`/avatars/gallery/${id}/image`, { responseType: 'blob' }),

  // Wearing one is done by id: the picker never needs the bytes in hand.
  equipGalleryAvatar: (id: number) => api.post(`/tester/avatar/gallery/${id}/equip`),

  publishAvatarToGallery: (image: string) => api.post('/tester/avatar/gallery', { image }),

  deleteGalleryAvatar: (id: number) => api.delete(`/tester/avatar/gallery/${id}`),

  getMetrics: () => api.get('/tester/metrics'),

  getLectures: () => api.get('/tester/lectures'),

  getHistory: () => api.get('/tester/history'),

  getBeforeAfter: () => api.get('/tester/before-after'),

  getMyActivity: (params?: { offset?: number }) => api.get('/me/activity', { params }),

  getCards: () => api.get('/tester/cards'),

  craftBadge: (skill_area: string) => api.post('/tester/craft-badge', { skill_area }),

  getLecture: (lectureId: number) => api.get(`/lectures/${lectureId}`),

  getQuestions: (lectureId: number) => api.get(`/lectures/${lectureId}/questions`),

  submitTest: (lectureId: number, answers: Record<number, string>, meta?: { questionTimes: Record<number, number>; tabSwitches: number }) =>
    api.post(`/lectures/${lectureId}/submit-test`, { answers, meta }),

  getExplanation: (lectureId: number, questionId: number) =>
    api.get(`/lectures/${lectureId}/question/${questionId}/explanation`),

  submitBaselineSurvey: (data: any) => api.post('/tester/baseline-survey', data),

  submitFinalSurvey: (data: any) => api.post('/tester/final-survey', data),

  buyShopItem: (item_id: string) => api.post('/tester/shop/buy', { item_id }),

  getFavorites: () => api.get('/tester/favorites'),
  addFavorite: (course_type: 'lecture' | 'custom', course_id: number) =>
    api.post('/tester/favorites', { course_type, course_id }),
  removeFavorite: (course_type: 'lecture' | 'custom', course_id: number) =>
    api.delete(`/tester/favorites/${course_type}/${course_id}`),

  getNotes: () => api.get('/tester/notes'),
  addNote: (data: { course_id: number; lesson_id?: number | null; lesson_title: string; text: string }) =>
    api.post('/tester/notes', data),
  deleteNote: (id: number) => api.delete(`/tester/notes/${id}`),
};

export const leadApi = {
  getTeam: () => api.get('/lead/team'),

  getBeforeAfter: () => api.get('/lead/before-after'),
  getBeforeAfterByTester: () => api.get('/lead/before-after-by-tester'),

  getActivity: (params?: {
    offset?: number;
    user_id?: number;
    // See server/src/activityCategories.js — 'learning' | 'content' |
    // 'admin' | 'account'. An unknown value is ignored server-side rather
    // than erroring, so this stays a plain string.
    category?: string;
    q?: string;
    from?: string;
    to?: string;
  }) => api.get('/lead/activity', { params }),

  getLectureStats: () => api.get('/lead/lecture-stats'),

  awardBonus: (data: { user_id: number; amount: number; reason: string }) => api.post('/lead/award-bonus', data),
  getBonusAwards: () => api.get('/lead/bonus-awards'),
  getInternalRatings: () => api.get('/lead/internal-ratings'),

  getArchivedTesters: () => api.get('/lead/archived-testers'),

  updateTeamNote: (id: number, note: string) => api.patch(`/lead/team/${id}/note`, { note }),

  updatePresence: (id: number, data: { work_start?: string | null; work_end?: string | null; work_days?: string; timezone?: string; status?: string; birthday?: string | null }) =>
    api.patch(`/lead/team/${id}/presence`, data),
  addLeave: (id: number, data: { type: string; start_date: string; end_date?: string | null; note?: string }) =>
    api.post(`/lead/team/${id}/leave`, data),
  removeLeave: (id: number, leaveId: number) => api.delete(`/lead/team/${id}/leave/${leaveId}`),

  setDeadlineOverride: (courseId: number, data: { user_id: number; deadline_at: string; reason?: string }) =>
    api.post(`/custom-courses/${courseId}/deadline-override`, data),
  removeDeadlineOverride: (courseId: number, userId: number) =>
    api.delete(`/custom-courses/${courseId}/deadline-override/${userId}`),

  getLectures: () => api.get('/admin/lectures'),
  setLectureVideo: (id: number, video_url: string | null) => api.patch(`/admin/lectures/${id}/video`, { video_url }),
};

export const presenceApi = {
  getTeam: () => api.get('/team/presence'),
  updateMe: (data: { work_start?: string | null; work_end?: string | null; work_days?: string; timezone?: string; status?: string; birthday?: string | null }) =>
    api.patch('/me/presence', data),
  addLeave: (data: { type: string; start_date: string; end_date?: string | null; note?: string }) =>
    api.post('/me/leave', data),
  removeLeave: (id: number) => api.delete(`/me/leave/${id}`),
};

export const teamApi = {
  getNews: (params?: { offset?: number }) => api.get('/team/news', { params }),
  // Lead-only. Announcements are the one feed item a person writes directly;
  // removeNews covers any stored event, not only those.
  postNews: (text: string) => api.post('/team/news', { text }),
  removeNews: (id: number) => api.delete(`/team/news/${id}`),
};

export const usersApi = {
  getProfile: (id: number) => api.get(`/users/${id}/profile`),
};

export const suggestionsApi = {
  // type is a comma-separated allowlist ('question', 'idea,complaint') —
  // the Идеи board and Помощь's «Частые вопросы» show different slices of
  // the same table. Omitting it returns every type.
  list: (params?: { offset?: number; type?: string }) => api.get('/suggestions', { params }),
  create: (data: { type: string; text: string; is_anonymous: boolean }) => api.post('/suggestions', data),
  update: (id: number, data: { type: string; text: string; is_anonymous: boolean }) => api.put(`/suggestions/${id}`, data),
  like: (id: number) => api.post(`/suggestions/${id}/like`),
  unlike: (id: number) => api.delete(`/suggestions/${id}/like`),
  setStatus: (id: number, status: string) => api.patch(`/suggestions/${id}/status`, { status }),
  setFolder: (id: number, folder_id: number | null) => api.patch(`/suggestions/${id}/folder`, { folder_id }),
  answer: (id: number, answer: string) => api.patch(`/suggestions/${id}/answer`, { answer }),
  remove: (id: number) => api.delete(`/suggestions/${id}`),

  getFolders: () => api.get('/lead/suggestion-folders'),
  createFolder: (name: string) => api.post('/lead/suggestion-folders', { name }),
  removeFolder: (id: number) => api.delete(`/lead/suggestion-folders/${id}`),
};

export const rewardsApi = {
  getMyPremiumPoints: () => api.get('/me/premium-points'),
};

// Mascot copy: corner tips, loading-screen phrases and first-run tour steps.
// Reading is open to everyone (the frog talks to testers); writing is lead
// only. See utils/frogLines.ts for the session cache in front of this.
export const frogLinesApi = {
  getAll: () => api.get('/frog-lines'),
  create: (data: { kind: string; text: string; title?: string; target?: string; role?: string }) =>
    api.post('/frog-lines', data),
  update: (id: number, data: { text: string; title?: string; target?: string; role?: string }) =>
    api.put(`/frog-lines/${id}`, data),
  remove: (id: number) => api.delete(`/frog-lines/${id}`),
};

export const statsApi = {
  getGlobal: () => api.get('/stats'),
};

// Чеклисты — фича извлечена из проекта 15.08.2026 (не нужна в этом
// сервисе). Исходники: c:\Users\user\Desktop\Projects\_archive\checklists-feature-2026-08-15\.

// Knowledge base (Багодельня): bug examples + glossary. Anyone can also
// *propose* one — the server forces it unpublished + pending review
// regardless of what's sent (see POST /api/bug-examples, POST /api/glossary).
// Custom courses. This whole domain used to live on `authFetch` — a second,
// parallel HTTP layer with its own retry, its own header handling and its own
// error shape — while everything else went through axios. Same transport for
// everything now; authFetch is gone.
export const coursesApi = {
  list: () => api.get('/custom-courses'),
  get: (id: number | string) => api.get(`/custom-courses/${id}`),
  create: (data: any) => api.post('/custom-courses', data),
  update: (id: number | string, data: any) => api.put(`/custom-courses/${id}`, data),
  remove: (id: number | string) => api.delete(`/custom-courses/${id}`),
  togglePublish: (id: number | string) => api.patch(`/custom-courses/${id}/publish`),

  completeLesson: (lessonId: number) => api.post(`/custom-lessons/${lessonId}/complete`),
  trackTime: (course_id: number, seconds_spent: number) =>
    api.post('/courses/time-track', { course_id, seconds_spent }),

  // Grading lives on the server (see routes/courses.js). `answers` is keyed
  // by question id, not by position, so a course edited mid-attempt can't
  // grade someone against a question they never read.
  submitQuiz: (lessonId: number, answers: Record<number, number>) =>
    api.post(`/custom-lessons/${lessonId}/submit-quiz`, { answers }),
  // The per-question reveal, fetched only once an answer is picked — the
  // answer key is not in the page source.
  getExplanation: (lessonId: number, questionId: number) =>
    api.get(`/custom-lessons/${lessonId}/question/${questionId}/explanation`),
  myResult: (courseId: number | string) => api.get(`/custom-courses/${courseId}/my-result`),

  getSections: () => api.get('/course-sections'),
  createSection: (name: string) => api.post('/course-sections', { name }),
  renameSection: (id: number, name: string) => api.patch(`/course-sections/${id}`, { name }),
  removeSection: (id: number) => api.delete(`/course-sections/${id}`),
};

export const knowledgeApi = {
  getBugExamples: () => api.get('/bug-examples'),
  createBugExample: (data: { tag: string; tag_color: string; problem: string; bad_text: string; good_text: string }) =>
    api.post('/bug-examples', data),
  updateBugExample: (id: number, data: { tag: string; tag_color: string; problem: string; bad_text: string; good_text: string }) =>
    api.put(`/bug-examples/${id}`, data),
  deleteBugExample: (id: number) => api.delete(`/bug-examples/${id}`),
  approveBugExample: (id: number) => api.patch(`/bug-examples/${id}/approve`),

  getGlossary: () => api.get('/glossary'),
  createGlossaryTerm: (data: { term: string; definition: string }) => api.post('/glossary', data),
  updateGlossaryTerm: (id: number, data: { term: string; definition: string }) => api.put(`/glossary/${id}`, data),
  deleteGlossaryTerm: (id: number) => api.delete(`/glossary/${id}`),
  approveGlossaryTerm: (id: number) => api.patch(`/glossary/${id}/approve`),

  getMyPermissions: () => api.get('/me/permissions'),
};

export const guidesApi = {
  list: () => api.get('/guides'),
  get: (id: number) => api.get(`/guides/${id}`),
  // Lead/admin/a manage_guides grant publishes immediately; anyone else is
  // proposing one — the server forces it unpublished + pending review
  // regardless of what's sent (see POST /api/guides).
  create: (data: { title: string; category: string; content: string; icon?: string | null }) => api.post('/guides', data),
  update: (id: number, data: { title: string; category: string; content: string; icon?: string | null }) => api.put(`/guides/${id}`, data),
  // Doubles as "decline a proposal" when the target is pending — see
  // DELETE /api/guides/:id.
  remove: (id: number) => api.delete(`/guides/${id}`),
  approve: (id: number) => api.patch(`/guides/${id}/approve`),
  renameCategory: (from: string, to: string) => api.patch('/guides/categories/rename', { from, to }),
};

// Lead: scoped permission grants (e.g. letting a tester manage the knowledge base)
export const permissionsApi = {
  list: () => api.get('/lead/permissions'),
  grant: (data: { user_id: number; permission: string; expires_at: string | null }) =>
    api.post('/lead/permissions', data),
  revoke: (id: number) => api.delete(`/lead/permissions/${id}`),
};
