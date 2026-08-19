// Rate limits, out of the way of every test that isn't about them.
//
// express-rate-limit keeps its counters in process memory, and vitest may
// run several test files in one worker — so two files would share a bucket
// and a suite that happened to run in a different order failed somewhere it
// had nothing to do with. The limits are read from the environment (see
// limitFromEnv in src/routes/auth.js), so the default here is simply "high
// enough that nothing reaches it".
//
// The file that IS about rate limiting sets its own tight numbers before
// importing the app, which still exercises the real middleware.
for (const [key, value] of Object.entries({
  RATE_LIMIT_LOGIN: '10000',
  RATE_LIMIT_REFRESH: '10000',
  RATE_LIMIT_LOGOUT: '10000',
  RATE_LIMIT_REGISTER: '10000',
  RATE_LIMIT_TELEGRAM: '10000',
  RATE_LIMIT_TELEGRAM_POLL: '10000',
  RATE_LIMIT_PASSWORD_CHANGE: '10000',
  RATE_LIMIT_FORGOT_PASSWORD: '10000',
  RATE_LIMIT_WRITE: '100000',
})) {
  if (!process.env[key]) process.env[key] = value;
}
