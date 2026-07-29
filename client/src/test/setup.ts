import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Without globals:true in the vitest config, @testing-library/react's
// automatic afterEach cleanup doesn't self-register — without this, a
// component rendered in one test stays in the DOM for the next one.
afterEach(() => cleanup());
