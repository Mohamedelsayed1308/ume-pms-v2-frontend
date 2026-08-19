/**
 * صور المراكب.
 *
 * مأخوذة من `umeshipping.com` — صور الشركة نفسها لا صوراً عامّة عن سفن. ومحفوظة
 * في `public/vessels/` بمقاسٍ للويب (نحو 1536 بكسلاً) لا بالأصل الذي يبلغ ستّة
 * آلاف: صفحةٌ تحمل ثمانية أصولٍ خام تُحمّل عشرات الميغابايت.
 *
 * ── ولماذا مطابقةٌ بالاسم لا عمودٌ في القاعدة ──
 * إضافة `photo_url` تعني هجرةً وشاشة رفعٍ وحقلاً يُملأ يدوياً لكل مركب. والصور
 * أربع لأسطولٍ من ثمانية، فالثمن أكبر من العائد الآن. ومتى صارت لكل مركبٍ صورة
 * — أو أراد المالك رفع صوره — يُنقل هذا إلى القاعدة والمطابقة تبقى احتياطاً.
 */

const PHOTOS: Record<string, string> = {
  'gubal trader': '/vessels/gubal-trader.jpg',
  'alcudia express': '/vessels/alcudia-express.jpg',
  'wasa express': '/vessels/wasa-express.jpg',
  'poseidon express': '/vessels/poseidon-express.webp',
};

/**
 * يُرجع مسار صورة المركب أو `null`.
 *
 * والمطابقة الجزئية بالكلمة الأولى مقصودة: اللوحة تُسمّي المركب `ALCUDIA`
 * وشاشة السفن تُسمّيه `Alcudia Express`، وهما مركبٌ واحد. ولا تُطابَق كلمةٌ
 * أقصر من أربعة أحرف حتى لا يلتقط اسمٌ قصير صورةَ غيره.
 */
export function vesselPhoto(name?: string | null): string | null {
  const k = String(name || '').trim().toLowerCase();
  if (!k) return null;
  if (PHOTOS[k]) return PHOTOS[k];
  const first = k.split(/[\s—-]+/)[0];
  if (first.length < 4) return null;
  const hit = Object.keys(PHOTOS).find((p) => p === first || p.split(' ')[0] === first);
  return hit ? PHOTOS[hit] : null;
}
