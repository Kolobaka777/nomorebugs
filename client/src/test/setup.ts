import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// Without globals:true in the vitest config, @testing-library/react's
// automatic afterEach cleanup doesn't self-register — without this, a
// component rendered in one test stays in the DOM for the next one.
afterEach(() => cleanup());

// Several screens put their heavy parts behind React.lazy — the rich-text
// editor most of all, which is by far the largest chunk in the build. Its
// dynamic import resolves in a few milliseconds when a test file runs on
// its own and in well over a second when the whole suite is competing for
// the same machine, so findBy*/waitFor's 1s default turned "the editor is
// slow to load today" into a test failure. Four seconds is still far short
// of the 5s test timeout, so a genuinely missing element still fails fast
// rather than hanging.
configure({ asyncUtilTimeout: 4000 });
