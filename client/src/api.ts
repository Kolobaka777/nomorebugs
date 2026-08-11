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
};

export const leadApi = {
  getTeam: () => api.get('/lead/team'),

  getBeforeAfter: () => api.get('/lead/before-after'),
  getBeforeAfterByTester: () => api.get('/lead/before-after-by-tester'),

  getActivity: (params?: { offset?: number; user_id?: number }) => api.get('/lead/activity', { params }),

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
};

export const usersApi = {
  getProfile: (id: number) => api.get(`/users/${id}/profile`),
};

export const suggestionsApi = {
  list: (params?: { offset?: number }) => api.get('/suggestions', { params }),
  create: (data: { type: string; text: string; is_anonymous: boolean }) => api.post('/suggestions', data),
  update: (id: number, data: { type: string; text: string; is_anonymous: boolean }) => api.put(`/suggestions/${id}`, data),
  like: (id: number) => api.post(`/suggestions/${id}/like`),
  unlike: (id: number) => api.delete(`/suggestions/${id}/like`),
  setStatus: (id: number, status: string) => api.patch(`/suggestions/${id}/status`, { status }),
  setFolder: (id: number, folder_id: number | null) => api.patch(`/suggestions/${id}/folder`, { folder_id }),
  remove: (id: number) => api.delete(`/suggestions/${id}`),

  getFolders: () => api.get('/lead/suggestion-folders'),
  createFolder: (name: string) => api.post('/lead/suggestion-folders', { name }),
  removeFolder: (id: number) => api.delete(`/lead/suggestion-folders/${id}`),
};

export const rewardsApi = {
  getMyPremiumPoints: () => api.get('/me/premium-points'),
};

export const statsApi = {
  getGlobal: () => api.get('/stats'),
};

// Checklist API
export const checklistApi = {
  getTemplates: () => api.get('/checklists/templates'),

  submit: (data: { template_id: number; task_name: string; results: { item_id: number; status: string }[] }) =>
    api.post('/checklists/submit', data),

  submitV2: (data: {
    template_id: number;
    task_name: string;
    content_author?: string;
    verska_author?: string;
    task_type?: string;
    check_date?: string;
    results: { item_id: number; status: string; note?: string }[];
  }) => api.post('/checklists/submit', data),

  getSubmissions: (params?: {
    template_id?: string | number;
    tester?: string;
    content_author?: string;
    verska_author?: string;
    task_type?: string;
    date_from?: string;
    date_to?: string;
    sort?: string;
    offset?: number;
  }) => api.get('/checklists/submissions', { params }),

  getSubmissionDetail: (id: number) => api.get(`/checklists/submissions/${id}`),

  getStats: (params?: { template_id?: string | number; task_type?: string; date_from?: string; date_to?: string }) =>
    api.get('/checklists/stats', { params }),

  getTaskCounts: () => api.get('/tester/task-counts'),

  getAuthors: () => api.get('/checklists/authors'),
  getTaskTypes: () => api.get('/checklists/task-types'),

  updateMvtItems: (templateId: number, items: { id: number; in_mvt: number }[], expectedMvtUpdatedAt: string | null) =>
    api.patch(`/checklists/templates/${templateId}/mvt`, { items, expected_mvt_updated_at: expectedMvtUpdatedAt }),

  createTemplate: (data: { name: string; color: string; items: { category: string; text: string }[] }) =>
    api.post('/checklists/templates', data),

  importTemplate: (file: File, name: string, color: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', name);
    fd.append('color', color);
    return api.post('/checklists/templates/import', fd);
  },
};

// Knowledge base (Багодельня): bug examples + glossary
export const knowledgeApi = {
  getBugExamples: () => api.get('/bug-examples'),
  createBugExample: (data: { tag: string; tag_color: string; problem: string; bad_text: string; good_text: string }) =>
    api.post('/bug-examples', data),
  updateBugExample: (id: number, data: { tag: string; tag_color: string; problem: string; bad_text: string; good_text: string }) =>
    api.put(`/bug-examples/${id}`, data),
  deleteBugExample: (id: number) => api.delete(`/bug-examples/${id}`),

  getGlossary: () => api.get('/glossary'),
  createGlossaryTerm: (data: { term: string; definition: string }) => api.post('/glossary', data),
  updateGlossaryTerm: (id: number, data: { term: string; definition: string }) => api.put(`/glossary/${id}`, data),
  deleteGlossaryTerm: (id: number) => api.delete(`/glossary/${id}`),

  getMyPermissions: () => api.get('/me/permissions'),
};

export const guidesApi = {
  list: () => api.get('/guides'),
  get: (id: number) => api.get(`/guides/${id}`),
  // Lead/admin/a manage_guides grant publishes immediately; anyone else is
  // proposing one — the server forces it unpublished + pending review
  // regardless of what's sent (see POST /api/guides).
  create: (data: { title: string; category: string; content: string }) => api.post('/guides', data),
  update: (id: number, data: { title: string; category: string; content: string }) => api.put(`/guides/${id}`, data),
  // Doubles as "decline a proposal" when the target is pending — see
  // DELETE /api/guides/:id.
  remove: (id: number) => api.delete(`/guides/${id}`),
  approve: (id: number) => api.patch(`/guides/${id}/approve`),
};

// Lead: scoped permission grants (e.g. letting a tester manage the knowledge base)
export const permissionsApi = {
  list: () => api.get('/lead/permissions'),
  grant: (data: { user_id: number; permission: string; expires_at: string | null }) =>
    api.post('/lead/permissions', data),
  revoke: (id: number) => api.delete(`/lead/permissions/${id}`),
};
