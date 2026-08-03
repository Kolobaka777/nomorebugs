export interface BQuestion {
  _id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_idx: number;
  explanation: string;
}

export type PrerequisiteType = 'none' | 'optional' | 'mandatory';

export interface BLesson {
  _id: string;
  title: string;
  type: 'lesson' | 'quiz';
  content: string;
  questions: BQuestion[];
  // 'none': always accessible. 'optional': a non-blocking recommendation
  // (e.g. external reading we can't verify was done) shown as a hint but
  // never gates access. 'mandatory': blocks access until the referenced
  // lesson (prerequisite_lesson_local_id, a draft _id — resolved to a real
  // DB id server-side on save) is completed.
  prerequisite_type: PrerequisiteType;
  prerequisite_lesson_local_id?: string;
  prerequisite_note?: string;
}

export interface BModule {
  _id: string;
  title: string;
  lessons: BLesson[];
}

export interface FormState {
  title: string;
  description: string;
  tag: string;
  color: string;
  requirements: string;
  deadline_at: string; // 'YYYY-MM-DD', empty = no deadline
  modules: BModule[];
}

export const uid = () => Math.random().toString(36).slice(2);

export const PRESET_COLORS = [
  { name: 'Зелёный', value: '#1D9E75' },
  { name: 'Фиолетовый', value: '#7F77DD' },
  { name: 'Янтарный', value: '#EF9F27' },
  { name: 'Красный', value: '#e05252' },
  { name: 'Синий', value: '#4A90D9' },
];

export const TAGS = ['HTML', 'CSS', 'DevTools', 'Console', 'Responsive', 'Network', 'JS', 'Bug Reports', 'Advanced', 'Custom'];

export function emptyQuestion(): BQuestion {
  return { _id: uid(), question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_idx: 0, explanation: '' };
}

export function emptyLesson(type: 'lesson' | 'quiz' = 'lesson'): BLesson {
  return { _id: uid(), title: '', type, content: '', questions: type === 'quiz' ? [emptyQuestion()] : [], prerequisite_type: 'none' };
}

export function emptyModule(): BModule {
  return { _id: uid(), title: '', lessons: [emptyLesson()] };
}
