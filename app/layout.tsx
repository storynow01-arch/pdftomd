import type { Metadata } from 'next';
import './globals.css';
import ThemeSwitcher from './components/ThemeSwitcher';

export const metadata: Metadata = {
  title: '行事曆解析系統',
  description: '上傳 PDF，自動解析行事曆內容並同步到 Notion 與 Google 行事曆',
  keywords: ['行事曆', 'PDF', 'Notion', 'Google Calendar', '自動化'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+TC:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <ThemeSwitcher />
        <div style={{ position: 'relative', zIndex: 1 }}>
          {children}
        </div>
      </body>
    </html>
  );
}
