// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TutorialMarkup } from '../TutorialMarkup';

describe('TutorialMarkup', () => {
  it('preserves the supported authored tutorial formatting', () => {
    render(
      <div data-testid="markup">
        <TutorialMarkup html={'Use <b>Magic</b><br><kbd class="kbd">Ctrl + K</kbd>'} />
      </div>,
    );

    const markup = screen.getByTestId('markup');
    expect(markup.querySelector('strong')).toHaveTextContent('Magic');
    expect(markup.querySelector('br')).toBeInTheDocument();
    expect(markup.querySelector('kbd')).toHaveClass('kbd');
  });

  it('drops unsupported elements and attributes while retaining their text', () => {
    render(
      <div data-testid="markup">
        <TutorialMarkup html={'<script>alert(1)</script><a href="https://example.com">Guide</a>'} />
      </div>,
    );

    const markup = screen.getByTestId('markup');
    expect(markup).toHaveTextContent('Guide');
    expect(markup.querySelector('script')).not.toBeInTheDocument();
    expect(markup.querySelector('a')).not.toBeInTheDocument();
  });
});
