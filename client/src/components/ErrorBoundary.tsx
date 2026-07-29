import { Component, ErrorInfo, ReactNode } from 'react';
import { captureError } from '../monitoring';

interface Props {
  children: ReactNode;
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
    console.error('Unhandled render error:', error, info.componentStack);
    captureError(error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col justify-center items-center h-screen text-center px-6"
          style={{ background: '#0f0f1a' }}
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
