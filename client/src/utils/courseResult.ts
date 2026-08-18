// What the frog says when someone finishes a course.
//
// Every course can carry its own two lines (success_text / fail_text, set in
// the builder) so the send-off matches the course — a quiz on prison
// etiquette and a quiz on Winx fairies shouldn't sign off identically. When
// an author leaves them empty these stand in, so a course always says
// something rather than showing a blank speech line.
export const DEFAULT_SUCCESS_TEXT = 'Красиво прошёл. Так и надо.';
export const DEFAULT_FAIL_TEXT = 'Бывает. Перечитай и заходи ещё раз — попыток сколько угодно.';

export const resultText = (course: { success_text?: string | null; fail_text?: string | null } | null, passed: boolean) =>
  (passed ? course?.success_text : course?.fail_text)?.trim()
  || (passed ? DEFAULT_SUCCESS_TEXT : DEFAULT_FAIL_TEXT);

// Matches RESULT_TEXT_MAX in server/src/routes/courses.js — it's one spoken
// line beside the frog, not a paragraph.
export const RESULT_TEXT_MAX = 300;
