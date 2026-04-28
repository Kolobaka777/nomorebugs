export interface User {
  id: number;
  email: string;
  name: string;
  role: 'tester' | 'lead';
  avatar_initials: string;
}

export interface Lecture {
  id: number;
  title: string;
  order_num: number;
  skill_area: string;
  score?: number;
  passed?: number;
  status: 'locked' | 'active' | 'passed';
}

export interface Question {
  id: number;
  lecture_id: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  order_num: number;
}

export interface QuestionExplanation {
  question: string;
  correctAnswer: string;
  correctOption: string;
  explanation: string;
  allOptions: {
    a: string;
    b: string;
    c: string;
    d: string;
  };
}

export interface TeamMember {
  id: number;
  name: string;
  lecturesCompleted: number;
  avgScore: number;
  skillGrowth: number;
}

export interface SKillChart {
  skill: string;
  before: number;
  after: number;
  delta: number;
}

export interface ActivityItem {
  id: number;
  action: string;
  created_at: string;
  name: string;
  lecture_title?: string;
}
