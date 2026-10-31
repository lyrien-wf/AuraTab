// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Clock } from './Clock';

/** 刷新时机（P2-1 修复验证）：对齐墙钟边界，分钟准点跳变、不提前不迟到 */
describe('Clock 刷新时机', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('不显示秒：分钟准点跳变，边界前不提前跳', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T10:00:30'));
    render(<Clock cfg={{ format24h: true, showSeconds: false, showDate: false }} />);
    expect(screen.getByText('10:00')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(29_900); // 10:00:59.9，距整分钟还差 100ms
    });
    expect(screen.getByText('10:00')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(200); // 跨过 10:01:00
    });
    expect(screen.getByText('10:01')).toBeTruthy();
  });

  it('显示秒：对齐整秒刷新', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T10:00:30.400'));
    render(<Clock cfg={{ format24h: true, showSeconds: true, showDate: false }} />);
    expect(screen.getByText('10:00:30')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(600); // 对齐到 10:00:31
    });
    expect(screen.getByText('10:00:31')).toBeTruthy();
  });
});
