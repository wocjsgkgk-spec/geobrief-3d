import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GeoBrief 3D - 군 유휴부지 브리핑 맵 빌더',
  description: '강원특별자치도 군 유휴부지 및 인프라 분석 3D 지형 브리핑 시스템',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <body className="bg-[#0b0f0d] text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
