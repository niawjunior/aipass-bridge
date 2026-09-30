import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ViHokAI — Next Generation AI Intelligence System",
  description:
    "แพลตฟอร์ม AI อัจฉรัย ที่รวมพลังงานหลายโมเดล ค้นหาข้อมูลจริง และทำงานร่วมกันเป็นทีม AI",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#02050a] text-white">
        {children}
      </body>
    </html>
  );
}
