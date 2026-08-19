import type { Metadata } from "next";
import { Cairo, Geist_Mono, IBM_Plex_Sans_Arabic, Inter_Tight } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

/*
 * خطّا الهوية — يُحمَّلان ولا يُغيّران خطّ التطبيق.
 *
 * `Inter Tight` هو خطّ موقع الشركة نفسه (umeshipping.com) بوزن 800 وتباعدٍ سالب
 * في العناوين. يُستعمل هنا للأرقام وأسماء المراكب فتُقرأ اللوحة امتداداً للهوية
 * لا جزيرةً بجوارها. و`IBM Plex Sans Arabic` رفيقه في النصّ العربي — والموقع
 * إنجليزيٌّ فلا عربيَّ فيه يُحتذى.
 *
 * و`Cairo` يبقى خطّ بقيّة المنظومة كما هو.
 */
const brand = Inter_Tight({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const plex = IBM_Plex_Sans_Arabic({
  variable: "--font-plex",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UME PMS — نظام إدارة المشتريات والأسطول",
  description: "منصة UME Holding لإدارة المشتريات والمدفوعات والأسطول",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${cairo.variable} ${geistMono.variable} ${brand.variable} ${plex.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
