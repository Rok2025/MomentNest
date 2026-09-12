import { describe, expect, it } from 'vitest';
import { mapBounded } from '../src/domain/bounded-parallel';

describe('mapBounded', () => {
  it('keeps independent work within the requested concurrency and preserves order', async () => {
    let active = 0, peak = 0;
    const values = await mapBounded([1, 2, 3, 4, 5], 2, async value => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      return value * 2;
    });
    expect(peak).toBe(2);
    expect(values).toEqual([2, 4, 6, 8, 10]);
  });

  it('waits for already-started work before returning a failure', async () => {
    const completed: number[] = [];
    await expect(mapBounded([1, 2, 3], 2, async value => {
      if (value === 1) throw Error('write failed');
      await new Promise(resolve => setTimeout(resolve, 5));
      completed.push(value);
      return value;
    })).rejects.toThrow('write failed');
    expect(completed).toEqual([2]);
  });
});
