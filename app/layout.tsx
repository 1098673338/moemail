import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mailbox",
  description: "管理 iCloud 账号和隐藏邮件地址",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
