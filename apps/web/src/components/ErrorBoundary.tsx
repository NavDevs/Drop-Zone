import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center relative z-10">
          <div className="border-2 border-sunsetOrange border-t-4 border-t-sunsetOrange bg-cardBg/95 p-6 shadow-[0_0_25px_rgba(255,153,0,0.3)] max-w-md w-full backdrop-blur-md">
            <div className="flex items-center justify-center gap-2 mb-2 font-mono text-xs text-sunsetOrange uppercase tracking-widest font-bold">
              <span>[!] SYSTEM FAULT DETECTED</span>
            </div>
            <h2 className="font-heading text-lg font-bold text-white uppercase">
              Something went wrong
            </h2>
            <p className="mt-2 text-xs font-mono text-chrome/70">
              {this.state.error?.message || 'An unexpected error occurred in DropZone.'}
            </p>
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={this.handleReload}
                className="-skew-x-12 hover:skew-x-0 border-2 border-sunsetOrange vapor-button-orange hover-vapor-orange px-6 py-2.5 font-heading text-xs font-black uppercase tracking-widest text-white transition cursor-pointer"
              >
                <span className="inline-block skew-x-12 hover:skew-x-0">
                  Reload App
                </span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
