export interface ChecklistItem {
  id: number;
  category: string;
  text: string;
  order_num: number;
  in_mvt?: number;
}

export interface Template {
  id: number;
  name: string;
  task_type: string;
  color: string;
  items: ChecklistItem[];
  mvt_updated_at?: string | null;
}

export type Status = 'ok' | 'fail' | 'na';
export type CheckMode = 'mvt' | 'full';

export const STATUS_LABELS: Record<Status, string> = { ok: 'Ок', fail: 'Ошибка', na: '-' };
export const STATUS_COLORS: Record<Status, string> = { ok: '#66FCF1', fail: '#e05252', na: 'rgba(197, 198, 199,0.35)' };

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
export const catColor = (cat: string) => CATEGORY_COLORS[cat] || '#7F77DD';

export const TASK_TYPE_OPTIONS = [
  'PN: Teaser',
  'PN: Advertorial',
  'PN: Expert',
  'PN: Long-read',
  'P: Custom',
  'P: Native',
  'P: Long-read',
  'P: Review',
];
