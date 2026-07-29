import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import InstallPrompt from './InstallPrompt';

function stubMatchMedia(standalone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query === '(display-mode: standalone)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as any;
}

function fireBeforeInstallPrompt() {
  const event = new Event('beforeinstallprompt') as any;
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  // Dispatched outside of RTL's fireEvent (this is a window-level custom
  // event, not a DOM interaction on a rendered element), so the resulting
  // setState needs an explicit act() wrap for the re-render to be flushed
  // before assertions run.
  act(() => { window.dispatchEvent(event); });
  return event;
}

beforeEach(() => {
  localStorage.clear();
  stubMatchMedia(false);
});

describe('InstallPrompt', () => {
  it('renders nothing before beforeinstallprompt has fired', () => {
    render(<InstallPrompt />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the banner once beforeinstallprompt fires', () => {
    render(<InstallPrompt />);
    fireBeforeInstallPrompt();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/установить baga-net/i)).toBeInTheDocument();
  });

  it('never shows if the app is already running standalone (already installed)', () => {
    stubMatchMedia(true);
    render(<InstallPrompt />);
    fireBeforeInstallPrompt();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('dismissing hides the banner and persists the dismissal so it will not reappear', () => {
    render(<InstallPrompt />);
    fireBeforeInstallPrompt();
    fireEvent.click(screen.getByLabelText('Закрыть предложение установки'));

    expect(screen.queryByRole('status')).toBeNull();
    expect(localStorage.getItem('install_prompt_dismissed')).toBe('true');
  });

  it('clicking install invokes the native prompt and then hides the banner', async () => {
    render(<InstallPrompt />);
    const event = fireBeforeInstallPrompt();
    fireEvent.click(screen.getByText('Установить'));

    await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it('a dismissal from a previous session (localStorage already set) suppresses the banner immediately', () => {
    localStorage.setItem('install_prompt_dismissed', 'true');
    render(<InstallPrompt />);
    fireBeforeInstallPrompt();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
