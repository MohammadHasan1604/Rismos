'use client';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class AppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('COSKO Uncaught App Error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/sales';
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[360px] w-full flex items-center justify-center p-6 bg-background">
          <div className="max-w-md w-full p-6 rounded-2xl bg-card border border-border shadow-modal text-center space-y-4 fade-in">
            <div className="w-12 h-12 rounded-2xl bg-danger/10 text-danger border border-danger/20 flex items-center justify-center mx-auto">
              <Icon name="ExclamationTriangleIcon" size={24} />
            </div>

            <div className="space-y-1">
              <AppLogo size={24} showText className="justify-center mb-2" />
              <h3 className="text-base font-bold text-foreground">
                {this.props.fallbackTitle || 'Component Recovered Safely'}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {this.props.fallbackMessage ||
                  'An unexpected runtime issue occurred. The rest of the application remains secure and active.'}
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
              <button
                type="button"
                onClick={this.handleReset}
                className="btn-secondary text-xs py-2 px-3.5 gap-1.5 font-bold"
              >
                <Icon name="ArrowPathIcon" size={14} />
                Try Again
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="btn-ghost text-xs py-2 px-3 gap-1.5"
              >
                Reload
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                className="btn-primary text-xs py-2 px-4 font-bold"
              >
                Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
