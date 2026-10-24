import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import { SettingsProvider } from "@/components/SettingsProvider";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "GitHub Code Explorer — 代码分析可视化工具",
  description:
    "输入 GitHub 项目地址，可视化浏览项目文件结构并查看语法高亮的代码内容。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${roboto.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
