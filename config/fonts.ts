import { DM_Sans, Fira_Code } from "next/font/google";

export const fontSans = DM_Sans({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-sans",
});

export const fontMono = Fira_Code({
  subsets: ["latin"],
  variable: "--font-mono",
});
