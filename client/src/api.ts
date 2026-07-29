import axios from 'axios';
import { API_BASE_URL } from './config';
import { getAccessToken, serverLogout, tryRefreshAccessToken } from './auth';

const api = axios.create({
  baseURL: API_BASE_URL,
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
    const { token, refreshToken, user, needsBaselineSurvey } = res.data;
    return { data: { token, refreshToken, user, needsBaselineSurvey } };
  },

  register: async (email: string, password: string, name: string) => {
    const res = await api.post('/auth/register', { email, password, name });
    const { token, refreshToken, user, needsBaselineSurvey } = res.data;
    return { data: { token, refreshToken, user, needsBaselineSurvey } };
  },

  logout: serverLogout,
};

export const adminApi = {
  getUsers: () => api.get('/admin/users'),
  setUserRole: (userId: number, role: string) => api.patch(`/admin/users/${userId}/role`, { role }),
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

  getCards: () => api.get('/tester/cards'),

  craftBadge: (skill_area: string) => api.post('/tester/craft-badge', { skill_area }),

  getQuestions: (lectureId: number) => api.get(`/lectures/${lectureId}/questions`),

  submitTest: (lectureId: number, answers: Record<number, string>) =>
    api.post(`/lectures/${lectureId}/submit-test`, { answers }),

  getExplanation: (lectureId: number, questionId: number) =>
    api.get(`/lectures/${lectureId}/question/${questionId}/explanation`),

  submitBaselineSurvey: (data: any) => api.post('/tester/baseline-survey', data),

  submitFinalSurvey: (data: any) => api.post('/tester/final-survey', data),

  buyShopItem: (item_id: string) => api.post('/tester/shop/buy', { item_id }),
};

export const leadApi = {
  getTeam: () => api.get('/lead/team'),

  getBeforeAfter: () => api.get('/lead/before-after'),

  getActivity: () => api.get('/lead/activity'),

  getLectureStats: () => api.get('/lead/lecture-stats'),
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
    results: { item_id: number; status: string }[];
  }) => api.post('/checklists/submit', data),

  getSubmissions: (params?: {
    template_id?: string | number;
    tester?: string;
    content_author?: string;
    verska_author?: string;
    sort?: string;
    offset?: number;
  }) => api.get('/checklists/submissions', { params }),

  getSubmissionDetail: (id: number) => api.get(`/checklists/submissions/${id}`),
  getStats: () => api.get('/checklists/stats'),
  getTaskCounts: () => api.get('/tester/task-counts'),

  getAuthors: () => api.get('/checklists/authors'),

  updateMvtItems: (templateId: number, items: { id: number; in_mvt: number }[]) =>
    api.patch(`/checklists/templates/${templateId}/mvt`, { items }),

  importTemplate: (file: File, name: string, color: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', name);
    fd.append('color', color);
    return api.post('/checklists/templates/import', fd);
  },
};
