import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

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
    api.post<{
      token: string;
      user: any;
      needsBaselineSurvey: boolean;
    }>('/auth/login', { email, password }),
};

export const testerApi = {
  getProfile: () => api.get('/tester/profile'),
  getMetrics: () => api.get('/tester/metrics'),
  getLectures: () => api.get('/tester/lectures'),
  getQuestions: (lectureId: number) =>
    api.get(`/lectures/${lectureId}/questions`),
  submitTest: (lectureId: number, answers: Record<number, string>) =>
    api.post(`/lectures/${lectureId}/submit-test`, { answers }),
  getExplanation: (lectureId: number, questionId: number) =>
    api.get(
      `/lectures/${lectureId}/question/${questionId}/explanation`
    ),
  submitBaselineSurvey: (data: any) =>
    api.post('/tester/baseline-survey', data),
  submitFinalSurvey: (data: any) =>
    api.post('/tester/final-survey', data),
};

export const leadApi = {
  getTeam: () => api.get('/lead/team'),
  getBeforeAfter: () => api.get('/lead/before-after'),
  getActivity: () => api.get('/lead/activity'),
};
