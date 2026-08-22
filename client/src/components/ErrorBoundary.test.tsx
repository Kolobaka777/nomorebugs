// The error boundary. There used to be exactly one, at the root: a render
// error in any panel replaced the whole application — navigation included —
// with a full-screen message. It can now be scoped to a region.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

vi.mock('../monitoring', () => ({ captureError: vi.fn() }));
const { captureError } = await import('../monitoring');

function Boom(): any { throw new Error('render blew up'); }

// React logs a caught error to the console; here that is expected and only
// clutters the output.
let consoleError: any;
beforeEach(() => { consoleError = vi.spyOn(console, 'error').mockImplementation(() => {}); vi.clearAllMocks(); });
afterEach(() => consoleError.mockRestore());

describe('with no fallback of its own', () => {
  it('shows the full-screen message', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText('что-то пошло не так')).toBeInTheDocument();
  });
});

describe('with a fallback', () => {
  it('shows it instead of the full-screen message', () => {
    render(
      <ErrorBoundary fallback={<p>this section did not open</p>}>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('this section did not open')).toBeInTheDocument();
    expect(screen.queryByText('что-то пошло не так')).not.toBeInTheDocument();
  });

  it('leaves everything outside the boundary alive', () => {
    // The whole point: navigation survives a page that failed to render.
    render(
      <div>
        <nav>Меню</nav>
        <ErrorBoundary fallback={<p>this section did not open</p>}>
          <Boom />
        </ErrorBoundary>
      </div>
    );
    expect(screen.getByText('Меню')).toBeInTheDocument();
    expect(screen.getByText('this section did not open')).toBeInTheDocument();
  });

  it('treats an empty fallback as a fallback, not as none', () => {
    const { container } = render(<ErrorBoundary fallback={null}><Boom /></ErrorBoundary>);
    expect(screen.queryByText('что-то пошло не так')).not.toBeInTheDocument();
    expect(container.textContent).toBe('');
  });
});

describe('the error report', () => {
  it('carries the region name, not only a component stack', () => {
    render(<ErrorBoundary label="route:/guides" fallback={<p>oh well</p>}><Boom /></ErrorBoundary>);
    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ boundary: 'route:/guides' })
    );
  });

  it('reports as the root when unlabelled', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ boundary: 'root' })
    );
  });
});

describe('a subtree that works', () => {
  it('renders as normal', () => {
    render(<ErrorBoundary label="x"><p>all good</p></ErrorBoundary>);
    expect(screen.getByText('all good')).toBeInTheDocument();
    expect(captureError).not.toHaveBeenCalled();
  });
});
