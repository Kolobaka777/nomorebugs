import { Component, ErrorInfo, ReactNode } from 'react';
import { captureError } from '../monitoring';

interface Props {
  children: ReactNode;
  // Rendered instead of the full-screen message when this boundary guards
  // one region rather than the whole app. Without it every render error
  // anywhere — a malformed rich-text document in one panel, a bad date in
  // one card — replaced the entire application with "что-то пошло не так",
  // including the navigation needed to get somewhere else.
  fallback?: ReactNode;
  // Names the region in the console/Sentry report, so "which panel" does not
  // have to be reconstructed from a component stack.
  label?: string;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', this.props.label ?? 'root', error, info.componentStack);
    captureError(error, { componentStack: info.componentStack, boundary: this.props.label ?? 'root' });
  }

  render() {
    if (this.state.hasError && this.props.fallback !== undefined) {
      return this.props.fallback;
    }
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col justify-center items-center h-screen text-center px-6"
          style={{ background: '#0B0C10' }}
        >
          <p className="font-pixel text-primary text-xs mb-4" style={{ lineHeight: 1.8 }}>
            что-то пошло не так
          </p>
          <p className="text-pixel/60 text-sm font-sans mb-6 max-w-md">
            Приложение столкнулось с непредвиденной ошибкой. Попробуйте перезагрузить страницу.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary px-4 py-2 text-xs font-sans cursor-pointer"
          >
            Перезагрузить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
