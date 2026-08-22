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
}

export type VoyageDetail = Partial<Record<VesselKey, VoyageRow[]>> & { fetchedAt?: string };
