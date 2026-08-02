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
  video_url?: string | null;
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

export type Gender = 'male' | 'female' | null;

export interface TeamMember {
  id: number;
  name: string;
  avatar_initials: string;
  gender?: Gender;
  lecturesCompleted: number;
  avgScore: number;
  skillGrowth: number;
  daysInactive: number;
  needsCheckIn: boolean;
  lastActive?: string;
  fastAnswers: number;
  tabSwitches: number;
  // Optional, not just documentation — the server has shipped a build that
  // doesn't send these yet more than once (a stale/rolled-back deploy), and
  // marking them required here type-checked clean while UleyPage.tsx still
  // crashed at runtime on `.length` of an undefined value. Optional forces
  // every consumer to actually handle the missing case.
  lead_note?: string;
  taskCounts?: { name: string; task_type: string; color: string; count: number }[];
}

export interface SKillChart {
  skill: string;
  before: number;
  after: number;
  delta: number;
}

export interface TesterSkillBreakdown {
  id: number;
  name: string;
  skills: { skill: string; before: number | null; after: number | null; delta: number | null }[];
}

export interface ActivityItem {
  id: number;
  action: string;
  created_at: string;
  name: string;
  gender?: Gender;
  lecture_title?: string;
}

export interface RpgStats {
  int: number;     // 0-10
  per: number;     // 0-10
  spd: number;     // 0-10
  def: number;     // 0-10
  bug_pwr: number; // 0-20
}

export interface UserCard {
  id: number;
  user_id: number;
  lecture_id: number;
  skill_area: string;
  rarity: 'common' | 'rare' | 'epic';
  earned_at: string;
  lecture_title?: string;
}

export interface UserBadge {
  id: number;
  user_id: number;
  badge_id: string; // skill_area
  earned_at: string;
}

export interface BlockProgress {
  skill_area: string;
  total: number;
  collected: number;
}

export interface FullProfile {
  id: number;
  email: string;
  name: string;
  avatar_initials: string;
  created_at: string;
  // customizable
  nickname: string;
  status_quote: string;
  specialization: string;
  info_box: string;
  snail_joke: string;
  avatar_id: string;
  avatar_frame: string;
  profile_bg: string;
  showcase_badges: string[];
  favorite_lecture_id: number | null;
  is_public: boolean;
  custom_avatar: string | null;
  gender: Gender;
  // currency
  bug_coins: number;
  purchased_items: string[];
  // computed
  stats: RpgStats;
  streak: number;
  cards: UserCard[];
  badges: UserBadge[];
  craftable: string[];
  favLecture: {
    id: number; title: string; skill_area: string;
    score?: number; completed_at?: string;
  } | null;
}

export interface TestHistoryItem {
  id: number;
  score: number;
  completed_at: string;
  lecture_title: string;
  skill_area: string;
}

export interface GlobalStats {
  courses: number;
  testers: number;
  bugsCaught: number;
}

export interface LectureStat {
  id: number;
  title: string;
  skill_area: string;
  attempts: number;
  avgScore: number | null;
  passRate: number | null;
}

// ===== LEVEL SYSTEM =====
export interface Level {
  icon: string;
  name: string;
  color: string;
  minCompleted: number;
  maxCompleted: number;
}

export function getLevel(completed: number, isLead = false): Level {
  if (isLead) return { icon: 'crown', name: 'Королева улья', color: 'text-amber', minCompleted: 0, maxCompleted: 10 };
  if (completed === 0) return { icon: 'seedling', name: 'Яйцо', color: 'text-pixel/60', minCompleted: 0, maxCompleted: 1 };
  if (completed <= 2) return { icon: 'bug', name: 'Личинка', color: 'text-pixel', minCompleted: 1, maxCompleted: 3 };
  if (completed <= 5) return { icon: 'gear', name: 'Куколка', color: 'text-purple', minCompleted: 3, maxCompleted: 6 };
  if (completed <= 9) return { icon: 'bug', name: 'Жук', color: 'text-primary', minCompleted: 6, maxCompleted: 10 };
  return { icon: 'crown', name: 'Матёрый жук', color: 'text-amber', minCompleted: 10, maxCompleted: 10 };
}

export function getLevelXpPercent(completed: number): number {
  if (completed === 0) return 0;
  if (completed <= 2) return ((completed - 0) / 2) * 100;
  if (completed <= 5) return ((completed - 2) / 3) * 100;
  if (completed <= 9) return ((completed - 5) / 4) * 100;
  return 100;
}

export const TOPIC_TAGS: Record<string, string> = {
  'HTML': '#1D9E75',
  'CSS': '#7F77DD',
  'DevTools': '#EF9F27',
  'Console': '#e05252',
  'Bug Reports': '#EF9F27',
  'JS': '#7F77DD',
  'Network': '#1D9E75',
  'AIO': '#e8e8d0',
};

// ===== PRESENCE ("работают сейчас") =====
export type LeaveType = 'vacation' | 'sick' | 'day_off' | 'other';
export type PresenceStatus = 'active' | 'remote' | 'other';

export interface PresenceEntry {
  id: number;
  name: string;
  avatar_initials: string;
  gender: Gender;
  status: PresenceStatus;
  workStart: string | null;
  workEnd: string | null;
  workDays: string;
  timezone: string;
  birthday: string | null; // 'MM-DD', year deliberately not collected
  isWorkingNow: boolean | null; // null = hours not configured yet
  currentLeave: { id: number; type: LeaveType; end_date: string | null; note: string } | null;
}

// ===== TEAM NEWS FEED =====
export type TeamEventType = 'member_joined' | 'guide_published' | 'course_published' | 'lecture_video_added' | 'birthday' | 'leave_started' | 'leave_ended';

export interface TeamNewsItem {
  id: number | string;
  event_type: TeamEventType;
  created_at: string;
  user_id: number;
  name: string;
  avatar_initials: string;
  gender: Gender;
  guide_title?: string | null;
  course_title?: string | null;
  lecture_title?: string | null;
  leave_type?: LeaveType;
}

// ===== SUGGESTION / IDEAS BOARD =====
export type SuggestionType = 'idea' | 'suggestion' | 'complaint';
export type SuggestionStatus = 'new' | 'reviewed' | 'implemented' | 'declined';

export interface Suggestion {
  id: number;
  type: SuggestionType;
  text: string;
  status: SuggestionStatus;
  created_at: string;
  is_anonymous: boolean;
  user_id: number | null; // null when anonymous and viewer isn't a lead
  author_name: string | null;
  likeCount: number;
  likedByMe: boolean;
  // Lead-only — never present in a tester's view of the list.
  folder_id?: number | null;
  folder_name?: string | null;
}

export interface PublicProfileHidden {
  id: number;
  name: string;
  avatar_initials: string;
  avatar_id: string;
  avatar_frame: string;
  custom_avatar: string | null;
  is_public: false;
}

export type PublicProfile =
  | (FullProfile & { workStart: string | null; workEnd: string | null; workDays: string; timezone: string })
  | PublicProfileHidden;

export interface SuggestionFolder {
  id: number;
  name: string;
  created_by: number;
  created_at: string;
}

// ===== COURSE DEADLINE OVERRIDES =====
export interface CourseDeadlineOverride {
  user_id: number;
  name: string;
  deadline_at: string;
  reason: string;
}

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Личинка',
  2: 'Личинка',
  3: 'Жук',
  4: 'Жук',
  5: 'Матёрый',
  6: 'Матёрый',
  7: 'Матёрый',
  8: 'Матёрый',
  9: 'Матёрый',
  10: 'Матёрый',
};
