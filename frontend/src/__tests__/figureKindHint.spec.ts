import { beforeEach, describe, expect, it } from 'vitest';
import { consumePendingFigureKind, pendingFigureKind } from '../composables/figureKindHint';

describe('figureKindHint', () => {
  beforeEach(() => {
    pendingFigureKind.value = null;
  });

  it('hands the pending kind over once and then clears it', () => {
    pendingFigureKind.value = 'photos-2';
    expect(consumePendingFigureKind()).toBe('photos-2');
    expect(pendingFigureKind.value).toBeNull();
    expect(consumePendingFigureKind()).toBeNull();
  });

  it('returns null when no kind was chosen', () => {
    expect(consumePendingFigureKind()).toBeNull();
  });
});
