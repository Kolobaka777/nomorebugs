import { db, initDb } from './schema.js';
import bcryptjs from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'learning_hub.db');

// Remove existing DB
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

// Re-import to create fresh DB
import('./schema.js').then(async ({ db: freshDb, initDb: freshInitDb }) => {
  freshInitDb();

  // Hash passwords
  const leadHash = bcryptjs.hashSync('lead123', 10);
  const testerHash = bcryptjs.hashSync('test123', 10);

  // Insert users
  const leadInsert = freshDb.prepare(`
    INSERT INTO users (email, password, name, role, avatar_initials)
    VALUES (?, ?, ?, ?, ?)
  `);

  const testerInsert = freshDb.prepare(`
    INSERT INTO users (email, password, name, role, avatar_initials)
    VALUES (?, ?, ?, ?, ?)
  `);

  const leadId = leadInsert.run('lead@qa.com', leadHash, 'Alex Lead', 'lead', 'AL').lastInsertRowid;
  const nazarId = testerInsert.run('nazar@qa.com', testerHash, 'Nazariy Tester', 'tester', 'NT').lastInsertRowid;
  const glebId = testerInsert.run('gleb@qa.com', testerHash, 'Gleb Glebov', 'tester', 'GG').lastInsertRowid;
  const alenaId = testerInsert.run('alena@qa.com', testerHash, 'Alena Expert', 'tester', 'AE').lastInsertRowid;
  const vasyaId = testerInsert.run('vasya@qa.com', testerHash, 'Vasya Novice', 'tester', 'VN').lastInsertRowid;

  // Lectures with realistic content for QA frontend testing
  const lectureInsert = freshDb.prepare(`
    INSERT INTO lectures (title, order_num, skill_area)
    VALUES (?, ?, ?)
  `);

  const lectures = [
    { title: 'HTML Basics & Structure', skill: 'HTML structure' },
    { title: 'CSS Fundamentals & Layouts', skill: 'CSS reading' },
    { title: 'Introduction to DevTools', skill: 'DevTools' },
    { title: 'Browser Console & Errors', skill: 'Console errors' },
    { title: 'Responsive Design Testing', skill: 'HTML structure' },
    { title: 'CSS Debugging & Inspection', skill: 'CSS reading' },
    { title: 'Network Tab & Performance', skill: 'DevTools' },
    { title: 'JavaScript Basics for QA', skill: 'Console errors' },
    { title: 'Bug Reporting & Documentation', skill: 'Bug report quality' },
    { title: 'Advanced Testing Scenarios', skill: 'Bug report quality' },
  ];

  const lectureIds = [];
  for (let i = 0; i < lectures.length; i++) {
    const id = lectureInsert.run(lectures[i].title, i + 1, lectures[i].skill).lastInsertRowid;
    lectureIds.push(id);
  }

  // Question bank - 5 questions per lecture
  const questionInsert = freshDb.prepare(`
    INSERT INTO questions (lecture_id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, order_num)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const questionsData = [
    // Lecture 1: HTML Basics
    {
      lecture: 0,
      q: 'What does the <meta charset="UTF-8"> tag do?',
      options: ['Sets page language', 'Defines character encoding', 'Creates metadata', 'Links external resources'],
      correct: 'b',
      explain: 'The charset meta tag specifies the character encoding for the HTML document.'
    },
    {
      lecture: 0,
      q: 'Which semantic HTML5 element is best for a navigation bar?',
      options: ['<div>', '<section>', '<nav>', '<header>'],
      correct: 'c',
      explain: 'The <nav> element is semantically correct for navigation, improving accessibility and SEO.'
    },
    {
      lecture: 0,
      q: 'What is the purpose of the alt attribute in images?',
      options: ['Provides animation', 'Describes image for screen readers', 'Sets image size', 'Enables caching'],
      correct: 'b',
      explain: 'The alt attribute provides alternative text for images, crucial for accessibility and SEO.'
    },
    {
      lecture: 0,
      q: 'How many heading levels does HTML support?',
      options: ['3', '5', '6', '8'],
      correct: 'c',
      explain: 'HTML supports 6 heading levels from <h1> to <h6>.'
    },
    {
      lecture: 0,
      q: 'What element should wrap form controls?',
      options: ['<section>', '<form>', '<fieldset>', '<div>'],
      correct: 'b',
      explain: 'The <form> element wraps form controls and is essential for form functionality.'
    },

    // Lecture 2: CSS Fundamentals
    {
      lecture: 1,
      q: 'What does the CSS box-sizing property control?',
      options: ['Box shadow', 'Width/height calculation', 'Element spacing', 'Border color'],
      correct: 'b',
      explain: 'box-sizing determines whether padding/border are included in width/height calculations.'
    },
    {
      lecture: 1,
      q: 'Which selector has the highest specificity?',
      options: ['Element selector', 'Class selector', 'ID selector', 'Universal selector'],
      correct: 'c',
      explain: 'ID selectors have specificity of 100, higher than class (10) or element (1) selectors.'
    },
    {
      lecture: 1,
      q: 'What does flexbox\'s justify-content property control?',
      options: ['Vertical alignment', 'Horizontal alignment', 'Width distribution', 'Cross-axis alignment'],
      correct: 'b',
      explain: 'justify-content aligns flex items along the main axis (usually horizontal).'
    },
    {
      lecture: 1,
      q: 'How do you center a block element horizontally?',
      options: ['text-align: center', 'margin: 0 auto', 'align-items: center', 'position: center'],
      correct: 'b',
      explain: 'margin: 0 auto centers a block element by setting equal left/right margins.'
    },
    {
      lecture: 1,
      q: 'What is the cascade in CSS?',
      options: ['Waterfall effect', 'Rules application order', 'Browser rendering', 'Animation timing'],
      correct: 'b',
      explain: 'The cascade describes the order/priority in which CSS rules are applied.'
    },

    // Lecture 3: DevTools
    {
      lecture: 2,
      q: 'Where in DevTools do you inspect page elements?',
      options: ['Sources tab', 'Elements/Inspector tab', 'Console tab', 'Network tab'],
      correct: 'b',
      explain: 'The Elements or Inspector tab lets you inspect and modify page elements in real-time.'
    },
    {
      lecture: 2,
      q: 'What does the Network tab show?',
      options: ['JavaScript code', 'HTTP requests/responses', 'Memory usage', 'CSS errors'],
      correct: 'b',
      explain: 'The Network tab displays all HTTP requests, responses, headers, and timing data.'
    },
    {
      lecture: 2,
      q: 'How do you take a screenshot of the viewport in DevTools?',
      options: ['F12', 'Cmd/Ctrl+Shift+P then screenshot', 'Right-click save', 'DevTools menu'],
      correct: 'b',
      explain: 'Use the command palette (Cmd/Ctrl+Shift+P) and search for "screenshot" or use the camera icon.'
    },
    {
      lecture: 2,
      q: 'What is the sources tab used for?',
      options: ['View page sources', 'Debugging JavaScript', 'Testing performance', 'Checking security'],
      correct: 'b',
      explain: 'The Sources tab allows you to set breakpoints and debug JavaScript code line-by-line.'
    },
    {
      lecture: 2,
      q: 'What does the Lighthouse tab audit?',
      options: ['HTML structure', 'Performance, accessibility, SEO', 'CSS validity', 'JavaScript errors'],
      correct: 'b',
      explain: 'Lighthouse provides audits for performance, accessibility, SEO, best practices, and PWA.'
    },

    // Lecture 4: Browser Console
    {
      lecture: 3,
      q: 'What does console.error() display?',
      options: ['Warning message', 'Error message in red', 'Debug info', 'Success message'],
      correct: 'b',
      explain: 'console.error() displays error messages in red, helping identify application errors.'
    },
    {
      lecture: 3,
      q: 'How do you access the global window object in console?',
      options: ['Type "window"', 'Type "global"', 'Type "this"', 'All of the above'],
      correct: 'd',
      explain: 'All three approaches access the global scope depending on context.'
    },
    {
      lecture: 3,
      q: 'What does console.table() do?',
      options: ['Prints date', 'Formats output as table', 'Clears console', 'Tests database'],
      correct: 'b',
      explain: 'console.table() formats arrays/objects as a formatted table for easier inspection.'
    },
    {
      lecture: 3,
      q: 'How do you monitor variable changes in console?',
      options: ['console.watch()', 'monitorVariable()', 'Set breakpoint or use getters', 'Use console.log()'],
      correct: 'c',
      explain: 'Set breakpoints in Sources tab or use object getters to monitor variable changes.'
    },
    {
      lecture: 3,
      q: 'What do browser console errors starting with "Uncaught" mean?',
      options: ['Warning only', 'Exception not handled by try-catch', 'Deprecated syntax', 'Browser incompatibility'],
      correct: 'b',
      explain: '"Uncaught" errors are exceptions not handled, often causing page malfunction.'
    },

    // Lecture 5: Responsive Design
    {
      lecture: 4,
      q: 'What meta tag is essential for responsive design?',
      options: ['<meta charset>', '<meta viewport>', '<meta author>', '<meta expires>'],
      correct: 'b',
      explain: '<meta name="viewport" content="width=device-width, initial-scale=1"> enables responsive design.'
    },
    {
      lecture: 4,
      q: 'What CSS media query breakpoint is typical for mobile?',
      options: ['max-width: 1200px', 'max-width: 768px', 'max-width: 480px', 'max-width: 600px'],
      correct: 'c',
      explain: 'Mobile breakpoint is typically max-width: 480px for smartphones.'
    },
    {
      lecture: 4,
      q: 'What does "mobile-first" design approach mean?',
      options: ['Design desktop first', 'Design mobile first then enhance', 'Only design for mobile', 'Use mobile frameworks'],
      correct: 'b',
      explain: 'Mobile-first means designing for small screens first, then adding media queries for larger screens.'
    },
    {
      lecture: 4,
      q: 'How do you test responsive design in DevTools?',
      options: ['Use Device Toolbar toggle', 'Change browser zoom', 'Resize window manually', 'Use Chrome plugin'],
      correct: 'a',
      explain: 'Toggle Device Toolbar (Cmd/Ctrl+Shift+M) to simulate different device sizes.'
    },
    {
      lecture: 4,
      q: 'What unit is best for responsive typography?',
      options: ['px', 'em or rem', 'cm', 'pt'],
      correct: 'b',
      explain: 'em/rem units scale relative to base size, making typography responsive and accessible.'
    },

    // Lecture 6: CSS Debugging
    {
      lecture: 5,
      q: 'How do you find which CSS rule applies to an element?',
      options: ['Search CSS files', 'Use DevTools Inspector', 'Check browser console', 'View page source'],
      correct: 'b',
      explain: 'DevTools Inspector shows all CSS rules, their cascade order, and which are overridden.'
    },
    {
      lecture: 5,
      q: 'What does "strikethrough text" mean in DevTools styles?',
      options: ['Text is deleted', 'Rule is overridden', 'Rule has errors', 'Rule is deprecated'],
      correct: 'b',
      explain: 'Strikethrough CSS indicates the rule is being overridden by another, more specific rule.'
    },
    {
      lecture: 5,
      q: 'How do you test CSS hover states in DevTools?',
      options: ['Actually hover', 'Right-click and toggle :hover', 'Edit CSS manually', 'Cannot test in DevTools'],
      correct: 'b',
      explain: 'DevTools Elements panel shows a :hover state toggle for testing :hover pseudo-classes.'
    },
    {
      lecture: 5,
      q: 'What causes a layout shift issue?',
      options: ['Slow CSS', 'Unspecified dimensions for images/ads', 'Too many divs', 'Complex selectors'],
      correct: 'b',
      explain: 'Layout shifts occur when elements like images load without specified height/width.'
    },
    {
      lecture: 5,
      q: 'How do you measure element dimensions in DevTools?',
      options: ['Right-click properties', 'Use Inspect Element', 'Use Measure tool', 'Check CSS'],
      correct: 'b',
      explain: 'DevTools Inspector displays computed width, height, padding, margin, and border measurements.'
    },

    // Lecture 7: Network Tab
    {
      lecture: 6,
      q: 'What do HTTP status codes 2xx indicate?',
      options: ['Error', 'Success', 'Redirect', 'Client error'],
      correct: 'b',
      explain: '2xx codes (200, 201, 204) indicate successful requests.'
    },
    {
      lecture: 6,
      q: 'What does a 404 status code mean?',
      options: ['Server error', 'Not Found', 'Unauthorized', 'Too Many Requests'],
      correct: 'b',
      explain: '404 means the requested resource was not found on the server.'
    },
    {
      lecture: 6,
      q: 'How do you throttle network speed in DevTools?',
      options: ['Network tab settings', 'Advanced options', 'DevTools throttling dropdown', 'All of above'],
      correct: 'd',
      explain: 'You can set network throttling via DevTools Network/Performance settings.'
    },
    {
      lecture: 6,
      q: 'What does TTFB measure?',
      options: ['Time to fully bind', 'Time to first byte', 'Total transfer bytes', 'Time to finish bind'],
      correct: 'b',
      explain: 'TTFB (Time to First Byte) measures latency before server starts sending response.'
    },
    {
      lecture: 6,
      q: 'How do you filter requests in Network tab by type?',
      options: ['Right-click filter', 'Use filter input field', 'Enable resource type icons', 'Search tab'],
      correct: 'b',
      explain: 'Use the filter input in Network tab to filter by resource type (xhr, img, doc, etc).'
    },

    // Lecture 8: JavaScript Basics
    {
      lecture: 7,
      q: 'What is the difference between let and var?',
      options: ['No difference', 'let is block-scoped', 'var is faster', 'let is global'],
      correct: 'b',
      explain: 'let is block-scoped, var is function-scoped; let is preferred in modern JavaScript.'
    },
    {
      lecture: 7,
      q: 'What does Array.map() return?',
      options: ['undefined', 'New array with transformed elements', 'Modified original array', 'Single value'],
      correct: 'b',
      explain: 'Array.map() returns a new array with elements transformed by the callback function.'
    },
    {
      lecture: 7,
      q: 'What is a Promise in JavaScript?',
      options: ['String', 'Variable', 'Object representing async operation', 'Loop statement'],
      correct: 'c',
      explain: 'A Promise represents an asynchronous operation that may resolve or reject.'
    },
    {
      lecture: 7,
      q: 'What does async/await do?',
      options: ['Similar to promises', 'Makes async code look synchronous', 'Speeds up code', 'Handles errors'],
      correct: 'b',
      explain: 'async/await is syntactic sugar over promises, making async code easier to read.'
    },
    {
      lecture: 7,
      q: 'What is event delegation?',
      options: ['Creating events', 'Delegating events to child element using parent listener', 'Removing events', 'Event loop'],
      correct: 'b',
      explain: 'Event delegation uses a parent listener to handle events from multiple child elements.'
    },

    // Lecture 9: Bug Reporting
    {
      lecture: 8,
      q: 'What is the most important part of a bug report?',
      options: ['Your opinion', 'Steps to reproduce', 'Complaining', 'Copy-paste from chat'],
      correct: 'b',
      explain: 'Steps to reproduce are critical so developers can verify and fix the bug.'
    },
    {
      lecture: 8,
      q: 'What should a bug report title be?',
      options: ['Vague', 'Specific and descriptive', 'Funny', 'Very long'],
      correct: 'b',
      explain: 'Bug titles should clearly describe the issue, not be vague or witty.'
    },
    {
      lecture: 8,
      q: 'What information is needed in a bug report?',
      options: ['OS and browser', 'Steps to reproduce', 'Actual vs expected behavior', 'All of above'],
      correct: 'd',
      explain: 'Complete bug reports include environment, reproduction steps, and behavior description.'
    },
    {
      lecture: 8,
      q: 'Should you take screenshots in bug reports?',
      options: ['Never', 'Only for critical bugs', 'Yes, always for visual issues', 'Only QA should add them'],
      correct: 'c',
      explain: 'Screenshots help developers understand visual/layout issues quickly.'
    },
    {
      lecture: 8,
      q: 'What is the benefit of adding console errors to a bug report?',
      options: ['Shows you\'re technical', 'Helps developers debug faster', 'Makes report longer', 'Is not necessary'],
      correct: 'b',
      explain: 'Including console errors/stack traces accelerates debugging significantly.'
    },

    // Lecture 10: Advanced Testing
    {
      lecture: 9,
      q: 'What is cross-browser testing?',
      options: ['Testing one browser', 'Testing app on multiple browsers/versions', 'Comparing browsers', 'Using browser tools'],
      correct: 'b',
      explain: 'Cross-browser testing ensures the app works across different browsers and versions.'
    },
    {
      lecture: 9,
      q: 'What is regression testing?',
      options: ['Finding new bugs', 'Testing that fixes didn\'t break existing features', 'Performance testing', 'Security testing'],
      correct: 'b',
      explain: 'Regression testing verifies that new changes didn\'t break previously working functionality.'
    },
    {
      lecture: 9,
      q: 'What does smoke testing check?',
      options: ['Performance', 'Basic functionality after build', 'Security', 'UI elements'],
      correct: 'b',
      explain: 'Smoke testing verifies that critical functionality works after new builds.'
    },
    {
      lecture: 9,
      q: 'What is the purpose of edge case testing?',
      options: ['Testing borders', 'Testing boundary values and unusual inputs', 'Testing edges', 'Testing CSS'],
      correct: 'b',
      explain: 'Edge case testing checks how the app handles boundary values and unusual scenarios.'
    },
    {
      lecture: 9,
      q: 'What is accessibility testing?',
      options: ['Testing access controls', 'Ensuring app is usable by people with disabilities', 'Testing logins', 'Testing security'],
      correct: 'b',
      explain: 'Accessibility testing ensures the app is usable by everyone, including people with disabilities.'
    },
  ];

  for (const q of questionsData) {
    questionInsert.run(
      lectureIds[q.lecture],
      q.q,
      q.options[0],
      q.options[1],
      q.options[2],
      q.options[3],
      q.correct,
      q.explain,
      questionsData.filter(x => x.lecture === q.lecture).indexOf(q) + 1
    );
  }

  // Insert baseline surveys for all testers
  const baselineInsert = freshDb.prepare(`
    INSERT INTO baseline_survey (user_id, html_structure, css_reading, devtools, console_errors, bug_report_quality)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  baselineInsert.run(nazarId, 2, 2, 1, 1, 2);
  baselineInsert.run(glebId, 3, 3, 2, 2, 3);
  baselineInsert.run(alenaId, 4, 4, 4, 3, 4);
  baselineInsert.run(vasyaId, 1, 1, 1, 1, 1);

  // Insert realistic test progress - 2 testers partial, 1 started, 1 ahead
  const testResultInsert = freshDb.prepare(`
    INSERT INTO test_results (user_id, lecture_id, score, answers, completed_at)
    VALUES (?, ?, ?, ?, datetime('now', '-' || ? || ' days'))
  `);

  // Nazariy: 3 lectures done (60%, 75%, 85%)
  testResultInsert.run(nazarId, lectureIds[0], 60, '{"1":"b","2":"c","3":"b","4":"c","5":"b"}', 5);
  testResultInsert.run(nazarId, lectureIds[1], 75, '{"1":"b","2":"c","3":"b","4":"b","5":"b"}', 4);
  testResultInsert.run(nazarId, lectureIds[2], 85, '{"1":"b","2":"b","3":"b","4":"b","5":"b"}', 3);

  // Gleb: 5 lectures done (70%, 80%, 90%, 75%, 95%)
  testResultInsert.run(glebId, lectureIds[0], 70, '{"1":"b","2":"c","3":"b","4":"c","5":"c"}', 7);
  testResultInsert.run(glebId, lectureIds[1], 80, '{"1":"b","2":"c","3":"b","4":"b","5":"a"}', 6);
  testResultInsert.run(glebId, lectureIds[2], 90, '{"1":"b","2":"b","3":"b","4":"b","5":"b"}', 5);
  testResultInsert.run(glebId, lectureIds[3], 75, '{"1":"b","2":"a","3":"b","4":"c","5":"b"}', 4);
  testResultInsert.run(glebId, lectureIds[4], 95, '{"1":"b","2":"b","3":"b","4":"b","5":"b"}', 3);

  // Alena: 8 lectures (high scores, leading)
  testResultInsert.run(alenaId, lectureIds[0], 95, '{"1":"b","2":"c","3":"b","4":"c","5":"b"}', 10);
  testResultInsert.run(alenaId, lectureIds[1], 100, '{"1":"b","2":"c","3":"b","4":"b","5":"b"}', 9);
  testResultInsert.run(alenaId, lectureIds[2], 95, '{"1":"b","2":"b","3":"b","4":"b","5":"b"}', 8);
  testResultInsert.run(alenaId, lectureIds[3], 90, '{"1":"b","2":"b","3":"b","4":"c","5":"b"}', 7);
  testResultInsert.run(alenaId, lectureIds[4], 100, '{"1":"b","2":"b","3":"b","4":"b","5":"b"}', 6);
  testResultInsert.run(alenaId, lectureIds[5], 95, '{"1":"b","2":"b","3":"a","4":"b","5":"b"}', 5);
  testResultInsert.run(alenaId, lectureIds[6], 90, '{"1":"b","2":"b","3":"b","4":"b","5":"a"}', 4);
  testResultInsert.run(alenaId, lectureIds[7], 100, '{"1":"b","2":"b","3":"b","4":"b","5":"b"}', 3);

  // Vasya: just 1 lecture (60% - barely passed)
  testResultInsert.run(vasyaId, lectureIds[0], 60, '{"1":"b","2":"a","3":"a","4":"a","5":"b"}', 2);

  // Activity log
  const activityInsert = freshDb.prepare(`
    INSERT INTO activity_log (user_id, action, lecture_id, created_at)
    VALUES (?, ?, ?, datetime('now', '-' || ? || ' hours'))
  `);

  activityInsert.run(nazarId, 'passed_lecture', lectureIds[2], 3);
  activityInsert.run(glebId, 'passed_lecture', lectureIds[4], 5);
  activityInsert.run(alenaId, 'passed_lecture', lectureIds[7], 6);
  activityInsert.run(vasyaId, 'passed_lecture', lectureIds[0], 10);
  activityInsert.run(alenaId, 'passed_lecture', lectureIds[6], 8);

  console.log('Database seeded successfully!');
  freshDb.close();
  process.exit(0);
});
