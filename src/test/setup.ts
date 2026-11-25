import '@testing-library/jest-dom/vitest';

class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

global.ResizeObserver = MockResizeObserver;

// jsdom does not implement media playback; stub it so unmount cleanup never logs "Not implemented".
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  writable: true,
  value: (): Promise<void> => Promise.resolve()
});
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  writable: true,
  value: (): void => undefined
});
