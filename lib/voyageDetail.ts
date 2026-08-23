import type { VesselKey } from '@/lib/profitModel';

/**
 * تفصيل رحلةٍ واحدة — لقطةٌ من دفتر المركب لحظة الجلب.
 *
 * تُخزَّن مع الفترة ولا تُجلَب عند العرض: **الدفتر يتغيّر**. تحصيل صفاجا لأمل في
 * ١٨–٣١ يوليو ٢٠٢٦ صُحِّح بعد إصدار المستند بـ ١٢٬٨٩٨.٩٠. فجلبُ التفصيل لاحقاً
 * يعرض أرقاماً لا تجمع إلى التوزيع المحفوظ — وذلك أسوأ من ألّا يُعرض شيء.
 *
 * وعمودا `Dianna` و`Mafis` في المستند الورقيّ لا وجود لهما في الدفتر: فيه عمود
 * `TRUCK` واحد ومن يُعدّ المستند هو من يقسمه. فتُعرض الشاحنات مجموعةً، وفرقُها
 * عن المستند هو ميناء البسّام — ثبت على رحلة بوسيدون ٦٩ بالسنت.
 *
 * المصدر: `VoyageRow` في `ume-pms-v2/src/modules/profit-periods/profit-periods.service.ts`
 */
export interface VoyageRow {
  ref: number | null;
  dateExp: string;
  dateImp: string;
  nTruckE: number; nTruckI: number; truck: number;
  nVehE: number; nVehI: number; veh: number;
  nPaxE: number; nPaxI: number; pax: number;
  income: number; comm: number; man: number; net: number;
  cashDuba: number; cashSafaga: number; overPax: number;

  /**
   * `BALANCE − (الإيراد − العمولة − المصاريف)` · رصيدٌ لا يساوي بنوده.
   * ثمانٍ وثلاثون رحلة في الدفاتر تحمله، أكبرها بوسيدون ٧٨ بـ ٣٤٠٬٧٦٠.٠٧.
   */
  balanceGap?: number;
  /**
   * `(نقد ضبا + صفاجا) − (BALANCE + البنكر)` · صيغةٌ دِيست بقيمةٍ مكتوبة.
   * الدفتر يحرّره موظّفون مختلفون يومياً، فلا يُوثَق بعمود `CHECK` فيه.
   */
  treasuryGap?: number;
}

/** ما دون هذا تدويرٌ. وأصغر مخالفةٍ حقيقيّة في الدفاتر ٤٥٧.٥٤. */
export const INTEGRITY_TOLERANCE = 0.02;

/** رحلاتٌ لا يتّسق فيها الدفتر مع نفسه — تُستخرج من اللقطة المحفوظة. */
export function integrityIssues(detail: VoyageDetail | null | undefined) {
  const balance: { name: string; ref: number | null; gap: number }[] = [];
  const treasury: { name: string; ref: number | null; gap: number }[] = [];
  if (!detail) return { balance, treasury };
  for (const [key, rows] of Object.entries(detail)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows as VoyageRow[]) {
      const b = Number(r.balanceGap) || 0;
      const t = Number(r.treasuryGap) || 0;
      if (Math.abs(b) > INTEGRITY_TOLERANCE) balance.push({ name: key, ref: r.ref, gap: b });
      // رحلةٌ بلا خزينة عمودٌ لم يُملأ بعد، لا مخالفة
      if ((r.cashDuba || r.cashSafaga) && Math.abs(t) > INTEGRITY_TOLERANCE) {
        treasury.push({ name: key, ref: r.ref, gap: t });
      }
    }
  }
  return { balance, treasury };
}

export type VoyageDetail = Partial<Record<VesselKey, VoyageRow[]>> & { fetchedAt?: string };
