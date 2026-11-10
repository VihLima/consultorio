// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSubmitOnce } from './useSubmitOnce';

describe('useSubmitOnce', () => {
  it('ignores calls while the first one is pending', async () => {
    let resolve!: (value: string) => void;
    const fn = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const { result } = renderHook(() => useSubmitOnce(fn));

    let first!: Promise<string | undefined>;
    let second!: Promise<string | undefined>;
    act(() => {
      first = result.current.run();
      second = result.current.run();
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(true);
    await expect(second).resolves.toBeUndefined();

    await act(async () => {
      resolve('ok');
      await first;
    });
    await expect(first).resolves.toBe('ok');
    expect(result.current.busy).toBe(false);
  });

  it('allows a new call after a failure and rethrows the error', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(2);
    const { result } = renderHook(() => useSubmitOnce(fn));

    await act(async () => {
      await expect(result.current.run()).rejects.toThrow('boom');
    });
    expect(result.current.busy).toBe(false);
    await act(async () => {
      await expect(result.current.run()).resolves.toBe(2);
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
