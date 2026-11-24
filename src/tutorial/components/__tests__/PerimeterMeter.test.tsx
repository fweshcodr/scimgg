// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PerimeterMeter } from '../TutorialOverlay';

afterEach(cleanup);

describe('PerimeterMeter', () => {
  it('renders `total` segments', () => {
    const { container } = render(<PerimeterMeter total={5} filled={0} />);
    const segs = container.querySelectorAll('.tutorial-perimeter-seg');
    expect(segs).toHaveLength(5);
  });

  it('renders zero segments when total is 0 without crashing', () => {
    const { container } = render(<PerimeterMeter total={0} filled={0} />);
    const segs = container.querySelectorAll('.tutorial-perimeter-seg');
    expect(segs).toHaveLength(0);
    const meter = container.querySelector('.tutorial-perimeter-meter');
    expect(meter).toBeTruthy();
  });

  it('binary fill — 0/3: no segment has filled class', () => {
    const { container } = render(<PerimeterMeter total={3} filled={0} />);
    const segs = container.querySelectorAll('.tutorial-perimeter-seg');
    expect([...segs].filter((s) => s.classList.contains('filled'))).toHaveLength(0);
  });

  it('binary fill — 1/3: first segment filled, others empty', () => {
    const { container } = render(<PerimeterMeter total={3} filled={1} />);
    const segs = [...container.querySelectorAll('.tutorial-perimeter-seg')];
    expect(segs[0].classList.contains('filled')).toBe(true);
    expect(segs[1].classList.contains('filled')).toBe(false);
    expect(segs[2].classList.contains('filled')).toBe(false);
  });

  it('binary fill — 2/3: first two segments filled', () => {
    const { container } = render(<PerimeterMeter total={3} filled={2} />);
    const segs = [...container.querySelectorAll('.tutorial-perimeter-seg')];
    expect(segs.map((s) => s.classList.contains('filled'))).toEqual([true, true, false]);
  });

  it('binary fill — 3/3 (full): every segment filled', () => {
    const { container } = render(<PerimeterMeter total={3} filled={3} />);
    const segs = [...container.querySelectorAll('.tutorial-perimeter-seg')];
    expect(segs.map((s) => s.classList.contains('filled'))).toEqual([true, true, true]);
  });

  it('does NOT render any half-state "current" class', () => {
    const { container } = render(<PerimeterMeter total={4} filled={2} />);
    const currentSegs = container.querySelectorAll('.tutorial-perimeter-seg.current');
    expect(currentSegs).toHaveLength(0);
  });

  it('clamps gracefully if filled > total (no error, all filled)', () => {
    const { container } = render(<PerimeterMeter total={3} filled={5} />);
    const segs = [...container.querySelectorAll('.tutorial-perimeter-seg')];
    expect(segs).toHaveLength(3);
    expect(segs.every((s) => s.classList.contains('filled'))).toBe(true);
  });

  it('exposes ARIA progressbar role with correct values', () => {
    const { container } = render(<PerimeterMeter total={5} filled={2} />);
    const meter = container.querySelector('[role="progressbar"]');
    expect(meter).toBeTruthy();
    expect(meter?.getAttribute('aria-valuemin')).toBe('0');
    expect(meter?.getAttribute('aria-valuemax')).toBe('5');
    expect(meter?.getAttribute('aria-valuenow')).toBe('2');
  });

  it('does not flag any segment .lost on initial mount, even with a non-zero resetNonce', () => {
    const { container } = render(<PerimeterMeter total={3} filled={2} resetNonce={7} />);
    const segs = [...container.querySelectorAll('.tutorial-perimeter-seg')];
    expect(segs.some((s) => s.classList.contains('lost'))).toBe(false);
  });

  it('blinks the previously-filled segments as .lost when resetNonce increments', () => {
    const { container, rerender } = render(<PerimeterMeter total={3} filled={2} resetNonce={0} />);
    rerender(<PerimeterMeter total={3} filled={0} resetNonce={1} />);
    const segs = [...container.querySelectorAll('.tutorial-perimeter-seg')];
    expect(segs.map((s) => s.classList.contains('lost'))).toEqual([true, true, false]);
    expect(segs.some((s) => s.classList.contains('filled'))).toBe(false);
    expect(segs.every((s) => !(s.classList.contains('filled') && s.classList.contains('lost')))).toBe(true);
  });

  it('does not blink when resetNonce increments but no progress had been made', () => {
    const { container, rerender } = render(<PerimeterMeter total={3} filled={0} resetNonce={0} />);
    rerender(<PerimeterMeter total={3} filled={0} resetNonce={1} />);
    const segs = [...container.querySelectorAll('.tutorial-perimeter-seg')];
    expect(segs.some((s) => s.classList.contains('lost'))).toBe(false);
  });
});
