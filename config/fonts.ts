import { DM_Sans, Fira_Code, Space_Mono } from "next/font/google";

export const fontSans = DM_Sans({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-sans",
});

export const fontMono = Fira_Code({
  subsets: ["latin"],
  variable: "--font-mono",
});

// Squared / blocky monospace used for the MP card brick secure fields
// (card number, expiry, CVV) so they look credit-card-like.
export const fontCardMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-card-mono",
});
