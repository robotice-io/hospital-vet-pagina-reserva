export enum TimeFormatEnum {
  TwelveHour = "12h",
  TwentyFourHour = "24h",
}

export const timeFormats = [
  { key: TimeFormatEnum.TwelveHour, label: "12h" },
  { key: TimeFormatEnum.TwentyFourHour, label: "24h" },
];

export interface TimeSlot {
  value: string;
  label: string;
}

export type BookingStepType = "service_selection" | "calendar" | "client_form" | "confirmation";
