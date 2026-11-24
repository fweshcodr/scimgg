import React from 'react';
import { THEME } from '../theme';
import { log } from '../util/Logger';
import { DisclosureChevron } from './ui/DisclosureChevron';

interface RendererErrorBoundaryProps {
  children: React.ReactNode;
}

interface RendererErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

export class RendererErrorBoundary extends React.Component<RendererErrorBoundaryProps, RendererErrorBoundaryState> {
  constructor(props: RendererErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<RendererErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    log.error('Renderer', 'Renderer error caught by boundary:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState((prevState) => ({
      hasError: false,
      error: null,
      retryCount: prevState.retryCount + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: THEME.spacing.md,
            padding: THEME.spacing.md,
            backgroundColor: THEME.colors.surface,
            border: `1px solid ${THEME.colors.warning}`,
            borderRadius: '4px',
            maxWidth: '600px',
            margin: '0 auto',
            marginTop: THEME.spacing.lg,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: THEME.spacing.sm }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <h3 style={{ margin: 0, color: THEME.colors.warning }}>WebGL unavailable, using simple graphics</h3>
          </div>
          <p style={{ margin: 0, color: THEME.colors.warning, fontSize: '14px' }}>
            The 3D renderer encountered an error. The application will continue using Canvas2D rendering.
          </p>
          {this.state.error && (
            <details style={{ fontSize: '12px', color: THEME.colors.warning }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                <DisclosureChevron />
                Error details
              </summary>
              <pre
                style={{
                  marginTop: THEME.spacing.sm,
                  padding: THEME.spacing.sm,
                  backgroundColor: 'rgba(0, 0, 0, 0.05)',
                  borderRadius: '2px',
                  overflow: 'auto',
                  maxHeight: '200px',
                  fontSize: '11px',
                }}
              >
                {this.state.error.message}
              </pre>
            </details>
          )}
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: `${THEME.spacing.sm} ${THEME.spacing.md}`,
              backgroundColor: THEME.colors.warning,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              color: THEME.colors.background,
              fontSize: '14px',
              alignSelf: 'flex-start',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = THEME.colors.primaryHover;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = THEME.colors.warning;
            }}
          >
            Retry WebGL
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
