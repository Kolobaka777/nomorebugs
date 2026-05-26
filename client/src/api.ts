import axios from 'axios';
import type { Lecture, TeamMember, FullProfile } from './types';

const API_BASE = 'http://localhost:5001/api';

// Mock data for demo
const mockUsers = [
  { id: 1, email: 'lead@qa.com', password: 'lead123', name: 'Alex Lead', role: 'lead', avatar_initials: 'AL' },
  { id: 2, email: 'nazar@qa.com', password: 'test123', name: 'Nazariy Tester', role: 'tester', avatar_initials: 'NT' },
  { id: 3, email: 'gleb@qa.com', password: 'test123', name: 'Gleb Glebov', role: 'tester', avatar_initials: 'GG' },
  { id: 4, email: 'alena@qa.com', password: 'test123', name: 'Alena Expert', role: 'tester', avatar_initials: 'AE' },
  { id: 5, email: 'vasya@qa.com', password: 'test123', name: 'Vasya Novice', role: 'tester', avatar_initials: 'VN' },
];

const mockLectures: Lecture[] = [
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

const mockProfileFull: FullProfile = {
  id: 2,
  email: 'nazar@qa.com',
  name: 'Nazariy Tester',
  avatar_initials: 'NT',
  created_at: '2024-01-01T10:00:00Z',
  nickname: 'Naz',
  status_quote: 'Bug hunter at heart',
  specialization: 'Frontend QA',
  info_box: 'Люблю тестировать и править баги.',
  snail_joke: 'Почему улитка победила жука? Потому что она не знала, что такое баг.',
  avatar_id: 'avatar_1',
  avatar_frame: 'frame_gold',
  profile_bg: 'bg-dots',
  showcase_badges: ['rookie_bugmaster', 'not_snail'],
  favorite_lecture_id: 3,
  is_public: true,
  custom_avatar: null,
  bug_coins: 240,
  purchased_items: ['frame_gold'],
  stats: { int: 7, per: 6, spd: 5, def: 4, bug_pwr: 12 },
  streak: 4,
  cards: [],
  badges: [
    { id: 1, user_id: 2, badge_id: 'rookie_bugmaster', earned_at: '2024-04-20T12:00:00Z' },
  ],
  craftable: ['Console errors', 'CSS reading'],
  favLecture: { id: 3, title: 'Introduction to DevTools', skill_area: 'DevTools', score: 85, completed_at: '2024-04-24T18:40:00Z' },
};

const mockMetrics = {
  lecturesCompleted: 3,
  averageScore: 73,
  skillGrowth: '+2.1',
  weeksRemaining: 7,
};

const mockTeam: TeamMember[] = [
  { id: 2, name: 'Nazariy Tester', avatar_initials: 'NT', lecturesCompleted: 3, avgScore: 73, skillGrowth: 2, daysInactive: 2, isSnail: false },
  { id: 3, name: 'Gleb Glebov', avatar_initials: 'GG', lecturesCompleted: 5, avgScore: 82, skillGrowth: 3, daysInactive: 1, isSnail: false },
  { id: 4, name: 'Alena Expert', avatar_initials: 'AE', lecturesCompleted: 8, avgScore: 92, skillGrowth: 4, daysInactive: 0, isSnail: false },
  { id: 5, name: 'Vasya Novice', avatar_initials: 'VN', lecturesCompleted: 1, avgScore: 60, skillGrowth: 1, daysInactive: 8, isSnail: true },
];

const mockHistory = [
  { id: 1, score: 60, completed_at: '2024-04-20T12:00:00Z', lecture_title: 'HTML Basics & Structure', skill_area: 'HTML structure' },
  { id: 2, score: 75, completed_at: '2024-04-22T14:20:00Z', lecture_title: 'CSS Fundamentals & Layouts', skill_area: 'CSS reading' },
  { id: 3, score: 85, completed_at: '2024-04-24T18:40:00Z', lecture_title: 'Introduction to DevTools', skill_area: 'DevTools' },
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
    await new Promise(resolve => setTimeout(resolve, 500));

    const user = mockUsers.find(u => u.email === email && u.password === password);
    if (!user) {
      throw { response: { data: { error: 'Invalid credentials' } } };
    }

    const token = `mock-jwt-token-${user.id}`;
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
    await new Promise(resolve => setTimeout(resolve, 250));
    const userId = JSON.parse(localStorage.getItem('user') || '{}').id;
    return { data: mockUsers.find(u => u.id === userId) };
  },

  getProfileFull: async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { data: mockProfileFull };
  },

  updateProfile: async (data: any) => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { data: { ...data } };
  },

  getMetrics: async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { data: mockMetrics };
  },

  getLectures: async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { data: mockLectures };
  },

  getAchievements: async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return {
      data: [
        { id: 'rookie_bugmaster', name: 'Юный жуковед', description: 'Первый пройденный тест', earned: true },
        { id: 'not_snail', name: 'Не улитка', description: '3 дня подряд активности', earned: true },
        { id: 'boss_exterminator', name: 'Главный экстерминатор', description: 'Все лекции пройдены', earned: false },
      ],
    };
  },

  getHistory: async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { data: mockHistory };
  },

  getBeforeAfter: async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { data: mockBeforeAfter };
  },

  getCards: async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { data: [] };
  },

  craftBadge: async (skill_area: string) => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { data: { success: true, badge: { id: `crafted_${skill_area}`, name: `Награда за ${skill_area}` } } };
  },

  getQuestions: async (lectureId: number) => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { data: mockQuestions.filter(q => q.lecture_id === lectureId) };
  },

  submitTest: async (lectureId: number, answers: Record<number, string>) => {
    await new Promise(resolve => setTimeout(resolve, 700));
    const score = Math.floor(Math.random() * 40) + 60;
    return { data: { score, passed: score >= 60, lectureId } };
  },

  getExplanation: async (lectureId: number, questionId: number) => {
    await new Promise(resolve => setTimeout(resolve, 250));
    const question = mockQuestions.find(q => q.id === questionId);
    return {
      data: {
        question: question?.question_text || '',
        correctAnswer: 'b',
        correctOption: question?.option_b || '',
        explanation: 'Это пример объяснения правильного ответа в демонстрационной версии.',
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
    await new Promise(resolve => setTimeout(resolve, 250));
    const userId = JSON.parse(localStorage.getItem('user') || '{}').id;
    localStorage.setItem(`baseline_${userId}`, 'true');
    return { data: { success: true } };
  },

  submitFinalSurvey: async (data: any) => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { data: { success: true } };
  },

  buyShopItem: async (item_id: string) => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { data: { success: true, item_id, newCoins: 240 } };
  },
};

export const leadApi = {
  getTeam: async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { data: mockTeam };
  },

  getBeforeAfter: async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { data: mockBeforeAfter };
  },

  getActivity: async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { data: mockActivity };
  },
};

export const statsApi = {
  getGlobal: async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { data: { courses: mockLectures.length, testers: mockUsers.length - 1, bugsCaught: 124 } };
  },
};
