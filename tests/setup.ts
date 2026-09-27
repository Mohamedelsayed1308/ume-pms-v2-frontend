import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom بلا matchMedia — الشاشة تسأل عن العرض لتقرّر حجم الصفحة وطيّ الفلاتر
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
afterEach(() => { cleanup(); localStorage.clear(); });
