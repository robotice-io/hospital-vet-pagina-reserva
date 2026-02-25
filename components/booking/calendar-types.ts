// TODO: MOCKUP - Replace durations with real service durations from backend
export enum DurationEnum {
  ThirtyMinutes = "30m",
  SixtyMinutes = "60m",
}

export const durations = [
  {key: DurationEnum.ThirtyMinutes, label: "30m"},
  {key: DurationEnum.SixtyMinutes, label: "60m"},
];

export const timeZoneOptions = Intl.supportedValuesOf("timeZone").map((timeZone) => ({
  label: timeZone,
  value: timeZone,
}));

export enum TimeFormatEnum {
  TwelveHour = "12h",
  TwentyFourHour = "24h",
}

export const timeFormats = [
  {key: TimeFormatEnum.TwelveHour, label: "12h"},
  {key: TimeFormatEnum.TwentyFourHour, label: "24h"},
];

export interface TimeSlot {
  value: string;
  label: string;
}

export type BookingStepType = "service_selection" | "calendar" | "client_form" | "confirmation";

// TODO: MOCKUP - Replace with real services from backend/database
export interface VetService {
  id: string;
  name: string;
  description: string;
  duration: string;
  price: string;
  icon: string;
}

export const vetServices: VetService[] = [
  {id: "consulta-general", name: "Consulta General", description: "Revisión general de salud para tu mascota", duration: "30 min", price: "$25.000", icon: "solar:stethoscope-bold-duotone"},
  {id: "vacunacion", name: "Vacunación", description: "Aplicación de vacunas según calendario", duration: "30 min", price: "$15.000", icon: "solar:syringe-bold-duotone"},
  {id: "cirugia", name: "Cirugía", description: "Procedimientos quirúrgicos programados", duration: "60 min", price: "$80.000", icon: "solar:scissors-bold-duotone"},
  {id: "dental", name: "Limpieza Dental", description: "Profilaxis y cuidado dental", duration: "60 min", price: "$45.000", icon: "solar:tooth-bold-duotone"},
  {id: "urgencias", name: "Urgencias", description: "Atención de emergencia inmediata", duration: "30 min", price: "$35.000", icon: "solar:heart-pulse-bold-duotone"},
  {id: "peluqueria", name: "Peluquería", description: "Baño y corte para tu mascota", duration: "60 min", price: "$20.000", icon: "solar:scissors-bold-duotone"},
];

// TODO: MOCKUP - Replace with real specialists from backend/database
export interface Specialist {
  id: string;
  name: string;
  specialty: string;
  avatar: string;
  serviceIds: string[];
}

export const specialists: Specialist[] = [
  {id: "dr-garcia", name: "Dr. García", specialty: "Medicina General", avatar: "https://i.pravatar.cc/150?u=dr-garcia", serviceIds: ["consulta-general", "vacunacion", "urgencias"]},
  {id: "dra-lopez", name: "Dra. López", specialty: "Cirugía", avatar: "https://i.pravatar.cc/150?u=dra-lopez", serviceIds: ["cirugia", "urgencias", "consulta-general"]},
  {id: "dr-martinez", name: "Dr. Martínez", specialty: "Dermatología", avatar: "https://i.pravatar.cc/150?u=dr-martinez", serviceIds: ["consulta-general", "peluqueria"]},
  {id: "dra-rodriguez", name: "Dra. Rodríguez", specialty: "Odontología", avatar: "https://i.pravatar.cc/150?u=dra-rodriguez", serviceIds: ["dental", "consulta-general"]},
];

export interface BookingData {
  service: VetService | null;
  specialist: Specialist | null;
  date: string;
  timeSlot: string;
  timeSlotRange: TimeSlot[];
  duration: DurationEnum;
  clientName: string;
  clientEmail: string;
  petName: string;
  petType: string;
  notes: string;
}
