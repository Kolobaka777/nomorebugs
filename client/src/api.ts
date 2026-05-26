import axios from 'axios';

const API_BASE = 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: any; needsBaselineSurvey: boolean }>('/auth/login', { email, password }),
};

export const testerApi = {
  getProfile:       () => api.get('/tester/profile'),
  getProfileFull:   () => api.get('/tester/profile-full'),
  updateProfile:    (data: any) => api.put('/tester/profile', data),
  getMetrics:       () => api.get('/tester/metrics'),
  getLectures:      () => api.get('/tester/lectures'),
  getAchievements:  () => api.get('/tester/achievements'),
  getHistory:       () => api.get('/tester/history'),
  getBeforeAfter:   () => api.get('/tester/before-after'),
  getCards:         () => api.get('/tester/cards'),
  craftBadge:       (skill_area: string) => api.post('/tester/craft-badge', { skill_area }),
  getQuestions:     (lectureId: number) => api.get(`/lectures/${lectureId}/questions`),
  submitTest:       (lectureId: number, answers: Record<number, string>) =>
                      api.post(`/lectures/${lectureId}/submit-test`, { answers }),
  getExplanation:   (lectureId: number, questionId: number) =>
                      api.get(`/lectures/${lectureId}/question/${questionId}/explanation`),
  submitBaselineSurvey: (data: any) => api.post('/tester/baseline-survey', data),
  submitFinalSurvey:    (data: any) => api.post('/tester/final-survey', data),
  buyShopItem:          (item_id: string) => api.post('/tester/shop/buy', { item_id }),
};

export const leadApi = {
  getTeam: () => api.get('/lead/team'),
  getBeforeAfter: () => api.get('/lead/before-after'),
  getActivity: () => api.get('/lead/activity'),
};

export const statsApi = {
  getGlobal: () => api.get('/stats'),
};
