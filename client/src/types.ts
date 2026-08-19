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

// Server-assigned (see server/src/activityCategories.js). 'other' is what
// an action nobody has categorized yet falls into — visible and uncoloured
// rather than hidden, so a new action type shows up as "we forgot to file
// this" instead of vanishing from a filtered log.
export type ActivityCategory = 'learning' | 'content' | 'admin' | 'account' | 'other';

export interface ActivityItem {
  id: number;
  action: string;
  created_at: string;
  name: string;
  gender?: Gender;
  category?: ActivityCategory;
  lecture_title?: string;
  course_title?: string;
}

export interface ActivityFilters {
  category: string;
  q: string;
  userId: string;
  from: string;
  to: string;
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

// A publicly-shared uploaded avatar (see custom_avatars table /
// GET /api/avatars/gallery) — anyone can pick one as their own avatar_id:
// 'custom' + custom_avatar. Distinct from a private upload, which never
// appears here.
// No `image` field: the listing carries ids only, and the bytes are fetched
// per avatar (see utils/galleryImages.ts). Sending them inline meant up to
// 2.8 MB per row in a single unpaginated response.
export interface GalleryAvatar {
  id: number;
  user_id: number;
  uploader_name: string;
}

export interface FullProfile {
  id: number;
  email: string;
  name: string;
  phone: string | null;
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
  profile_accent_color: string;
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
  cards: UserCard[];
  badges: UserBadge[];
  craftable: string[];
  favLecture: {
    id: number; title: string; skill_area: string;
    score?: number; completed_at?: string;
  } | null;
  lecturesCompleted: number;
  averageScore: number;
  // How many courses/guides this person has ever submitted via the
  // propose-then-approve flow (see PROPOSAL_STATUS_* in api.ts) —
  // "proposed" counts pending+approved+rejected, "approved" is the subset
  // that actually went live.
  coursesProposed: number;
  coursesApproved: number;
  guidesProposed: number;
  guidesApproved: number;
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
  avgScore: number;
}

export interface LectureStat {
  id: number;
  title: string;
  skill_area: string;
  attempts: number;
  avgScore: number | null;
  passRate: number | null;
}

// There is no level system. There used to be a frog life-cycle ladder
// (Икринка → Головастик → Лягушонок → Лягушка → Царь-лягушка) derived from
// the number of completed courses, shown in МояНора, on the team dashboard
// and on public profiles. It was removed on the owner's call: the courses
// completed and the badges earned already say everything a rank did, and a
// derived tier name added a second, vaguer way of ranking people. The raw
// numbers stay where they were; nothing summarises them into a title now.

export const TOPIC_TAGS: Record<string, string> = {
  'HTML': '#66FCF1',
  'CSS': '#7F77DD',
  'DevTools': '#EF9F27',
  'Console': '#e05252',
  'Bug Reports': '#EF9F27',
  'JS': '#7F77DD',
  'Network': '#66FCF1',
  'AIO': '#C5C6C7',
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
export type TeamEventType = 'member_joined' | 'guide_published' | 'course_published' | 'lecture_video_added' | 'birthday' | 'leave_started' | 'leave_ended' | 'announcement';

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
  // Only for 'announcement' — a lead's own post, where the row carries the
  // sentence instead of the client building one (see formatTeamEvent).
  text?: string | null;
}

// ===== SUGGESTION / IDEAS BOARD =====
export type SuggestionType = 'idea' | 'complaint' | 'question';
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
  // Only meaningful for type 'question' — null until a lead answers.
  answer: string | null;
  answered_at: string | null;
  answered_by_name: string | null;
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

// email/phone/gender/bug_coins/purchased_items, the course/guide proposal
// counts ("Мои предложения" — an owner-only panel in MoyaNora too) and the
// course-progress numbers (stats/lecturesCompleted/averageScore) are
// stripped server-side (GET /api/users/:id/profile) for any viewer who isn't
// the profile owner or a lead — contact/personal details, someone else's shop
// balance, what they've proposed and how far along they are have no business
// being visible on a teammate's public profile. Optional here rather than
// a second near-duplicate interface, since every other field is identical
// to FullProfile. role/birthday are new fields the public route adds that
// FullProfile itself doesn't carry.
type PublicOnlyOmittedFields =
  | 'email' | 'phone' | 'gender' | 'bug_coins' | 'purchased_items'
  | 'coursesProposed' | 'coursesApproved' | 'guidesProposed' | 'guidesApproved'
  | 'stats' | 'lecturesCompleted' | 'averageScore';
export type PublicProfile =
  | (Omit<FullProfile, PublicOnlyOmittedFields> &
      Partial<Pick<FullProfile, PublicOnlyOmittedFields>> &
      { role?: string; birthday: string | null; workStart: string | null; workEnd: string | null; workDays: string; timezone: string })
  | PublicProfileHidden;

// ===== FAVORITES & NOTES (profile cabinet) =====
export interface CourseFavorite {
  course_type: 'lecture' | 'custom';
  course_id: number;
  title: string;
  tag: string;
  color?: string;
  totalModules?: number;
  totalLessons?: number;
  totalTests?: number;
  score?: number | null;
  favorited_at: string;
}

export interface CourseNote {
  id: number;
  lesson_id: number | null;
  lesson_title: string;
  module_title: string | null;
  text: string;
  created_at: string;
}

export interface CourseNoteGroup {
  course_id: number;
  title: string;
  tag: string;
  color: string;
  notes: CourseNote[];
}

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
  1: 'Головастик',
  2: 'Головастик',
  3: 'Лягушка',
  4: 'Лягушка',
  5: 'Матёрая',
  6: 'Матёрая',
  7: 'Матёрая',
  8: 'Матёрая',
  9: 'Матёрая',
  10: 'Матёрая',
};
