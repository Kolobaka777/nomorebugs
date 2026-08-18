// Icon per team-news event type (see types.ts's TeamEventType) — shared
// between NewsPage's full feed and HomePage's lead-facing teaser so the two
// stay visually in sync instead of each page keeping its own copy.
import { IconName } from '../components/Icon';

export const EVENT_ICON: Record<string, IconName> = {
  announcement: 'antenna',
  birthday: 'star',
  member_joined: 'bee',
  guide_published: 'books',
  course_published: 'graduation',
  lecture_video_added: 'camera',
  leave_started: 'bug',
  leave_ended: 'bug',
};
