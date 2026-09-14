import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Aref_Ruqaa, Readex_Pro } from "next/font/google";
import "./globals.css";

const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  variable: "--font-readex",
  display: "swap",
});

const ruqaa = Aref_Ruqaa({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  variable: "--font-ruqaa",
  display: "swap",
});

export const metadata: Metadata = {
  title: "أرسل لنفسي — صندوقك الشخصي",
  description:
    "أرسل لنفسك نصوصًا وصورًا وملفات وفيديو وصوت من أي جهاز — جوال أو كمبيوتر. بدون حسابات، كلمة مرور واحدة فقط.",
  applicationName: "أرسل لنفسي",
  appleWebApp: { capable: true, title: "أرسل لنفسي", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#080b11",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${readex.variable} ${ruqaa.variable}`}>
      <body className="min-h-dvh bg-ink-900 font-sans text-paper-100 antialiased">
        {children}
      </body>
    </html>
  );
}
