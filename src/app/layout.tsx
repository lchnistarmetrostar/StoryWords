import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "StoryWords — 英语单词学习",
  description: "使用 A2 默认词库学习英语单词，查看释义与例句、完成测试，并回顾已学词。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
