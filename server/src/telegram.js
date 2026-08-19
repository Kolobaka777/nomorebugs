import TelegramBot from 'node-telegram-bot-api';
import crypto from 'crypto';
import bcryptjs from 'bcryptjs';
import { db } from '../db/schema.js';
import { generateAccessToken, generateRefreshToken } from './auth.js';
import { DEFAULT_ROLE } from './roles.js';
import { logActivity } from './routeHelpers.js';
import { isEmailConfigured, sendEmail } from './email.js';

// Long enough to open Telegram and tap the bot, short enough that a stale
// browser tab can't be hijacked into a session much later.
const LOGIN_TOKEN_TTL_MS = 5 * 60 * 1000;

let bot = null;
let botUsername = null;

// Where to send the user back after confirming in the bot — the deployed
// site's own origin. Reuses CORS_ORIGIN (already the source of truth for
// "what origin is our frontend") instead of introducing a second env var
// that could drift out of sync with it; takes the first entry if several
// are configured.
function getSiteUrl() {
  return (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',')[0].trim();
}

function initialsFromName(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map(w => w[0]).join('');
  return (initials || '?').toUpperCase();
}

export function isTelegramConfigured() {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

export function getBotUsername() {
  return botUsername;
}

// Generates a one-time login/link token. `linkUserId` set means "attach
// this Telegram account to an already-logged-in user" instead of starting
// a brand new session.
export function createTelegramToken(linkUserId = null) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MS).toISOString();
  db.prepare(
    'INSERT INTO telegram_login_tokens (token, link_user_id, expires_at) VALUES (?, ?, ?)'
  ).run(token, linkUserId, expiresAt);
  return { token, expiresAt };
}

export function buildDeepLink(token) {
  if (!botUsername) return null;
  return `https://t.me/${botUsername}?start=${token}`;
}

// Single-use pickup: terminal states (ready/error/expired-on-read) delete
// the row the moment they're reported, so a stale poll after pickup
// correctly reports "expired" instead of replaying a session or link result.
export function pollTelegramToken(token) {
  const row = db.prepare('SELECT * FROM telegram_login_tokens WHERE token = ?').get(token);
  if (!row) return { status: 'expired' };

  if (row.status === 'pending') {
    if (new Date(row.expires_at) < new Date()) {
      db.prepare('DELETE FROM telegram_login_tokens WHERE token = ?').run(token);
      return { status: 'expired' };
    }
    return { status: 'pending' };
  }

  db.prepare('DELETE FROM telegram_login_tokens WHERE token = ?').run(token);

  if (row.status === 'error') {
    return { status: 'error', error: row.error_message || 'unknown' };
  }
  if (row.link_user_id) {
    const meta = JSON.parse(row.user_json || '{}');
    return { status: 'linked', telegramUsername: meta.telegram_username || null };
  }
  return {
    status: 'ready',
    token: row.access_token,
    refreshToken: row.refresh_token,
    user: JSON.parse(row.user_json),
    needsBaselineSurvey: !!row.needs_baseline_survey,
  };
}

// Core /start handling, factored out from the live bot wiring so it's
// unit-testable without a real Telegram connection — tests call this
// directly with a stub `reply` fn. `tgFrom` mirrors Telegram's
// `message.from` shape: { id, username, first_name, last_name }.
// `reply(text, opts?)` — opts.siteButton asks the live wiring to attach an
// inline "back to the site" URL button (see initTelegramBot below); test
// stubs that only read the text argument can ignore opts entirely.
export function handleTelegramStart(payloadToken, tgFrom, reply) {
  const tgId = String(tgFrom.id);
  const tgUsername = tgFrom.username || null;
  const displayName = [tgFrom.first_name, tgFrom.last_name].filter(Boolean).join(' ') || tgUsername || `tg_${tgId}`;

  const row = db.prepare('SELECT * FROM telegram_login_tokens WHERE token = ?').get(payloadToken);
  if (!row || row.status !== 'pending' || new Date(row.expires_at) < new Date()) {
    reply('⚠️ Ссылка устарела или уже использована. Вернись на сайт и попробуй снова.');
    return;
  }

  try {
    if (row.link_user_id) {
      handleLink(row, payloadToken, tgId, tgUsername, reply);
    } else {
      handleLoginOrRegister(payloadToken, tgId, tgUsername, displayName, reply);
    }
  } catch (err) {
    console.error('Telegram /start handling failed:', err);
    db.prepare('UPDATE telegram_login_tokens SET status = ?, error_message = ? WHERE token = ?')
      .run('error', 'internal', payloadToken);
    reply('⚠️ Что-то пошло не так. Попробуй ещё раз через сайт.');
  }
}

function handleLink(row, payloadToken, tgId, tgUsername, reply) {
  const already = db.prepare('SELECT id FROM users WHERE telegram_id = ?').get(tgId);
  if (already && already.id !== row.link_user_id) {
    db.prepare('UPDATE telegram_login_tokens SET status = ?, error_message = ? WHERE token = ?')
      .run('error', 'already-linked-elsewhere', payloadToken);
    reply('⚠️ Этот Telegram-аккаунт уже привязан к другому пользователю baga-net.');
    return;
  }

  db.prepare('UPDATE users SET telegram_id = ?, telegram_username = ? WHERE id = ?')
    .run(tgId, tgUsername, row.link_user_id);
  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(row.link_user_id);
  db.prepare('UPDATE telegram_login_tokens SET status = ?, user_id = ?, user_json = ? WHERE token = ?')
    .run('ready', row.link_user_id, JSON.stringify({ telegram_username: tgUsername }), payloadToken);

  reply(`✅ Telegram привязан к аккаунту «${user.name}». Теперь вход и уведомления работают отсюда.\nМожешь вернуться на сайт — вкладка закроется сама.`, { siteButton: true });
}

function handleLoginOrRegister(payloadToken, tgId, tgUsername, displayName, reply) {
  let user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgId);
  let isNew = false;

  if (!user) {
    // Telegram-originated accounts get a random, never-surfaced password
    // hash — there's no email/password login path for them anyway (the
    // placeholder address below isn't a real inbox), only Telegram is.
    const passwordHash = bcryptjs.hashSync(crypto.randomBytes(32).toString('hex'), 10);
    const userId = db.prepare(
      'INSERT INTO users (email, password, name, role, avatar_initials, telegram_id, telegram_username) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(`tg${tgId}@telegram.local`, passwordHash, displayName, DEFAULT_ROLE, initialsFromName(displayName), tgId, tgUsername).lastInsertRowid;
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    isNew = true;
    logActivity(user.id, 'register_telegram');
    db.prepare('INSERT INTO team_events (event_type, user_id) VALUES (?, ?)').run('member_joined', user.id);
  } else if (user.telegram_username !== tgUsername) {
    // Auto-capture: a Telegram @username can change any time; keep it
    // current on every login, not just at first-link.
    db.prepare('UPDATE users SET telegram_username = ? WHERE id = ?').run(tgUsername, user.id);
    user.telegram_username = tgUsername;
  }

  const accessToken = generateAccessToken(user);
  const refresh = generateRefreshToken();
  db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(user.id, refresh.hash, refresh.expiresAt.toISOString());

  let needsBaselineSurvey = false;
  if (user.role === 'tester') {
    const baseline = db.prepare('SELECT id FROM baseline_survey WHERE user_id = ?').get(user.id);
    needsBaselineSurvey = !baseline;
  }

  logActivity(user.id, 'login_telegram');

  // Same shape as the email/password login response (auth.js) — without
  // this, a Telegram-only login left `displayName`/`gender` missing on the
  // client's `user` object until the account happened to visit /profile or
  // /cabinet (whose own fetches patch those in afterward), so a nickname/
  // gender set earlier silently didn't apply anywhere else in the app for
  // as long as someone kept logging in via Telegram.
  const profileRow = db.prepare('SELECT nickname, gender FROM user_profiles WHERE user_id = ?').get(user.id);
  const publicUser = {
    id: user.id, email: user.email, name: user.name, role: user.role, avatar_initials: user.avatar_initials,
    displayName: profileRow?.nickname || null, gender: profileRow?.gender || null,
  };
  db.prepare(`
    UPDATE telegram_login_tokens
    SET status = 'ready', user_id = ?, access_token = ?, refresh_token = ?, user_json = ?, needs_baseline_survey = ?
    WHERE token = ?
  `).run(user.id, accessToken, refresh.token, JSON.stringify(publicUser), needsBaselineSurvey ? 1 : 0, payloadToken);

  const greeting = isNew ? `Добро пожаловать, ${user.name}! Аккаунт создан.` : `С возвращением, ${user.name}!`;
  reply(`✅ ${greeting}\nВходим в baga-net — эта вкладка закроется сама, а если нет, жми кнопку ниже.`, { siteButton: true });
}

// Fire-and-forget: a notification failure must never break the caller's
// actual request (registration, login, role change). Telegram is the
// primary channel; SMTP (email.js) is reserve-only, and skipped entirely
// for auto-generated @telegram.local placeholder addresses since those
// aren't real inboxes.
export function notifyUser(user, subject, message) {
  if (bot && user.telegram_id) {
    bot.sendMessage(user.telegram_id, message).catch(err => console.error('Telegram notify failed:', err.message));
    return 'telegram';
  }
  if (isEmailConfigured() && user.email && !user.email.endsWith('@telegram.local')) {
    sendEmail(user.email, subject, message).catch(() => {});
    return 'email';
  }
  return 'none';
}

// Same as notifyUser, but actually waits for Telegram's API to confirm the
// message sent before reporting 'telegram' — used only where the caller
// hands the result back to a human who'll trust it (the reset-password
// route tells a lead "delivered via Telegram" vs showing them the temp
// password to relay by hand; notifyUser's fire-and-forget send used to
// always claim 'telegram' the instant a telegram_id existed, even if the
// bot was blocked and the send silently failed server-side). Everywhere
// else callers don't act on the return value, so the fire-and-forget
// notifyUser above is intentionally left as-is — awaiting every
// notification would add latency to routes that don't need it.
export async function notifyUserConfirmed(user, subject, message) {
  if (bot && user.telegram_id) {
    try {
      await bot.sendMessage(user.telegram_id, message);
      return 'telegram';
    } catch (err) {
      console.error('Telegram notify failed:', err.message);
      // Falls through to the email channel below instead of claiming a
      // delivery that didn't happen.
    }
  }
  if (isEmailConfigured() && user.email && !user.email.endsWith('@telegram.local')) {
    try {
      await sendEmail(user.email, subject, message);
      return 'email';
    } catch {
      return 'none';
    }
  }
  return 'none';
}

// No-op unless TELEGRAM_BOT_TOKEN is set (matches the "only needs an API
// key in prod" scaffolding used for the other prod-readiness integrations)
// and deliberately never called in tests — see app.js.
export function initTelegramBot() {
  if (!isTelegramConfigured()) return null;

  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

  bot.getMe()
    .then(me => { botUsername = me.username; console.log(`Telegram bot online: @${botUsername}`); })
    .catch(err => console.error('Failed to fetch Telegram bot identity:', err.message));

  bot.onText(/^\/start(?:\s+(\S+))?/, (msg, match) => {
    const payloadToken = match?.[1];
    if (!payloadToken) {
      bot.sendMessage(msg.chat.id, 'Привет! Чтобы войти или зарегистрироваться, нажми кнопку "Войти через Telegram" на сайте baga-net.');
      return;
    }
    handleTelegramStart(payloadToken, msg.from, (text, opts) => {
      // Telegram itself has no "close this chat"/"navigate the user's other
      // tab" API — the client's own window.open()+close() (see
      // TelegramLoginButton.tsx/TelegramLinkWidget.tsx) already closes the
      // popup automatically when it's a real desktop/web browser tab. This
      // button covers the case that can't: the native mobile app took the
      // deep link, so there's no browser tab left for our JS to touch —
      // one tap here is the best available way back to an already-logged-in
      // site tab.
      const options = opts?.siteButton
        ? { reply_markup: { inline_keyboard: [[{ text: '🌐 Вернуться на сайт', url: getSiteUrl() }]] } }
        : undefined;
      bot.sendMessage(msg.chat.id, text, options);
    });
  });

  bot.on('polling_error', (err) => console.error('Telegram polling error:', err.message));

  return bot;
}

// Stops long-polling cleanly on shutdown — otherwise the old process's
// getUpdates loop can race the new one's after a deploy (Telegram's API
// only allows one active poller per bot token; the loser gets 409s until
// the stale one's connection finally times out on its own).
export function stopTelegramBot() {
  if (bot) bot.stopPolling().catch(() => {});
}

// Test-only escape hatch — lets tests exercise notifyUser()'s Telegram
// branch with a stub bot, without a real TELEGRAM_BOT_TOKEN or network.
export function _setBotForTest(fakeBot, fakeUsername) {
  bot = fakeBot;
  botUsername = fakeUsername;
}
