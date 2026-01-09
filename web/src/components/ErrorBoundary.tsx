import React from "react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: unknown) => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage?: string;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="p-6">
            <div className="text-slate-900 dark:text-slate-100 text-lg mb-2">Something went wrong</div>
            <div className="text-slate-600 dark:text-slate-400 text-sm">
              {this.state.errorMessage || "Unknown error"}
            </div>
            <div className="text-slate-500 dark:text-slate-500 text-xs mt-3">
              Check the browser console for the full stack trace.
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
