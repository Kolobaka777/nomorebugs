import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

// Mock data for demo
const mockUsers = [
  { id: 1, email: 'lead@qa.com', name: 'Alex Lead', role: 'lead', avatar_initials: 'AL' },
  { id: 2, email: 'nazar@qa.com', name: 'Nazariy Tester', role: 'tester', avatar_initials: 'NT' },
  { id: 3, email: 'gleb@qa.com', name: 'Gleb Glebov', role: 'tester', avatar_initials: 'GG' },
  { id: 4, email: 'alena@qa.com', name: 'Alena Expert', role: 'tester', avatar_initials: 'AE' },
  { id: 5, email: 'vasya@qa.com', name: 'Vasya Novice', role: 'tester', avatar_initials: 'VN' },
];

const mockLectures = [
  { id: 1, title: 'HTML Basics & Structure', order_num: 1, skill_area: 'HTML structure', score: 60, passed: 1, status: 'passed' },
  { id: 2, title: 'CSS Fundamentals & Layouts', order_num: 2, skill_area: 'CSS reading', score: 75, passed: 1, status: 'passed' },
  { id: 3, title: 'Introduction to DevTools', order_num: 3, skill_area: 'DevTools', score: 85, passed: 1, status: 'passed' },
  { id: 4, title: 'Browser Console & Errors', order_num: 4, skill_area: 'Console errors', status: 'active' },
  { id: 5, title: 'Responsive Design Testing', order_num: 5, skill_area: 'HTML structure', status: 'locked' },
  { id: 6, title: 'CSS Debugging & Inspection', order_num: 6, skill_area: 'CSS reading', status: 'locked' },
  { id: 7, title: 'Network Tab & Performance', order_num: 7, skill_area: 'DevTools', status: 'locked' },
  { id: 8, title: 'JavaScript Basics for QA', order_num: 8, skill_area: 'Console errors', status: 'locked' },
  { id: 9, title: 'Bug Reporting & Documentation', order_num: 9, skill_area: 'Bug report quality', status: 'locked' },
  { id: 10, title: 'Advanced Testing Scenarios', order_num: 10, skill_area: 'Bug report quality', status: 'locked' },
];

const mockQuestions = [
  {
    id: 1,
    lecture_id: 4,
    question_text: 'What does console.error() display?',
    option_a: 'Warning message',
    option_b: 'Error message in red',
    option_c: 'Debug info',
    option_d: 'Success message',
    order_num: 1,
  },
  {
    id: 2,
    lecture_id: 4,
    question_text: 'How do you access the global window object in console?',
    option_a: 'Type "window"',
    option_b: 'Type "global"',
    option_c: 'Type "this"',
    option_d: 'All of the above',
    order_num: 2,
  },
];

const mockMetrics = {
  lecturesCompleted: 3,
  averageScore: 73,
  skillGrowth: '+2.1',
  weeksRemaining: 7,
};

const mockTeam = [
  { id: 2, name: 'Nazariy Tester', lecturesCompleted: 3, avgScore: 73, skillGrowth: 2 },
  { id: 3, name: 'Gleb Glebov', lecturesCompleted: 5, avgScore: 82, skillGrowth: 3 },
  { id: 4, name: 'Alena Expert', lecturesCompleted: 8, avgScore: 92, skillGrowth: 4 },
  { id: 5, name: 'Vasya Novice', lecturesCompleted: 1, avgScore: 60, skillGrowth: 1 },
];

const mockBeforeAfter = [
  { skill: 'HTML Structure', before: 2, after: 4, delta: 2 },
  { skill: 'CSS Reading', before: 2, after: 4, delta: 2 },
  { skill: 'DevTools', before: 1, after: 3, delta: 2 },
  { skill: 'Console Errors', before: 1, after: 3, delta: 2 },
  { skill: 'Bug Report Quality', before: 2, after: 4, delta: 2 },
];

const mockActivity = [
  { id: 1, action: 'passed_lecture', created_at: '2024-01-15T10:30:00Z', name: 'Nazariy Tester', lecture_title: 'Introduction to DevTools' },
  { id: 2, action: 'passed_lecture', created_at: '2024-01-14T14:20:00Z', name: 'Gleb Glebov', lecture_title: 'Responsive Design Testing' },
  { id: 3, action: 'passed_lecture', created_at: '2024-01-13T09:15:00Z', name: 'Alena Expert', lecture_title: 'JavaScript Basics for QA' },
];

// Mock API responses
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

// Override API calls with mock data
export const authApi = {
  login: async (email: string, password: string) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const user = mockUsers.find(u => u.email === email);
    if (!user || password !== 'test123') {
      throw { response: { data: { error: 'Invalid credentials' } } };
    }

    const token = 'mock-jwt-token-' + user.id;
    const needsBaselineSurvey = user.role === 'tester' && !localStorage.getItem(`baseline_${user.id}`);

    return {
      data: {
        token,
        user,
        needsBaselineSurvey,
      },
    };
  },
};

export const testerApi = {
  getProfile: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    const userId = JSON.parse(localStorage.getItem('user') || '{}').id;
    const user = mockUsers.find(u => u.id === userId);
    return { data: user };
  },

  getMetrics: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { data: mockMetrics };
  },

  getLectures: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { data: mockLectures };
  },

  getQuestions: async (lectureId: number) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { data: mockQuestions };
  },

  submitTest: async (lectureId: number, answers: Record<number, string>) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const score = Math.floor(Math.random() * 40) + 60; // 60-100
    return { data: { score, passed: score >= 60 } };
  },

  getExplanation: async (lectureId: number, questionId: number) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    const question = mockQuestions.find(q => q.id === questionId);
    return {
      data: {
        question: question?.question_text || '',
        correctAnswer: 'b',
        correctOption: question?.option_b || '',
        explanation: 'This is the correct explanation for the question.',
        allOptions: {
          a: question?.option_a || '',
          b: question?.option_b || '',
          c: question?.option_c || '',
          d: question?.option_d || '',
        },
      },
    };
  },

  submitBaselineSurvey: async (data: any) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const userId = JSON.parse(localStorage.getItem('user') || '{}').id;
    localStorage.setItem(`baseline_${userId}`, 'true');
    return { data: { success: true } };
  },

  submitFinalSurvey: async (data: any) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    return { data: { success: true } };
  },
};

export const leadApi = {
  getTeam: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { data: mockTeam };
  },

  getBeforeAfter: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { data: mockBeforeAfter };
  },

  getActivity: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { data: mockActivity };
  },
};
