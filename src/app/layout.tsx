import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "EduManager - 教育讲义管理系统",
  description: "讲义上传、管理与在线浏览",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="scroll-smooth">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}