export interface Template {
  id: number;
  name: string;
  task_type: string;
  color: string;
  order_num: number;
  items: { id: number; category: string; text: string; order_num: number }[];
}

export interface Stats {
  byTemplate: { id: number; name: string; color: string; submissions: number }[];
  topFails: { item_text: string; category: string; template_name: string; color: string; fail_count: number; total_checks: number }[];
  byTester: { tester_name: string; avatar_initials: string; submissions: number; bugs_found: number }[];
  byContentAuthor: { content_author: string; submissions: number; bugs_found: number }[];
  byVerskaAuthor: { verska_author: string; submissions: number; bugs_found: number }[];
}

export interface Submission {
  id: number; task_name: string; content_author: string; verska_author: string;
  task_type: string; check_date: string; submitted_at: string;
  tester_name: string; avatar_initials: string;
  template_name: string; color: string; fail_count: number; total_items: number;
}

export interface SubmissionDetail extends Submission {
  results: { status: string; text: string; category: string; order_num: number; note?: string }[];
}

export type Tab = 'checklists' | 'history' | 'stats';
export type StatsTab = 'fails' | 'testers' | 'content' | 'verska';

export const CATEGORY_COLORS: Record<string, string> = {
  'Критически важно!': '#e05252',
  'Визуал': '#7F77DD',
  'Функционал': '#66FCF1',
  'Ссылки': '#EF9F27',
  'Картинки': '#4fc3f7',
  'Пунктуация': '#ff8a65',
  'Смысловая нагрузка': '#a5d6a7',
  'Квитанция': '#ce93d8',
  'Комментарии': '#80deea',
  'Новые проверки': '#ffcc02',
};
export const catColor = (cat: string) => CATEGORY_COLORS[cat] || '#66FCF1';

export const MODAL_COLORS = ['#66FCF1', '#7F77DD', '#EF9F27', '#e05252', '#4fc3f7', '#ff8a65'];

export const EXPORT_COLUMNS: { key: keyof Submission; label: string }[] = [
  { key: 'tester_name', label: 'Тестировщик' },
  { key: 'template_name', label: 'Чеклист' },
  { key: 'task_type', label: 'Тип задачи' },
  { key: 'task_name', label: 'Задача' },
  { key: 'content_author', label: 'Автор контента' },
  { key: 'verska_author', label: 'Автор вёрстки' },
  { key: 'check_date', label: 'Дата проверки' },
  { key: 'submitted_at', label: 'Дата отправки' },
];
