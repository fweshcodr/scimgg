// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { CreditsModal } from '../CreditsModal';

// Fixed list so the test exercises both rendering branches (with / without a
// url) regardless of who is actually credited in contributors.ts.
vi.mock('../contributors', () => ({
  CONTRIBUTORS: [{ name: 'Alpha', url: 'https://example.com/alpha' }, { name: 'Beta' }],
}));

describe('CreditsModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<CreditsModal isOpen={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the heading and every contributor when open', () => {
    render(<CreditsModal isOpen onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Thanks' })).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('links a contributor that has a url and leaves the rest as plain text', () => {
    render(<CreditsModal isOpen onClose={() => {}} />);
    const link = screen.getByRole('link', { name: 'Alpha' });
    expect(link).toHaveAttribute('href', 'https://example.com/alpha');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('link', { name: 'Beta' })).toBeNull();
  });

  it('links to the third-party license notices', () => {
    render(<CreditsModal isOpen onClose={() => {}} />);
    const link = screen.getByRole('link', { name: 'Third-party licenses' });
    expect(link).toHaveAttribute('href', '/licenses.txt');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<CreditsModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click but not when the card body is clicked', () => {
    const onClose = vi.fn();
    render(<CreditsModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('heading', { name: 'Thanks' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
