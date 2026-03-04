import { supabase } from "@/lib/supabase";

export interface ClinicService {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  currency: string;
  is_active: boolean;
  sort_order: number;
}

export interface Calendar {
  id: string;
  google_calendar_id: string;
  name: string;
  description: string | null;
  color: string | null;
  timezone: string;
  is_active: boolean;
}

export interface AvailableSlot {
  slot_start: string;
  slot_end: string;
  is_available: boolean;
}

export interface Veterinarian {
  id: string;
  name: string;
  specialty: string;
  calendar_id: string | null;
  is_active: boolean;
}

export interface VeterinarianService {
  id: string;
  veterinarian_id: string;
  appointment_type: string;
  label: string;
  price: number;
  holiday_price: number | null;
  duration_minutes: number;
  is_active: boolean;
}

export interface BookingParams {
  phone: string;
  clientName: string;
  email?: string;
  patientName?: string;
  patientSpecies?: string;
  patientBreed?: string;
  serviceId?: string;
  calendarId: string;
  date: string;
  startTime: string;
  notes?: string;
  veterinarianId?: string;
  vetServiceId?: string;
}

export interface BookingResult {
  appointment_id: string;
  client_id: string;
  patient_id: string | null;
  is_new_client: boolean;
  service_name: string;
  date: string;
  start_time: string;
  end_time: string;
}

export async function getCalendars(): Promise<Calendar[]> {
  const { data, error } = await supabase
    .from("calendars")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) throw new Error(error.message);
  return data as Calendar[];
}

export async function getServicesForCalendar(calendarId: string): Promise<ClinicService[]> {
  const { data, error } = await supabase
    .from("service_calendars")
    .select("service_id, clinic_services(*)")
    .eq("calendar_id", calendarId);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row: any) => row.clinic_services)
    .filter((s: ClinicService | null): s is ClinicService => s !== null && s.is_active)
    .sort((a: ClinicService, b: ClinicService) => a.sort_order - b.sort_order);
}

export async function getActiveServices(): Promise<ClinicService[]> {
  const { data, error } = await supabase
    .from("clinic_services")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (error) throw new Error(error.message);
  return data as ClinicService[];
}

export async function getCalendarsForService(serviceId: string): Promise<Calendar[]> {
  const { data, error } = await supabase
    .from("service_calendars")
    .select("calendar_id, calendars(*)")
    .eq("service_id", serviceId);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row: any) => row.calendars)
    .filter((cal: Calendar | null): cal is Calendar => cal !== null && cal.is_active);
}

export async function getVeterinarians(): Promise<Veterinarian[]> {
  const { data, error } = await supabase
    .from("veterinarians")
    .select("id, name, specialty, calendar_id, is_active")
    .eq("is_active", true)
    .order("name");

  if (error) throw new Error(error.message);
  return data as Veterinarian[];
}

export async function getVetServices(veterinarianId: string): Promise<VeterinarianService[]> {
  const { data, error } = await supabase
    .from("veterinarian_services")
    .select("*")
    .eq("veterinarian_id", veterinarianId)
    .eq("is_active", true)
    .order("label");

  if (error) throw new Error(error.message);
  return data as VeterinarianService[];
}

export async function getAvailableSlots(
  calendarId: string,
  date: string,
  serviceId?: string,
  vetServiceId?: string,
): Promise<AvailableSlot[]> {
  const { data, error } = await supabase.rpc("get_available_slots", {
    p_calendar_id: calendarId,
    p_date: date,
    p_service_id: serviceId ?? null,
    p_vet_service_id: vetServiceId ?? null,
  });

  if (error) throw new Error(error.message);
  return ((data as AvailableSlot[]) ?? []).filter((slot) => slot.is_available);
}

export async function bookAppointment(params: BookingParams): Promise<BookingResult> {
  const { data, error } = await supabase.rpc("book_appointment", {
    p_phone: params.phone,
    p_client_name: params.clientName,
    p_email: params.email ?? null,
    p_patient_name: params.patientName ?? null,
    p_patient_species: params.patientSpecies ?? null,
    p_patient_breed: params.patientBreed ?? null,
    p_service_id: params.serviceId ?? null,
    p_calendar_id: params.calendarId,
    p_date: params.date,
    p_start_time: params.startTime,
    p_notes: params.notes ?? null,
    p_veterinarian_id: params.veterinarianId ?? null,
    p_veterinarian_service_id: params.vetServiceId ?? null,
  });

  if (error) {
    if (error.message.includes("Slot not available")) {
      throw new Error("Este horario ya no está disponible. Por favor selecciona otro.");
    }
    throw new Error(error.message);
  }

  return data as BookingResult;
}
