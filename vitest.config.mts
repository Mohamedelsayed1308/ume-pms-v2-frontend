import { defineConfig } from 'vitest/config';
import path from 'node:path';

// اختبارات مركز التقارير (v1.2). والاختبار القائم `tests/*.test.cjs` يعمل بـ node:test.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    // بيئة jsdom بطيئة الإقلاع على هذا الجهاز — أوّل اختبارٍ في كلّ ملفٍّ يتجاوز ٥ ثوانٍ
    testTimeout: 30000,
    // تشغيل الملفّات متتاليةً: أربع بيئات jsdom متوازية تخنق هذا الجهاز فيتجاوز أوّل اختبارٍ دقيقة
    fileParallelism: false,
  },
});
