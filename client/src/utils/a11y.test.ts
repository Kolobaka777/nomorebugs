import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { clickableProps, useEscapeKey } from './a11y';

describe('clickableProps', () => {
  it('sets role=button and tabIndex=0 so the element is keyboard-focusable', () => {
    const props = clickableProps(() => {});
    expect(props.role).toBe('button');
    expect(props.tabIndex).toBe(0);
  });

  it('activates on Enter, calling onActivate and preventing default', () => {
    const onActivate = vi.fn();
    const props = clickableProps(onActivate);
    const preventDefault = vi.fn();
    props.onKeyDown({ key: 'Enter', preventDefault } as any);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('activates on Space too (the other standard button-activation key)', () => {
    const onActivate = vi.fn();
    const props = clickableProps(onActivate);
    props.onKeyDown({ key: ' ', preventDefault: vi.fn() } as any);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('does not activate on unrelated keys', () => {
    const onActivate = vi.fn();
    const props = clickableProps(onActivate);
    props.onKeyDown({ key: 'Tab', preventDefault: vi.fn() } as any);
    props.onKeyDown({ key: 'a', preventDefault: vi.fn() } as any);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('lets Space/Enter reach a nested text input instead of hijacking it (regression: typing a module name toggled the collapsible header and ate the space)', () => {
    const onActivate = vi.fn();
    const props = clickableProps(onActivate);
    const preventDefault = vi.fn();
    props.onKeyDown({ key: ' ', target: { tagName: 'INPUT' }, preventDefault } as any);
    props.onKeyDown({ key: 'Enter', target: { tagName: 'TEXTAREA' }, preventDefault } as any);
    props.onKeyDown({ key: ' ', target: { tagName: 'SELECT' }, preventDefault } as any);
    expect(onActivate).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe('useEscapeKey', () => {
  it('calls the handler when Escape is pressed', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('does not fire for other keys', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('removes its listener on unmount, so it does not fire after the component is gone', () => {
    const onEscape = vi.fn();
    const { unmount } = renderHook(() => useEscapeKey(onEscape));
    unmount();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onEscape).not.toHaveBeenCalled();
  });
});
