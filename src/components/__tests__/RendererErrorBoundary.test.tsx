// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RendererErrorBoundary } from '../RendererErrorBoundary';

const originalError = console.error;
beforeAll(() => {
  console.error = vi.fn();
});

afterAll(() => {
  console.error = originalError;
});

describe('RendererErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <RendererErrorBoundary>
        <div>Test content</div>
      </RendererErrorBoundary>,
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('catches errors and displays fallback UI', () => {
    const ThrowError = () => {
      throw new Error('WebGL initialization failed');
    };

    render(
      <RendererErrorBoundary>
        <ThrowError />
      </RendererErrorBoundary>,
    );

    expect(screen.getByText('WebGL unavailable, using simple graphics')).toBeInTheDocument();
    expect(screen.getByText(/The 3D renderer encountered an error/)).toBeInTheDocument();
  });

  it('displays error details in collapsible section', () => {
    const ThrowError = () => {
      throw new Error('WebGL context lost');
    };

    render(
      <RendererErrorBoundary>
        <ThrowError />
      </RendererErrorBoundary>,
    );

    const detailsButton = screen.getByText('Error details');
    expect(detailsButton).toBeInTheDocument();
  });

  it('provides a retry button that is clickable', async () => {
    const user = userEvent.setup();

    const ThrowError = () => {
      throw new Error('Renderer failed');
    };

    render(
      <RendererErrorBoundary>
        <ThrowError />
      </RendererErrorBoundary>,
    );

    expect(screen.getByText('WebGL unavailable, using simple graphics')).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: /Retry WebGL/i });
    expect(retryButton).toBeInTheDocument();
    await user.click(retryButton);
  });

  it('logs error to console for debugging', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ThrowError = () => {
      throw new Error('Test error');
    };

    render(
      <RendererErrorBoundary>
        <ThrowError />
      </RendererErrorBoundary>,
    );

    // errorInfo rides along in the same call rather than a second log line, and
    // its componentStack is the only part that says where the subtree broke.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Renderer]',
      'Renderer error caught by boundary:',
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );

    consoleErrorSpy.mockRestore();
  });
});
