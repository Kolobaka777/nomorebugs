// Profile customization (self-service + viewing a teammate's public
// profile) and trading cards/badges. Split out from the old monolithic
// app.js — see PROGRESS.md.
import express from 'express';
import { db } from '../../db/schema.js';
import { logError } from '../sentry.js';
import { authMiddleware } from '../auth.js';
import { parseDbDate, awardAchievement, ACHIEVEMENT_IDS, displayName, logActivity, canSeeCourse, toPositiveInt } from '../routeHelpers.js';
import { entitlements, cosmeticAllowed, LEGACY_AVATARS, SKILL_BADGES, DEFAULT_AVATAR_ID } from '../entitlements.js';

const router = express.Router();

// What a freshly crafted badge announces it unlocks. Display only —
// entitlements.js is what actually decides whether a frame or a
// background may be worn, and SKILL_BADGES there is the canonical list
// of the five craftable badges these keys must stay in step with (a test
// asserts they do).
const BADGE_UNLOCKS = {
  'HTML structure':      { frame: 'code',        bg: 'forest',  spec: 'HTML-жук' },
  'CSS reading':         { frame: 'rainbow',      bg: 'console', spec: 'CSS-жук' },
  'DevTools':            { frame: 'glitch',       bg: 'console', spec: 'DevTools-жук' },
  'Console errors':      { frame: 'code',         bg: 'console', spec: 'Консольный жук' },
  'Bug report quality':  { frame: 'crimescene',   bg: 'hive',    spec: 'Жук-репортёр' },
};

// Shared by the self-service profile route and the public-profile route
// (GET /api/users/:id/profile, below) — same RPG-stats/cards/badges
// computation regardless of whose profile is being built.
function buildFullProfile(userId) {
  const user = db.prepare('SELECT id, email, name, phone, avatar_initials, created_at FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId) || {};

  // RPG stats
  const totalTests    = db.prepare('SELECT COUNT(*) as c FROM test_results WHERE user_id = ?').get(userId)?.c || 0;
  const avgScore      = db.prepare('SELECT AVG(score) as a FROM test_results WHERE user_id = ?').get(userId)?.a || 0;
  const highScore     = db.prepare('SELECT COUNT(*) as c FROM test_results WHERE user_id = ? AND score >= 80').get(userId)?.c || 0;
  const passedCount   = db.prepare('SELECT COUNT(*) as c FROM test_results WHERE user_id = ? AND score >= 60').get(userId)?.c || 0;

  const joined      = parseDbDate(user.created_at);
  const weeksActive = Math.max(1, Math.round((Date.now() - joined.getTime()) / (1000 * 60 * 60 * 24 * 7)));

  const stats = {
    int:     Math.min(10, Math.round(avgScore / 10)),
    per:     Math.min(10, Math.round((highScore / Math.max(1, totalTests)) * 10)),
    spd:     Math.min(10, Math.round((passedCount / weeksActive) * 1.5)),
    def:     Math.min(10, Math.round((passedCount / Math.max(1, totalTests)) * 10)),
    bug_pwr: Math.min(20, totalTests * 2),
  };

  // Cards & badges
  const cards  = db.prepare('SELECT * FROM user_cards WHERE user_id = ? ORDER BY earned_at DESC').all(userId);
  const badges = db.prepare('SELECT * FROM user_badges WHERE user_id = ?').all(userId);

  // Craftable: all cards for a skill_area but badge not yet crafted
  const craftable = db.prepare(`
    SELECT uc.skill_area, COUNT(*) as card_count,
           (SELECT COUNT(*) FROM lectures WHERE skill_area = uc.skill_area) as total
    FROM user_cards uc WHERE uc.user_id = ?
    GROUP BY uc.skill_area
  `).all(userId)
    .filter(r => r.card_count >= r.total && !badges.find(b => b.badge_id === r.skill_area))
    .map(r => r.skill_area);

  // Favorite lecture detail
  let favLecture = null;
  if (profile.favorite_lecture_id) {
    favLecture = db.prepare(`
      SELECT l.id, l.title, l.skill_area, tr.score, tr.completed_at
      FROM lectures l LEFT JOIN test_results tr ON tr.lecture_id = l.id AND tr.user_id = ?
      WHERE l.id = ?
    `).get(userId, profile.favorite_lecture_id);
  }

  // Same "lectures passed" definition testerApi.getMetrics() uses (score >=
  // 60) — reused here so a colleague's public profile and the owner's own
  // cabinet agree on what "completed" means, instead of a second, possibly
  // drifting definition.
  const lecturesCompleted = db.prepare('SELECT COUNT(*) as c FROM test_results WHERE user_id = ? AND score >= 60').get(userId)?.c || 0;
  const averageScore = Math.round(avgScore) || 0;

  // How many courses/guides this person has ever submitted through the
  // propose-then-approve flow (routes/courses.js, routes/knowledge.js) —
  // proposal_status is only ever set on a row that went through that flow,
  // so counting non-null covers pending/approved/rejected alike regardless
  // of outcome. "Approved" is broken out separately since "proposed" and
  // "got published" are different things worth showing distinctly.
  const coursesProposed = db.prepare("SELECT COUNT(*) as c FROM custom_courses WHERE created_by = ? AND proposal_status IS NOT NULL").get(userId)?.c || 0;
  const coursesApproved = db.prepare("SELECT COUNT(*) as c FROM custom_courses WHERE created_by = ? AND proposal_status = 'approved'").get(userId)?.c || 0;
  const guidesProposed = db.prepare("SELECT COUNT(*) as c FROM guides WHERE created_by = ? AND proposal_status IS NOT NULL").get(userId)?.c || 0;
  const guidesApproved = db.prepare("SELECT COUNT(*) as c FROM guides WHERE created_by = ? AND proposal_status = 'approved'").get(userId)?.c || 0;

  return {
    ...user,
    nickname:           profile.nickname    || user.name,
    status_quote:       profile.status_quote || '',
    specialization:     profile.specialization || '',
    info_box:           profile.info_box     || '',
    snail_joke:         profile.snail_joke   || '',
    avatar_id:          profile.avatar_id || DEFAULT_AVATAR_ID,
    avatar_frame:       profile.avatar_frame || 'default',
    profile_bg:         profile.profile_bg   || 'default',
    profile_accent_color: profile.profile_accent_color || '#66FCF1',
    showcase_badges:    JSON.parse(profile.showcase_badges || '[]'),
    gender:             profile.gender || null,
    favorite_lecture_id: profile.favorite_lecture_id || null,
    is_public:          profile.is_public !== undefined ? !!profile.is_public : true,
    custom_avatar:      profile.custom_avatar || null,
    bug_coins:          profile.bug_coins    || 0,
    purchased_items:    JSON.parse(profile.purchased_items || '[]'),
    stats, cards, badges, craftable, favLecture,
    lecturesCompleted, averageScore,
    coursesProposed, coursesApproved, guidesProposed, guidesApproved,
  };
}

router.get('/api/tester/profile-full', authMiddleware, (req, res) => {
  try {
    res.json(buildFullProfile(req.user.id));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Viewing a teammate's profile. Lead/admin always get the full view (they
// already see everything else about a tester); anyone else gets it only if
// the owner has left their profile public, otherwise just enough to
// recognize the person (avatar + name) plus an explicit "hidden" flag — no
// activity_log history is ever included here, public or not; that stays
// lead-only (/api/lead/activity) or own-cabinet-only (/api/me/activity).
router.get('/api/users/:id/profile', authMiddleware, (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const target = db.prepare('SELECT id, name, avatar_initials, role, archived_at FROM users WHERE id = ?').get(targetId);
    if (!target || target.archived_at) return res.status(404).json({ error: 'Пользователь не найден' });

    const profileRow = db.prepare('SELECT is_public, avatar_id, avatar_frame, custom_avatar, birthday, work_start, work_end, work_days, timezone FROM user_profiles WHERE user_id = ?').get(targetId) || {};
    const isPublic = profileRow.is_public !== undefined ? !!profileRow.is_public : true;
    const isSelf = targetId === req.user.id;
    const isLead = req.user.role === 'lead' || req.user.role === 'admin';

    if (!isSelf && !isLead && !isPublic) {
      return res.json({
        id: target.id,
        name: target.name,
        avatar_initials: target.avatar_initials,
        avatar_id: profileRow.avatar_id || DEFAULT_AVATAR_ID,
        avatar_frame: profileRow.avatar_frame || 'default',
        custom_avatar: profileRow.custom_avatar || null,
        is_public: false,
      });
    }

    const full = buildFullProfile(targetId);
    if (!full) return res.status(404).json({ error: 'Пользователь не найден' });

    // Self/lead get everything buildFullProfile computes (leads already see
    // contact info elsewhere, e.g. /api/lead/team). A regular teammate
    // viewing a public profile does not — email/phone/gender are contact/
    // personal details unrelated to "how's this person doing"; bug_coins/
    // purchased_items are the shop-balance equivalent of showing someone
    // else your wallet; coursesProposed/coursesApproved/guidesProposed/
    // guidesApproved are "Мои предложения" — MoyaNora's own explicitly
    // owner-only panel, so it stays owner-only here too. These were
    // previously sent to every teammate viewer regardless (just never
    // rendered client-side, which isn't the same as actually private) —
    // stripped here instead.
    //
    // How far along someone is joins that list: stats (the int/per/spd/def/
    // bug_pwr bars), lecturesCompleted and averageScore are their own
    // progress through the courses, and a teammate's page is not a
    // scoreboard. They stay in the owner's own cabinet (МояНора, via
    // /api/tester/profile-full) and in the lead's team view, which is what
    // the "how's this person doing" question actually exists for.
    const payload = isSelf || isLead
      ? full
      : (({
          email, phone, gender, bug_coins, purchased_items,
          coursesProposed, coursesApproved, guidesProposed, guidesApproved,
          stats, lecturesCompleted, averageScore,
          ...rest
        }) => rest)(full);

    res.json({
      ...payload,
      role: target.role,
      birthday: profileRow.birthday || null,
      workStart: profileRow.work_start || null,
      workEnd: profileRow.work_end || null,
      workDays: profileRow.work_days || '1,2,3,4,5',
      timezone: profileRow.timezone || 'Europe/Moscow',
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/tester/profile', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const {
      nickname, status_quote, specialization, info_box, snail_joke,
      avatar_id, avatar_frame, profile_bg, showcase_badges,
      favorite_lecture_id, is_public, custom_avatar, gender,
      profile_accent_color,
    } = req.body;

    if (nickname && nickname.length > 40)   return res.status(400).json({ error: 'Ник слишком длинный (макс 40)' });
    if (status_quote && status_quote.length > 60) return res.status(400).json({ error: 'Цитата слишком длинная (макс 60)' });
    if (info_box && info_box.length > 200)  return res.status(400).json({ error: 'Инфобокс слишком длинный (макс 200)' });
    if (gender !== undefined && gender !== null && gender !== 'male' && gender !== 'female') {
      return res.status(400).json({ error: 'Некорректное значение пола' });
    }
    // Free personal accent color, no shop gate — just a plain hex sanity
    // check so a malformed value can't silently break every inline style
    // that interpolates it (course-page-style `${color}18` alpha suffixes).
    if (profile_accent_color !== undefined && profile_accent_color !== null && !/^#[0-9a-fA-F]{6}$/.test(profile_accent_color)) {
      return res.status(400).json({ error: 'Некорректный цвет' });
    }
    // The client already enforces a 2MB cap before upload, but that's
    // trivially bypassable via a direct API call — base64 inflates the
    // original bytes by ~4/3, so allow a bit of headroom above the raw
    // 2MB target instead of the client's exact threshold. Avatars are
    // stored as base64 directly in the DB (a known, accepted trade-off
    // until they move to real file storage), so this is the only thing
    // standing between an unbounded string and the users table bloating.
    const MAX_AVATAR_BASE64_CHARS = 2.8 * 1024 * 1024;
    if (custom_avatar && custom_avatar.length > MAX_AVATAR_BASE64_CHARS) {
      return res.status(400).json({ error: 'Аватар слишком большой (макс 2 MB)' });
    }

    // Nothing may be worn that was not bought or earned. Without this the
    // shop was ornamental: a plain profile save carrying avatar_frame:
    // 'rainbow' equipped the 350-coin frame for a tester holding zero coins,
    // and the same for every priced background. The rule lives in
    // entitlements.js and is the same one the profile page reads to draw its
    // locks, so the lock a person sees and the check they hit agree.
    //
    // Whatever the account already wears stays wearable — see cosmeticAllowed.
    const owned = entitlements(userId);
    // Everything the account already has, so an absent field can keep its
    // value instead of being blanked — see the `keep` helper below.
    const current = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId) || {};

    if (!cosmeticAllowed(owned.frames, avatar_frame, current.avatar_frame)) {
      return res.status(403).json({ error: 'Эта рамка ещё не открыта' });
    }
    if (!cosmeticAllowed(owned.bgs, profile_bg, current.profile_bg)) {
      return res.status(403).json({ error: 'Этот фон ещё не открыт' });
    }
    // 'custom' is valid whenever the account actually has an uploaded image,
    // and the legacy bug sprites stay valid for accounts that still carry one.
    const avatarExtras = [...LEGACY_AVATARS, ...(custom_avatar || current.custom_avatar ? ['custom'] : [])];
    if (!cosmeticAllowed(owned.avatars, avatar_id, current.avatar_id, avatarExtras)) {
      return res.status(403).json({ error: 'Этот аватар ещё не открыт' });
    }

    // A field this request did not mention keeps the value it already had.
    //
    // This used to overwrite all fifteen columns from whatever the body
    // happened to contain, which made every partial caller destructive: the
    // profile page equips a frame by sending {avatar_frame}, and that one
    // request wiped the nickname, the status quote, the specialization, the
    // info box, gender, the accent colour, the background, the showcase
    // badges and the uploaded avatar, and flipped a public profile private —
    // all with a 200 and no warning. Buying a frame did it too, so a 350-coin
    // purchase erased the profile it was bought for. The nickname is what
    // every list in the app shows (see displayName), so it went from the news
    // feed, the team page and the ratings at the same time.
    //
    // `undefined` means absent, so it keeps the old value. An explicit null
    // or empty string still clears the field — that is how the edit modal
    // empties one on purpose.
    const keep = (incoming, existing) => (incoming === undefined ? existing : (incoming || null));

    db.prepare(`
      INSERT INTO user_profiles
        (user_id, nickname, status_quote, specialization, info_box, snail_joke,
         avatar_id, avatar_frame, profile_bg, showcase_badges, favorite_lecture_id, is_public, custom_avatar, gender, profile_accent_color)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET
        nickname            = excluded.nickname,
        status_quote        = excluded.status_quote,
        specialization      = excluded.specialization,
        info_box            = excluded.info_box,
        snail_joke          = excluded.snail_joke,
        avatar_id           = excluded.avatar_id,
        avatar_frame        = excluded.avatar_frame,
        profile_bg          = excluded.profile_bg,
        showcase_badges     = excluded.showcase_badges,
        favorite_lecture_id = excluded.favorite_lecture_id,
        is_public           = excluded.is_public,
        custom_avatar       = excluded.custom_avatar,
        gender              = excluded.gender,
        profile_accent_color = excluded.profile_accent_color
    `).run(
      userId,
      keep(nickname, current.nickname),
      keep(status_quote, current.status_quote),
      keep(specialization, current.specialization),
      keep(info_box, current.info_box),
      keep(snail_joke, current.snail_joke),
      avatar_id || current.avatar_id || DEFAULT_AVATAR_ID,
      avatar_frame || current.avatar_frame || 'default',
      profile_bg || current.profile_bg || 'default',
      showcase_badges === undefined
        ? (current.showcase_badges || '[]')
        : JSON.stringify(showcase_badges || []),
      keep(favorite_lecture_id, current.favorite_lecture_id),
      is_public === undefined ? (current.is_public ? 1 : 0) : (is_public ? 1 : 0),
      keep(custom_avatar, current.custom_avatar),
      keep(gender, current.gender),
      profile_accent_color || current.profile_accent_color || '#66FCF1',
    );

    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Public avatar gallery ──────────────────────────────────────────────────
// A user's own upload (user_profiles.custom_avatar, set via the PUT above)
// stays exactly what it always was: visible only wherever *their* avatar
// renders, and never selectable by anyone else. Publishing here is a
// separate, explicit opt-in — it copies the image into this shared table so
// other testers can pick "the same picture" as their own avatar too (via
// the normal PUT above, avatar_id: 'custom' + custom_avatar: <these bytes>
// — picking a gallery entry is indistinguishable from uploading it
// yourself, deliberately: no new avatar_id format, every existing avatar-
// rendering call site needs zero changes). Deleting a gallery entry only
// removes it from the picker; anyone who already picked it keeps their own
// independent copy.
const MAX_AVATAR_BASE64_CHARS = 2.8 * 1024 * 1024; // same cap as custom_avatar above

// The gallery listing carries no image data at all.
//
// It used to select ca.image for every row with no limit — each one up to
// 2.8 MB of base64, so twenty uploaded avatars meant roughly 56 MB in a
// single JSON response, sent every time the avatar picker opened, with no
// cache headers. The picker only ever needs to know what exists; the bytes
// come one at a time from the route below, which the browser can cache.
const GALLERY_PAGE_SIZE = 60;

router.get('/api/avatars/gallery', authMiddleware, (req, res) => {
  try {
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const rows = db.prepare(`
      SELECT ca.id, ca.user_id, ${displayName('u')} as uploader_name
      FROM custom_avatars ca JOIN users u ON u.id = ca.user_id
      ORDER BY ca.created_at DESC
      LIMIT ? OFFSET ?
    `).all(GALLERY_PAGE_SIZE + 1, offset);
    res.json({
      rows: rows.slice(0, GALLERY_PAGE_SIZE),
      hasMore: rows.length > GALLERY_PAGE_SIZE,
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// One image, as an image — decoded from the stored base64 and served with
// its real content type, so the browser caches it like any other picture
// instead of re-downloading it inside a JSON blob on every render.
// Immutable: a gallery entry's bytes never change, only whether the row
// still exists.
router.get('/api/avatars/gallery/:id/image', authMiddleware, (req, res) => {
  try {
    const row = db.prepare('SELECT image FROM custom_avatars WHERE id = ?').get(req.params.id);
    if (!row?.image) return res.status(404).json({ error: 'Не найдено' });

    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(row.image);
    if (!match) return res.status(415).json({ error: 'Неподдерживаемый формат' });

    res.setHeader('Content-Type', match[1]);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(Buffer.from(match[2], 'base64'));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Wearing a gallery avatar copies the bytes server-side. The picker never
// downloads them to hand them straight back on save — it only knows the id.
router.post('/api/tester/avatar/gallery/:id/equip', authMiddleware, (req, res) => {
  try {
    const row = db.prepare('SELECT image FROM custom_avatars WHERE id = ?').get(req.params.id);
    if (!row?.image) return res.status(404).json({ error: 'Не найдено' });
    db.prepare(`
      INSERT INTO user_profiles (user_id, avatar_id, custom_avatar) VALUES (?, 'custom', ?)
      ON CONFLICT(user_id) DO UPDATE SET avatar_id = 'custom', custom_avatar = excluded.custom_avatar
    `).run(req.user.id, row.image);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/tester/avatar/gallery', authMiddleware, (req, res) => {
  try {
    const { image } = req.body;
    if (!image || typeof image !== 'string') return res.status(400).json({ error: 'Нужна картинка' });
    if (image.length > MAX_AVATAR_BASE64_CHARS) return res.status(400).json({ error: 'Картинка слишком большая (макс 2 MB)' });
    const result = db.prepare('INSERT INTO custom_avatars (user_id, image) VALUES (?, ?)').run(req.user.id, image);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/tester/avatar/gallery/:id', authMiddleware, (req, res) => {
  try {
    const row = db.prepare('SELECT user_id FROM custom_avatars WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
    db.prepare('DELETE FROM custom_avatars WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Favorites ──────────────────────────────────────────────────────────────
// A real multi-item bookmark list spanning both seeded lectures and
// lead-authored custom courses (see the user_favorite_courses migration in
// db/schema.js for why course_id has no single FK). Enriched with just
// enough detail to render the profile's "Избранное" list without a second
// round-trip per item — module/lesson/test counts for custom courses,
// title/tag/best-score for lectures.
router.get('/api/tester/favorites', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const rows = db.prepare('SELECT * FROM user_favorite_courses WHERE user_id = ? ORDER BY created_at DESC').all(userId);

    const result = rows.map(fav => {
      if (fav.course_type === 'custom') {
        const course = db.prepare('SELECT id, title, tag, color, is_published FROM custom_courses WHERE id = ? AND deleted_at IS NULL').get(fav.course_id);
        if (!course) return null;
        const totalModules = db.prepare('SELECT COUNT(*) as c FROM custom_modules WHERE course_id = ?').get(course.id)?.c || 0;
        const totalLessons = db.prepare(`
          SELECT COUNT(*) as c FROM custom_lessons cl
          JOIN custom_modules cm ON cm.id = cl.module_id WHERE cm.course_id = ?
        `).get(course.id)?.c || 0;
        const totalTests = db.prepare(`
          SELECT COUNT(*) as c FROM custom_lessons cl
          JOIN custom_modules cm ON cm.id = cl.module_id WHERE cm.course_id = ? AND cl.type = 'quiz'
        `).get(course.id)?.c || 0;
        return {
          course_type: 'custom', course_id: course.id, title: course.title,
          tag: course.tag, color: course.color, totalModules, totalLessons, totalTests,
          favorited_at: fav.created_at,
        };
      }
      const lecture = db.prepare('SELECT id, title, skill_area FROM lectures WHERE id = ?').get(fav.course_id);
      if (!lecture) return null;
      const result = db.prepare('SELECT score FROM test_results WHERE user_id = ? AND lecture_id = ?').get(userId, lecture.id);
      return {
        course_type: 'lecture', course_id: lecture.id, title: lecture.title,
        tag: lecture.skill_area, score: result?.score ?? null, favorited_at: fav.created_at,
      };
    }).filter(Boolean);

    res.json(result);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/tester/favorites', authMiddleware, (req, res) => {
  try {
    const { course_type, course_id } = req.body;
    if (course_type !== 'lecture' && course_type !== 'custom') return res.status(400).json({ error: 'Некорректный тип курса' });
    const id = toPositiveInt(course_id);
    if (id === null) return res.status(400).json({ error: 'Некорректный курс' });

    const exists = course_type === 'custom'
      ? db.prepare('SELECT id FROM custom_courses WHERE id = ? AND deleted_at IS NULL').get(id)
      : db.prepare('SELECT id FROM lectures WHERE id = ?').get(id);
    if (!exists) return res.status(404).json({ error: 'Курс не найден' });

    db.prepare('INSERT OR IGNORE INTO user_favorite_courses (user_id, course_type, course_id) VALUES (?, ?, ?)')
      .run(req.user.id, course_type, id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/tester/favorites/:course_type/:course_id', authMiddleware, (req, res) => {
  try {
    const { course_type, course_id } = req.params;
    db.prepare('DELETE FROM user_favorite_courses WHERE user_id = ? AND course_type = ? AND course_id = ?')
      .run(req.user.id, course_type, course_id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Notes ──────────────────────────────────────────────────────────────────
// Server-backed replacement for the old localStorage-only per-course notes
// drawer — see the custom_lesson_notes migration comment in db/schema.js.
// Grouped by course here (rather than left flat) so the client can render
// the "one card per course, numbered notes inside" layout directly without
// re-deriving the grouping itself. Joins back to custom_lessons/
// custom_modules for a "jump to lesson" module title — falls back to just
// lesson_title when lesson_id has gone NULL (its lesson was deleted).
router.get('/api/tester/notes', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const notes = db.prepare(`
      SELECT n.id, n.course_id, n.lesson_id, n.lesson_title, n.text, n.created_at,
        cc.title as course_title, cc.tag as course_tag, cc.color as course_color,
        cm.title as module_title
      FROM custom_lesson_notes n
      JOIN custom_courses cc ON cc.id = n.course_id
      LEFT JOIN custom_lessons cl ON cl.id = n.lesson_id
      LEFT JOIN custom_modules cm ON cm.id = cl.module_id
      WHERE n.user_id = ? AND cc.deleted_at IS NULL
      ORDER BY n.created_at DESC
    `).all(userId);

    const byCourse = new Map();
    for (const n of notes) {
      if (!byCourse.has(n.course_id)) {
        byCourse.set(n.course_id, { course_id: n.course_id, title: n.course_title, tag: n.course_tag, color: n.course_color, notes: [] });
      }
      byCourse.get(n.course_id).notes.push({
        id: n.id, lesson_id: n.lesson_id, lesson_title: n.lesson_title,
        module_title: n.module_title, text: n.text, created_at: n.created_at,
      });
    }
    res.json(Array.from(byCourse.values()));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/tester/notes', authMiddleware, (req, res) => {
  try {
    const { course_id, lesson_id, lesson_title, text } = req.body;
    const courseId = toPositiveInt(course_id);
    if (courseId === null) return res.status(400).json({ error: 'Некорректный курс' });
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'Пустая заметка' });
    if (String(text).length > 2000) return res.status(400).json({ error: 'Заметка слишком длинная (макс 2000)' });
    // Not just "does it exist": GET /api/tester/notes joins custom_courses
    // to head each group with the course's title, tag and colour, so a note
    // attached to somebody's unpublished draft handed those straight back.
    const course = db.prepare('SELECT * FROM custom_courses WHERE id = ?').get(courseId);
    if (!canSeeCourse(course, req.user)) return res.status(404).json({ error: 'Курс не найден' });

    const info = db.prepare(
      'INSERT INTO custom_lesson_notes (user_id, course_id, lesson_id, lesson_title, text) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, courseId, lesson_id || null, String(lesson_title || '').slice(0, 200), String(text).trim());

    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/tester/notes/:id', authMiddleware, (req, res) => {
  try {
    const note = db.prepare('SELECT id FROM custom_lesson_notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ error: 'Не найдено' });
    db.prepare('DELETE FROM custom_lesson_notes WHERE id = ?').run(note.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/tester/cards', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const cards  = db.prepare('SELECT uc.*, l.title as lecture_title FROM user_cards uc JOIN lectures l ON uc.lecture_id = l.id WHERE uc.user_id = ? ORDER BY uc.earned_at DESC').all(userId);
    const badges = db.prepare('SELECT * FROM user_badges WHERE user_id = ?').all(userId);

    // Per-block progress
    const blocks = db.prepare(`
      SELECT l.skill_area,
             COUNT(*) as total,
             (SELECT COUNT(*) FROM user_cards uc WHERE uc.user_id = ? AND uc.skill_area = l.skill_area) as collected
      FROM lectures l GROUP BY l.skill_area
    `).all(userId);

    res.json({ cards, badges, blocks });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/tester/craft-badge', authMiddleware, (req, res) => {
  try {
    const { skill_area } = req.body;
    const userId = req.user.id;

    const collected = db.prepare('SELECT COUNT(*) as c FROM user_cards WHERE user_id = ? AND skill_area = ?').get(userId, skill_area)?.c || 0;
    const total     = db.prepare('SELECT COUNT(*) as c FROM lectures WHERE skill_area = ?').get(skill_area)?.c || 0;

    // total === 0 means skill_area matches no real lecture block (e.g. a
    // bogus value sent directly to the API, bypassing the client's own
    // dropdown of real values) — collected(0) < total(0) is false, so
    // without this check the badge was free to craft for nothing.
    if (total === 0 || collected < total) return res.status(400).json({ error: 'Недостаточно карточек' });
    if (db.prepare('SELECT id FROM user_badges WHERE user_id = ? AND badge_id = ?').get(userId, skill_area))
      return res.status(400).json({ error: 'Значок уже скрафчен' });

    // Both writes must land together — a crash between them would otherwise
    // leave the badge crafted with no matching activity_log record of it.
    db.transaction(() => {
      db.prepare('INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(userId, skill_area);
      logActivity(userId, `crafted_badge:${skill_area}`);
    })();

    // «Коллекционер» — all 5 skill-area badges crafted.
    const craftedSkillBadges = db.prepare(
      `SELECT COUNT(*) as c FROM user_badges WHERE user_id = ? AND badge_id IN (${SKILL_BADGES.map(() => '?').join(',')})`
    ).get(userId, ...SKILL_BADGES).c;
    const newAchievements = [];
    if (craftedSkillBadges >= SKILL_BADGES.length) {
      if (awardAchievement(userId, ACHIEVEMENT_IDS.KOLLEKTSIONER)) newAchievements.push(ACHIEVEMENT_IDS.KOLLEKTSIONER);
    }

    const unlocks = BADGE_UNLOCKS[skill_area] || { frame: 'gold', bg: 'forest', spec: '' };
    res.json({ success: true, badge_id: skill_area, unlocks, newAchievements });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// What this account may wear, decided by the same function that refuses a
// save (entitlements.js). The profile page used to work this out in the
// browser from its badges and purchases, which meant the rule that greys out
// a locked tile and the rule that enforces it were two separate pieces of
// code — and they had already drifted: the shop's priced avatar was also
// every new account's default, so a new tester saw their own current avatar
// drawn as locked with a 120-coin price on it.
router.get('/api/tester/entitlements', authMiddleware, (req, res) => {
  try {
    res.json(entitlements(req.user.id));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
