// Profile customization (self-service + viewing a teammate's public
// profile) and trading cards/badges. Split out from the old monolithic
// app.js — see PROGRESS.md.
import express from 'express';
import { db } from '../../db/schema.js';
import { logError } from '../sentry.js';
import { authMiddleware } from '../auth.js';
import { parseDbDate, awardAchievement, ACHIEVEMENT_IDS } from '../routeHelpers.js';

const router = express.Router();

// Badge unlock mappings (what each crafted badge awards)
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
  const user = db.prepare('SELECT id, email, name, avatar_initials, created_at FROM users WHERE id = ?').get(userId);
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

  // Streak
  const days = db.prepare(
    'SELECT DATE(created_at) as day FROM activity_log WHERE user_id = ? GROUP BY day ORDER BY day DESC'
  ).all(userId);
  let streak = 0;
  let expected = new Date().toISOString().split('T')[0];
  for (const { day } of days) {
    if (day === expected) {
      streak++;
      const d = new Date(expected); d.setDate(d.getDate() - 1);
      expected = d.toISOString().split('T')[0];
    } else break;
  }

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
    avatar_id:          profile.avatar_id    || 'bug1',
    avatar_frame:       profile.avatar_frame || 'default',
    profile_bg:         profile.profile_bg   || 'default',
    showcase_badges:    JSON.parse(profile.showcase_badges || '[]'),
    gender:             profile.gender || null,
    favorite_lecture_id: profile.favorite_lecture_id || null,
    is_public:          profile.is_public !== undefined ? !!profile.is_public : true,
    custom_avatar:      profile.custom_avatar || null,
    bug_coins:          profile.bug_coins    || 0,
    purchased_items:    JSON.parse(profile.purchased_items || '[]'),
    stats, streak, cards, badges, craftable, favLecture,
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
    const target = db.prepare('SELECT id, name, avatar_initials, archived_at FROM users WHERE id = ?').get(targetId);
    if (!target || target.archived_at) return res.status(404).json({ error: 'Пользователь не найден' });

    const profileRow = db.prepare('SELECT is_public, avatar_id, avatar_frame, custom_avatar, work_start, work_end, work_days, timezone FROM user_profiles WHERE user_id = ?').get(targetId) || {};
    const isPublic = profileRow.is_public !== undefined ? !!profileRow.is_public : true;
    const isSelf = targetId === req.user.id;
    const isLead = req.user.role === 'lead' || req.user.role === 'admin';

    if (!isSelf && !isLead && !isPublic) {
      return res.json({
        id: target.id,
        name: target.name,
        avatar_initials: target.avatar_initials,
        avatar_id: profileRow.avatar_id || 'bug1',
        avatar_frame: profileRow.avatar_frame || 'default',
        custom_avatar: profileRow.custom_avatar || null,
        is_public: false,
      });
    }

    const full = buildFullProfile(targetId);
    if (!full) return res.status(404).json({ error: 'Пользователь не найден' });

    res.json({
      ...full,
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
    } = req.body;

    if (nickname && nickname.length > 40)   return res.status(400).json({ error: 'Ник слишком длинный (макс 40)' });
    if (status_quote && status_quote.length > 60) return res.status(400).json({ error: 'Цитата слишком длинная (макс 60)' });
    if (info_box && info_box.length > 200)  return res.status(400).json({ error: 'Инфобокс слишком длинный (макс 200)' });
    if (gender !== undefined && gender !== null && gender !== 'male' && gender !== 'female') {
      return res.status(400).json({ error: 'Некорректное значение пола' });
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

    db.prepare(`
      INSERT INTO user_profiles
        (user_id, nickname, status_quote, specialization, info_box, snail_joke,
         avatar_id, avatar_frame, profile_bg, showcase_badges, favorite_lecture_id, is_public, custom_avatar, gender)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
        gender              = excluded.gender
    `).run(
      userId,
      nickname || null, status_quote || null, specialization || null,
      info_box || null, snail_joke || null,
      avatar_id || 'bug1', avatar_frame || 'default', profile_bg || 'default',
      JSON.stringify(showcase_badges || []),
      favorite_lecture_id || null, is_public ? 1 : 0,
      custom_avatar || null, gender || null,
    );

    res.json({ success: true });
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
      db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)').run(userId, `crafted_badge:${skill_area}`);
    })();

    // «Коллекционер» — all 5 skill-area badges crafted.
    const craftedSkillBadges = db.prepare(
      `SELECT COUNT(*) as c FROM user_badges WHERE user_id = ? AND badge_id IN (${Object.keys(BADGE_UNLOCKS).map(() => '?').join(',')})`
    ).get(userId, ...Object.keys(BADGE_UNLOCKS)).c;
    if (craftedSkillBadges >= Object.keys(BADGE_UNLOCKS).length) awardAchievement(userId, ACHIEVEMENT_IDS.KOLLEKTSIONER);

    const unlocks = BADGE_UNLOCKS[skill_area] || { frame: 'gold', bg: 'forest', spec: '' };
    res.json({ success: true, badge_id: skill_area, unlocks });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
