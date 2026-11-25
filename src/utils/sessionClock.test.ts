import { formatSessionTime, SessionClock } from '@/utils/sessionClock';

function createFakeTime(): { source: () => number; advance: (ms: number) => void } {
  let now = 1000;
  return {
    source: () => now,
    advance: (ms: number) => {
      now += ms;
    }
  };
}

describe('SessionClock', () => {
  it('starts at 0 and follows the time source while running', () => {
    const time = createFakeTime();
    const clock = new SessionClock(time.source);
    expect(clock.nowMs()).toBe(0);

    clock.start();
    time.advance(1500);
    expect(clock.nowMs()).toBe(1500);
    expect(clock.getState()).toBe('running');
  });

  it('excludes paused spans so timestamps match the video timeline', () => {
    const time = createFakeTime();
    const clock = new SessionClock(time.source);
    clock.start();
    time.advance(2000);
    clock.pause();
    time.advance(5000); // capture interrupted: no frames recorded
    expect(clock.nowMs()).toBe(2000);
    clock.resume();
    time.advance(1000);
    expect(clock.nowMs()).toBe(3000);
  });

  it('freezes on stop and clears on reset', () => {
    const time = createFakeTime();
    const clock = new SessionClock(time.source);
    clock.start();
    time.advance(4000);
    clock.stop();
    time.advance(9000);
    expect(clock.nowMs()).toBe(4000);
    expect(clock.getState()).toBe('stopped');
    expect(clock.isActive).toBe(false);

    clock.reset();
    expect(clock.nowMs()).toBe(0);
    expect(clock.getState()).toBe('idle');
  });

  it('ignores pause/resume in the wrong state', () => {
    const time = createFakeTime();
    const clock = new SessionClock(time.source);
    clock.resume();
    clock.pause();
    expect(clock.getState()).toBe('idle');

    clock.start();
    clock.resume();
    expect(clock.getState()).toBe('running');
  });

  it('restarts from zero on a second start()', () => {
    const time = createFakeTime();
    const clock = new SessionClock(time.source);
    clock.start();
    time.advance(3000);
    clock.stop();
    clock.start();
    time.advance(500);
    expect(clock.nowMs()).toBe(500);
  });
});

describe('formatSessionTime', () => {
  it('formats milliseconds as mm:ss, flooring partial seconds', () => {
    expect(formatSessionTime(0)).toBe('00:00');
    expect(formatSessionTime(999)).toBe('00:00');
    expect(formatSessionTime(14_900)).toBe('00:14');
    expect(formatSessionTime(61_000)).toBe('01:01');
  });

  it('clamps negative values to zero', () => {
    expect(formatSessionTime(-5)).toBe('00:00');
  });
});
