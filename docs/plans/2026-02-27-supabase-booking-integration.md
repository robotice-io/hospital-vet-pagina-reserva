# Supabase Booking Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all mock/hardcoded data in the booking wizard with live Supabase backend calls so users can book real appointments.

**Architecture:** The existing Next.js 15 App Router UI has a 4-step booking wizard built with HeroUI components. All data is currently hardcoded mock data. We will create a Supabase client library layer (`lib/supabase.ts`, `lib/booking.ts`) that wraps RPC calls to existing Postgres functions (`get_available_slots`, `book_appointment`), then rewire each wizard step to use live data. The flow changes from Specialist→Service to Service→Calendar (where calendars represent vets/rooms). No `src/` directory exists; files live at root with `@/*` path alias.

**Tech Stack:** Next.js 15 (App Router), TypeScript, @supabase/supabase-js (already installed), HeroUI, Tailwind CSS 4, Framer Motion, date-fns, @internationalized/date

---

## Pre-existing State

Things already done before this plan begins:

- `@supabase/supabase-js` is installed in `package.json`
- 6 services seeded into `clinic_services` table
- 4 calendars seeded into `calendars` table (Dr. García, Dra. López, Dr. Martínez, Dra. Rodríguez)
- Backend RPC functions `book_appointment` and `get_available_slots` exist and are correct
- RLS policies are configured for anon access

**Still missing:** `service_calendars` mappings, `availability_config` business hours, `.env.local`, all lib/type files, all component refactors.

---

### Task 1: Complete Seed Data (service_calendars + availability_config)

**Context:** The `get_available_slots()` RPC requires `availability_config` rows to know business hours, and `service_calendars` to map which vet handles which service. Without these, the RPC returns empty arrays.

**Step 1: Insert service_calendars via Supabase MCP**

Run this SQL via `execute_sql` MCP tool against project `rakuixxlscclchnsvuom`:

```sql
-- Map services to calendars (which vet does which service)
-- Dr. García: Consulta General, Vacunación, Urgencias
-- Dra. López: Cirugía, Urgencias, Consulta General
-- Dr. Martínez: Consulta General, Peluquería
-- Dra. Rodríguez: Limpieza Dental, Consulta General
INSERT INTO service_calendars (service_id, calendar_id)
SELECT s.id, c.id FROM clinic_services s, calendars c
WHERE (s.name = 'Consulta General' AND c.name = 'Dr. García')
   OR (s.name = 'Vacunación' AND c.name = 'Dr. García')
   OR (s.name = 'Urgencias' AND c.name = 'Dr. García')
   OR (s.name = 'Cirugía' AND c.name = 'Dra. López')
   OR (s.name = 'Urgencias' AND c.name = 'Dra. López')
   OR (s.name = 'Consulta General' AND c.name = 'Dra. López')
   OR (s.name = 'Consulta General' AND c.name = 'Dr. Martínez')
   OR (s.name = 'Peluquería' AND c.name = 'Dr. Martínez')
   OR (s.name = 'Limpieza Dental' AND c.name = 'Dra. Rodríguez')
   OR (s.name = 'Consulta General' AND c.name = 'Dra. Rodríguez');
```

**Step 2: Insert availability_config via Supabase MCP**

```sql
-- Business hours: Mon-Fri 09:00-18:00, Sat 09:00-13:00 for all calendars
INSERT INTO availability_config (calendar_id, day, start_time, end_time, slot_duration_minutes, max_concurrent, is_active)
SELECT c.id, d.day, d.start_time, d.end_time, 30, 1, true
FROM calendars c
CROSS JOIN (VALUES
  ('monday'::day_of_week, '09:00'::time, '18:00'::time),
  ('tuesday'::day_of_week, '09:00'::time, '18:00'::time),
  ('wednesday'::day_of_week, '09:00'::time, '18:00'::time),
  ('thursday'::day_of_week, '09:00'::time, '18:00'::time),
  ('friday'::day_of_week, '09:00'::time, '18:00'::time),
  ('saturday'::day_of_week, '09:00'::time, '13:00'::time)
) AS d(day, start_time, end_time);
```

**Step 3: Verify seed data**

```sql
SELECT cs.name as service, cal.name as calendar
FROM service_calendars sc
JOIN clinic_services cs ON cs.id = sc.service_id
JOIN calendars cal ON cal.id = sc.calendar_id
ORDER BY cs.sort_order, cal.name;
```

Expected: 10 rows mapping services to calendars.

```sql
SELECT cal.name, ac.day, ac.start_time, ac.end_time
FROM availability_config ac
JOIN calendars cal ON cal.id = ac.calendar_id
ORDER BY cal.name, ac.day;
```

Expected: 24 rows (4 calendars × 6 days each).

---

### Task 2: Create .env.local

**Files:**
- Create: `.env.local`

**Step 1: Create the environment file**

```env
NEXT_PUBLIC_SUPABASE_URL=https://rakuixxlscclchnsvuom.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJha3VpeHhsc2NjbGNobnN2dW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNTQ2NjgsImV4cCI6MjA4NzczMDY2OH0.2ypn66LRWAeXMXlfyl8t9Xc7zguI3TFyNnBQ6Zz1pa0
```

**Step 2: Verify .gitignore includes it**

Run: `grep '.env*.local' .gitignore`
Expected: `.env*.local` is listed (already confirmed present).

**Step 3: Commit**

```bash
git add .env.local
# Do NOT commit — .gitignore excludes it. Just confirm it's ignored.
git status
```

Expected: `.env.local` does NOT show as untracked (gitignored).

---

### Task 3: Create lib/supabase.ts (Supabase Client)

**Files:**
- Create: `lib/supabase.ts`

**Step 1: Write the Supabase client module**

```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**Step 2: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: No import errors related to supabase.

**Step 3: Commit**

```bash
git add lib/supabase.ts
git commit -m "feat: add Supabase client configuration"
```

---

### Task 4: Create lib/booking.ts (API Functions)

**Files:**
- Create: `lib/booking.ts`

**Context:** These are the 4 functions from the integration guide. They wrap Supabase queries and RPC calls. The `book_appointment` RPC is `SECURITY DEFINER` so it bypasses RLS. The `get_available_slots` RPC returns slots with `is_available` boolean. The other two are direct table queries.

**Step 1: Write the booking library**

```typescript
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

export interface BookingParams {
  phone: string;
  clientName: string;
  email?: string;
  patientName?: string;
  patientSpecies?: string;
  patientBreed?: string;
  serviceId: string;
  calendarId: string;
  date: string;
  startTime: string;
  notes?: string;
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

export async function getAvailableSlots(
  calendarId: string,
  date: string,
  serviceId?: string,
): Promise<AvailableSlot[]> {
  const { data, error } = await supabase.rpc("get_available_slots", {
    p_calendar_id: calendarId,
    p_date: date,
    p_service_id: serviceId ?? null,
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
    p_service_id: params.serviceId,
    p_calendar_id: params.calendarId,
    p_date: params.date,
    p_start_time: params.startTime,
    p_notes: params.notes ?? null,
  });

  if (error) {
    if (error.message.includes("Slot not available")) {
      throw new Error("Este horario ya no está disponible. Por favor selecciona otro.");
    }
    throw new Error(error.message);
  }

  return data as BookingResult;
}
```

**Step 2: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: No errors.

**Step 3: Commit**

```bash
git add lib/booking.ts
git commit -m "feat: add booking API functions wrapping Supabase RPCs"
```

---

### Task 5: Update calendar-types.ts (Remove Mock Data, Update Types)

**Files:**
- Modify: `components/booking/calendar-types.ts` (full rewrite)

**Context:** This file currently holds mock `vetServices[]`, `specialists[]`, and their interfaces. We need to:
1. Remove all mock data arrays
2. Remove `VetService` and `Specialist` interfaces (replaced by `ClinicService` and `Calendar` from `lib/booking.ts`)
3. Keep `DurationEnum`, `TimeFormatEnum`, `TimeSlot`, `BookingStepType`, and format helpers — these are UI-only concerns
4. Update `BookingData` to match new schema (use `ClinicService` + `Calendar` instead of `VetService` + `Specialist`, add `phone`)

**Step 1: Rewrite calendar-types.ts**

```typescript
import type { BookingResult, Calendar, ClinicService } from "@/lib/booking";

export const timeZoneOptions = Intl.supportedValuesOf("timeZone").map((timeZone) => ({
  label: timeZone,
  value: timeZone,
}));

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

export interface BookingData {
  service: ClinicService | null;
  calendar: Calendar | null;
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  petName: string;
  petType: string;
  notes: string;
  result?: BookingResult;
}
```

**Step 2: Verify build — EXPECT ERRORS**

Run: `npx next build 2>&1 | head -50`
Expected: Errors in files that import removed symbols (`vetServices`, `specialists`, `DurationEnum`, `VetService`, `Specialist`). This is correct — we fix these in subsequent tasks.

**Step 3: Commit**

```bash
git add components/booking/calendar-types.ts
git commit -m "refactor: replace mock types with Supabase-backed types in calendar-types"
```

---

### Task 6: Refactor step-service-selection.tsx

**Files:**
- Modify: `components/booking/step-service-selection.tsx` (full rewrite)

**Context:** Currently shows specialists first, then filters services. New flow: show services directly from DB. If a service has multiple calendars (vets), the calendar selection happens in the next step. Remove all specialist UI.

**Step 1: Rewrite step-service-selection.tsx**

```typescript
"use client";

import { useEffect, useState } from "react";
import { Button, Card, Spinner } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { ClinicService } from "@/lib/booking";
import { getActiveServices } from "@/lib/booking";

const serviceIcons: Record<string, string> = {
  "Consulta General": "solar:stethoscope-bold-duotone",
  "Vacunación": "solar:syringe-bold-duotone",
  "Cirugía": "solar:scissors-bold-duotone",
  "Limpieza Dental": "solar:tooth-bold-duotone",
  "Urgencias": "solar:heart-pulse-bold-duotone",
  "Peluquería": "solar:scissors-bold-duotone",
};

function formatPrice(price: number | null, currency: string): string {
  if (price === null) return "";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: 0 }).format(price);
}

interface StepServiceSelectionProps {
  selectedService: ClinicService | null;
  onServiceChange: (service: ClinicService) => void;
  onNext: () => void;
}

export default function StepServiceSelection({
  selectedService,
  onServiceChange,
  onNext,
}: StepServiceSelectionProps) {
  const [services, setServices] = useState<ClinicService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getActiveServices()
      .then(setServices)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner color="primary" size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <Icon className="text-danger" icon="solar:danger-triangle-bold-duotone" width={40} />
        <p className="text-small text-danger">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0 flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-default-foreground">
          Selecciona un Servicio
        </h2>
        <p className="text-small text-default-500">
          Elige el tipo de atención para tu mascota
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {services.map((service) => (
            <Card
              key={service.id}
              isPressable
              shadow="none"
              className={`cursor-pointer transition-all ${
                selectedService?.id === service.id
                  ? "border-2 border-primary"
                  : "border border-default-200 hover:border-default-400"
              }`}
              onPress={() => onServiceChange(service)}
            >
              <div className="flex flex-col gap-2 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-default-100 p-2">
                    <Icon
                      className="text-default-600"
                      icon={serviceIcons[service.name] ?? "solar:medical-kit-bold-duotone"}
                      width={24}
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <p className="font-medium text-default-foreground">{service.name}</p>
                    <p className="text-tiny text-default-500">{service.description}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-small">
                  <span className="text-default-500">{service.duration_minutes} min</span>
                  <span className="font-semibold text-primary">
                    {formatPrice(service.price, service.currency)}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Button
        className="shrink-0 w-full"
        color="primary"
        isDisabled={!selectedService}
        onPress={onNext}
      >
        Continuar
      </Button>
    </div>
  );
}
```

**Step 2: Verify no lint errors in this file**

Run: ReadLints on `components/booking/step-service-selection.tsx`

**Step 3: Commit**

```bash
git add components/booking/step-service-selection.tsx
git commit -m "refactor: load services from Supabase, remove specialist-first flow"
```

---

### Task 7: Refactor step-calendar.tsx

**Files:**
- Modify: `components/booking/step-calendar.tsx` (significant changes)

**Context:** Currently generates all 24h time slots client-side. New version must:
1. Accept `serviceId` and `calendarId` props
2. When a service has multiple calendars, show a calendar (vet) selector
3. On date change, call `getAvailableSlots(calendarId, date, serviceId)` from the backend
4. Only show the returned available slots (not all 24h slots)
5. Auto-select the calendar if there's only one
6. Disable weekends AND dates with no availability

**Step 1: Rewrite step-calendar.tsx**

```typescript
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Calendar,
  Card,
  ScrollShadow,
  Spinner,
  type DateValue,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { getLocalTimeZone, today, isWeekend } from "@internationalized/date";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";

import type { AvailableSlot, Calendar as CalendarType } from "@/lib/booking";
import { getAvailableSlots, getCalendarsForService } from "@/lib/booking";

interface StepCalendarProps {
  serviceId: string;
  selectedCalendar: CalendarType | null;
  onCalendarChange: (calendar: CalendarType) => void;
  selectedDate: DateValue;
  onDateChange: (date: DateValue) => void;
  selectedSlot: AvailableSlot | null;
  onSlotChange: (slot: AvailableSlot) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function StepCalendar({
  serviceId,
  selectedCalendar,
  onCalendarChange,
  selectedDate,
  onDateChange,
  selectedSlot,
  onSlotChange,
  onBack,
  onNext,
}: StepCalendarProps) {
  const [calendars, setCalendars] = useState<CalendarType[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(true);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    setLoadingCalendars(true);
    getCalendarsForService(serviceId)
      .then((cals) => {
        setCalendars(cals);
        if (cals.length === 1) {
          onCalendarChange(cals[0]);
        }
      })
      .finally(() => setLoadingCalendars(false));
  }, [serviceId]);

  const dateString = useMemo(
    () => `${selectedDate.year}-${String(selectedDate.month).padStart(2, "0")}-${String(selectedDate.day).padStart(2, "0")}`,
    [selectedDate],
  );

  useEffect(() => {
    if (!selectedCalendar) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    getAvailableSlots(selectedCalendar.id, dateString, serviceId)
      .then(setSlots)
      .finally(() => setLoadingSlots(false));
  }, [selectedCalendar, dateString, serviceId]);

  const isDateUnavailable = (date: DateValue) => {
    return isWeekend(date, "en-US");
  };

  function formatSlotTime(time: string): string {
    const [h, m] = time.split(":");
    const hours = parseInt(h, 10);
    const period = hours >= 12 ? "PM" : "AM";
    const display = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${display}:${m} ${period}`;
  }

  if (loadingCalendars) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner color="primary" size="lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      {calendars.length > 1 && !selectedCalendar && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-default-foreground">
              Selecciona un Profesional
            </h2>
            <p className="text-small text-default-500">
              Este servicio está disponible con varios profesionales
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {calendars.map((cal) => (
              <Card
                key={cal.id}
                isPressable
                shadow="none"
                className="flex cursor-pointer flex-row items-center gap-3 border border-default-200 p-3 transition-all hover:border-default-400"
                onPress={() => onCalendarChange(cal)}
              >
                <div
                  className="h-8 w-8 shrink-0 rounded-full"
                  style={{ backgroundColor: cal.color ?? "#4285f4" }}
                />
                <div className="flex flex-col gap-0.5">
                  <p className="text-small font-medium text-default-foreground">{cal.name}</p>
                  {cal.description && (
                    <p className="text-tiny text-default-500">{cal.description}</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {selectedCalendar && (
        <>
          {calendars.length > 1 && (
            <button
              className="shrink-0 flex items-center gap-2 text-small text-default-500 transition-colors hover:text-default-700"
              type="button"
              onClick={() => onCalendarChange(null as unknown as CalendarType)}
            >
              <Icon icon="solar:arrow-left-linear" width={16} />
              <div
                className="h-5 w-5 shrink-0 rounded-full"
                style={{ backgroundColor: selectedCalendar.color ?? "#4285f4" }}
              />
              {selectedCalendar.name}
            </button>
          )}

          <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
            <div className="w-full shrink-0 overflow-hidden lg:w-[380px] lg:flex-none">
              <Calendar
                className="w-full max-w-full shadow-none dark:bg-transparent [&]:w-full"
                classNames={{
                  base: "w-full max-w-full",
                  headerWrapper: "bg-transparent px-2 pt-1.5 pb-3 lg:px-3",
                  title: "text-default-700 text-small font-semibold",
                  gridHeader: "bg-transparent shadow-none",
                  gridHeaderCell: "font-medium text-default-400 text-xs p-0 w-full",
                  gridHeaderRow: "px-2 pb-3 lg:px-3",
                  gridBodyRow: "gap-x-0.5 px-2 mb-1 first:mt-4 last:mb-0 lg:gap-x-1 lg:px-3",
                  gridWrapper: "pb-3 w-full max-w-full overflow-hidden",
                  cell: "p-1 w-full lg:p-1.5",
                  cellButton:
                    "w-full h-9 rounded-medium data-selected:shadow-[0_2px_12px_0] data-selected:shadow-primary-300 text-small font-medium",
                  content: "w-full",
                }}
                isDateUnavailable={isDateUnavailable}
                minValue={today(getLocalTimeZone())}
                value={selectedDate}
                weekdayStyle="short"
                onChange={(date) => {
                  onDateChange(date);
                  onSlotChange(null as unknown as AvailableSlot);
                }}
              />
            </div>

            <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 lg:w-[240px] lg:flex-none lg:self-stretch">
              <div className="flex w-full shrink-0 justify-between py-2">
                <p className="text-small flex items-center">
                  <span className="text-default-700">
                    {format(selectedDate.toString(), "EEE", { locale: enUS })}
                  </span>
                  &nbsp;
                  <span className="text-default-500">{selectedDate.day}</span>
                </p>
              </div>
              <div className="flex min-h-0 w-full flex-1">
                {loadingSlots ? (
                  <div className="flex w-full items-center justify-center">
                    <Spinner color="primary" size="sm" />
                  </div>
                ) : slots.length === 0 ? (
                  <div className="flex w-full flex-col items-center justify-center gap-2 text-center">
                    <Icon className="text-default-300" icon="solar:calendar-minimalistic-bold-duotone" width={32} />
                    <p className="text-small text-default-400">
                      No hay horarios disponibles para esta fecha
                    </p>
                  </div>
                ) : (
                  <ScrollShadow hideScrollBar className="flex w-full flex-col gap-2">
                    {slots.map((slot) => {
                      const isSelected = selectedSlot?.slot_start === slot.slot_start;
                      return (
                        <div key={slot.slot_start} className="relative flex w-full justify-end gap-2">
                          <div
                            className="absolute left-0"
                            style={{ width: isSelected ? "calc(100% - 6.5rem)" : "100%" , transition: "width 0.2s" }}
                          >
                            <Button
                              className="bg-default-100 text-default-500 w-full text-xs font-semibold leading-4"
                              onPress={() => onSlotChange(slot)}
                            >
                              {formatSlotTime(slot.slot_start)}
                            </Button>
                          </div>
                          <div
                            className="overflow-hidden"
                            style={{
                              width: isSelected ? "6rem" : "0",
                              opacity: isSelected ? 1 : 0,
                              transition: "width 0.2s, opacity 0.2s",
                            }}
                          >
                            <Button className="w-24" color="primary" onPress={onNext}>
                              Confirmar
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </ScrollShadow>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <button
        className="shrink-0 flex items-center gap-1 self-start text-small text-default-500 transition-colors hover:text-default-700"
        type="button"
        onClick={onBack}
      >
        <Icon icon="solar:arrow-left-linear" width={16} />
        Volver
      </button>
    </div>
  );
}
```

**Step 2: Verify no lint errors**

Run: ReadLints on `components/booking/step-calendar.tsx`

**Step 3: Commit**

```bash
git add components/booking/step-calendar.tsx
git commit -m "refactor: use getAvailableSlots RPC for real time slot data"
```

---

### Task 8: Refactor step-client-form.tsx

**Files:**
- Modify: `components/booking/step-client-form.tsx`

**Context:** Need to add a `phone` field (required, E.164 format). Adjust field requirements per the integration guide: `patientSpecies` is required only if `patientName` is filled. Email is optional.

**Step 1: Rewrite step-client-form.tsx**

```typescript
"use client";

import { Button, Form, Input, Link, Select, SelectItem, Textarea } from "@heroui/react";
import { useCallback, useState } from "react";

const petTypeOptions = [
  { key: "perro", label: "Perro" },
  { key: "gato", label: "Gato" },
  { key: "ave", label: "Ave" },
  { key: "reptil", label: "Reptil" },
  { key: "otro", label: "Otro" },
];

export interface ClientFormData {
  phone: string;
  name: string;
  email: string;
  petName: string;
  petType: string;
  notes: string;
}

interface StepClientFormProps {
  onBack: () => void;
  onSubmit: (data: ClientFormData) => void;
}

export default function StepClientForm({ onBack, onSubmit }: StepClientFormProps) {
  const [petType, setPetType] = useState<string>("");
  const [petName, setPetName] = useState<string>("");

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.target as HTMLFormElement);

      let phone = (formData.get("phone") as string).replace(/[\s\-()]/g, "");
      if (phone.startsWith("9") && phone.length === 9) {
        phone = "+56" + phone;
      } else if (phone.startsWith("56") && !phone.startsWith("+")) {
        phone = "+" + phone;
      }

      onSubmit({
        phone,
        name: formData.get("name") as string,
        email: (formData.get("email") as string) || "",
        petName,
        petType,
        notes: (formData.get("notes") as string) || "",
      });
    },
    [onSubmit, petType, petName],
  );

  return (
    <Form
      className="flex min-h-0 w-full flex-1 flex-col gap-0"
      validationBehavior="native"
      onSubmit={handleSubmit}
    >
      <div className="flex-1 w-full overflow-y-auto">
        <div className="flex max-w-md flex-col gap-4 py-2 md:mx-auto">
          <Input
            isRequired
            classNames={{ label: "text-tiny text-default-600" }}
            label="Teléfono (WhatsApp)"
            labelPlacement="outside"
            name="phone"
            placeholder="+56 9 1234 5678"
            type="tel"
            description="Formato: +56912345678"
          />
          <Input
            isRequired
            classNames={{ label: "text-tiny text-default-600" }}
            label="Nombre completo"
            labelPlacement="outside"
            name="name"
            placeholder=" "
          />
          <Input
            classNames={{ label: "text-tiny text-default-600" }}
            label="Correo electrónico"
            labelPlacement="outside"
            name="email"
            placeholder=" "
            type="email"
          />
          <Input
            classNames={{ label: "text-tiny text-default-600" }}
            label="Nombre de la mascota"
            labelPlacement="outside"
            name="petName"
            placeholder=" "
            value={petName}
            onValueChange={setPetName}
          />
          <Select
            isRequired={petName.length > 0}
            classNames={{ label: "text-tiny text-default-600" }}
            label="Tipo de mascota"
            labelPlacement="outside"
            placeholder="Selecciona"
            selectedKeys={petType ? [petType] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0];
              setPetType(selected ? String(selected) : "");
            }}
          >
            {petTypeOptions.map((option) => (
              <SelectItem key={option.key}>{option.label}</SelectItem>
            ))}
          </Select>
          <Textarea
            classNames={{ label: "text-tiny text-default-600" }}
            label="Comentarios adicionales"
            labelPlacement="outside"
            minRows={2}
            name="notes"
            maxLength={500}
          />
          <p className="text-default-500 text-xs">
            Al continuar aceptas nuestros{" "}
            <Link className="text-default-800 text-xs" href="#" size="sm">
              Términos
            </Link>{" "}
            y{" "}
            <Link className="text-default-800 text-xs" href="#" size="sm">
              Política de Privacidad
            </Link>
            .
          </p>
        </div>
      </div>
      <div className="flex w-full shrink-0 justify-end gap-2 pt-3">
        <Button variant="flat" onPress={onBack}>
          Volver
        </Button>
        <Button color="primary" type="submit">
          Confirmar Cita
        </Button>
      </div>
    </Form>
  );
}
```

**Step 2: Verify no lint errors**

Run: ReadLints on `components/booking/step-client-form.tsx`

**Step 3: Commit**

```bash
git add components/booking/step-client-form.tsx
git commit -m "refactor: add phone field, make email optional, conditional pet validation"
```

---

### Task 9: Refactor step-confirmation.tsx

**Files:**
- Modify: `components/booking/step-confirmation.tsx`

**Context:** Now receives a `BookingData` with real `result` from `bookAppointment()`. Show the real confirmation data and WhatsApp reminder notice.

**Step 1: Rewrite step-confirmation.tsx**

```typescript
"use client";

import { Button, Chip, Divider, Link } from "@heroui/react";
import { Icon } from "@iconify/react";

import type { BookingData } from "./calendar-types";

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hours = parseInt(h, 10);
  const period = hours >= 12 ? "PM" : "AM";
  const display = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${display}:${m} ${period}`;
}

interface StepConfirmationProps {
  bookingData: BookingData;
  onReschedule: () => void;
}

export default function StepConfirmation({ bookingData, onReschedule }: StepConfirmationProps) {
  const result = bookingData.result;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 rounded-large bg-default-50 py-8 shadow-small">
      <div className="flex w-full flex-col items-center px-8">
        <Icon
          className="text-success-500 mb-3"
          icon="solar:check-circle-bold-duotone"
          width={56}
        />
        <p className="text-default-foreground mb-2 text-base font-medium">
          ¡Tu cita ha sido agendada!
        </p>
        <p className="text-tiny text-default-500 text-center">
          Te enviaremos un recordatorio por WhatsApp 24 horas y 1 hora antes de tu cita.
        </p>
      </div>

      <Divider className="w-full" />

      <div className="flex w-full flex-col gap-4 px-8">
        <div className="flex w-full flex-col gap-1">
          <p className="text-small font-medium text-default-foreground">Servicio</p>
          <p className="text-tiny text-default-500">
            {result?.service_name ?? bookingData.service?.name ?? "—"}
          </p>
        </div>
        <div className="flex w-full flex-col gap-1">
          <p className="text-small font-medium text-default-foreground">Profesional</p>
          <p className="text-tiny text-default-500">{bookingData.calendar?.name ?? "—"}</p>
        </div>
        <div className="flex w-full flex-col gap-1">
          <p className="text-small font-medium text-default-foreground">Fecha y hora</p>
          <p className="text-tiny text-default-500">
            {bookingData.date}
            <br />
            {result
              ? `${formatTime(result.start_time)} - ${formatTime(result.end_time)}`
              : formatTime(bookingData.startTime)}
          </p>
        </div>
        <div className="flex w-full flex-col gap-1">
          <p className="text-small font-medium text-default-foreground">Cliente</p>
          <p className="text-tiny text-default-500">
            {bookingData.clientName}
            {bookingData.clientPhone && ` (${bookingData.clientPhone})`}
          </p>
        </div>
        {bookingData.petName && (
          <div className="flex w-full flex-col gap-1">
            <p className="text-small font-medium text-default-foreground">Mascota</p>
            <span className="flex items-center gap-1">
              <p className="text-tiny text-default-500">{bookingData.petName}</p>
              {bookingData.petType && (
                <Chip
                  classNames={{ base: "px-0.5 h-4", content: "text-[10px] leading-3" }}
                  color="primary"
                  size="sm"
                  variant="flat"
                >
                  {bookingData.petType.charAt(0).toUpperCase() + bookingData.petType.slice(1)}
                </Chip>
              )}
            </span>
          </div>
        )}
        {bookingData.notes && (
          <div className="flex w-full flex-col gap-1">
            <p className="text-small font-medium text-default-foreground">Comentarios</p>
            <p className="text-tiny text-default-500">{bookingData.notes}</p>
          </div>
        )}
      </div>

      <Divider className="w-full" />

      <div className="flex flex-col items-center gap-2 px-8">
        <p className="text-tiny text-default-500">¿Necesitas hacer un cambio?</p>
        <Link
          className="text-small text-default-800"
          href="#"
          size="sm"
          underline="always"
          onPress={onReschedule}
        >
          Agendar otra cita
        </Link>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/booking/step-confirmation.tsx
git commit -m "refactor: show real booking result and WhatsApp reminder notice"
```

---

### Task 10: Refactor booking-wizard.tsx (Orchestrator)

**Files:**
- Modify: `components/booking/booking-wizard.tsx` (full rewrite)

**Context:** This is the main orchestrator. Must be updated to:
1. Remove all references to `VetService`, `Specialist`, `DurationEnum`, `vetServices`, `specialists`
2. Use `ClinicService` and `Calendar` from `lib/booking.ts`
3. Manage new state: `selectedCalendar`, `selectedSlot`, `isSubmitting`, `submitError`
4. Call `bookAppointment()` in the confirmation step
5. Pass new props to child components

**Step 1: Rewrite booking-wizard.tsx**

```typescript
"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Spinner } from "@heroui/react";
import { getLocalTimeZone, today } from "@internationalized/date";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import type { DateValue } from "@heroui/react";
import type { AvailableSlot, Calendar, ClinicService } from "@/lib/booking";
import { bookAppointment } from "@/lib/booking";
import type { BookingData, BookingStepType } from "./calendar-types";
import type { ClientFormData } from "./step-client-form";
import StepServiceSelection from "./step-service-selection";
import StepCalendar from "./step-calendar";
import StepClientForm from "./step-client-form";
import StepConfirmation from "./step-confirmation";

const steps: { key: BookingStepType; label: string }[] = [
  { key: "service_selection", label: "Servicio" },
  { key: "calendar", label: "Fecha y Hora" },
  { key: "client_form", label: "Datos" },
  { key: "confirmation", label: "Confirmación" },
];

export default function BookingWizard() {
  const [mounted, setMounted] = useState(false);
  const [currentStep, setCurrentStep] = useState<BookingStepType>("service_selection");
  const [selectedService, setSelectedService] = useState<ClinicService | null>(null);
  const [selectedCalendar, setSelectedCalendar] = useState<Calendar | null>(null);
  const [selectedDate, setSelectedDate] = useState<DateValue>(() => today(getLocalTimeZone()));
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [bookingData, setBookingData] = useState<BookingData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentStepIndex = steps.findIndex((s) => s.key === currentStep);

  const handleClientFormSubmit = useCallback(
    async (formData: ClientFormData) => {
      if (!selectedService || !selectedCalendar || !selectedSlot) return;

      const dateFormatted = format(
        new Date(selectedDate.toString()),
        "EEEE, d 'de' MMMM yyyy",
        { locale: es },
      );

      setIsSubmitting(true);
      setSubmitError(null);

      try {
        const result = await bookAppointment({
          phone: formData.phone,
          clientName: formData.name,
          email: formData.email || undefined,
          patientName: formData.petName || undefined,
          patientSpecies: formData.petType || undefined,
          serviceId: selectedService.id,
          calendarId: selectedCalendar.id,
          date: `${selectedDate.year}-${String(selectedDate.month).padStart(2, "0")}-${String(selectedDate.day).padStart(2, "0")}`,
          startTime: selectedSlot.slot_start,
          notes: formData.notes || undefined,
        });

        setBookingData({
          service: selectedService,
          calendar: selectedCalendar,
          date: dateFormatted,
          startTime: selectedSlot.slot_start,
          endTime: selectedSlot.slot_end,
          clientName: formData.name,
          clientEmail: formData.email,
          clientPhone: formData.phone,
          petName: formData.petName,
          petType: formData.petType,
          notes: formData.notes,
          result,
        });
        setCurrentStep("confirmation");
      } catch (err: any) {
        setSubmitError(err.message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [selectedDate, selectedService, selectedCalendar, selectedSlot],
  );

  const handleReschedule = useCallback(() => {
    setCurrentStep("service_selection");
    setSelectedService(null);
    setSelectedCalendar(null);
    setSelectedSlot(null);
    setBookingData(null);
    setSubmitError(null);
  }, []);

  if (!mounted) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner color="primary" size="lg" />
      </div>
    );
  }

  return (
    <div className={`flex w-full flex-1 flex-col gap-5 ${currentStep === "confirmation" ? "overflow-y-auto" : "overflow-hidden"}`}>
      {currentStep !== "confirmation" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            {steps.map((step, index) => (
              <div
                key={step.key}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  index <= currentStepIndex ? "bg-primary" : "bg-default-200"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center">
            {steps.map((step, index) => (
              <span
                key={step.key}
                className={`flex-1 text-center text-tiny font-medium transition-colors ${
                  index <= currentStepIndex ? "text-primary" : "text-default-400"
                }`}
              >
                {step.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {currentStep === "service_selection" && (
          <StepServiceSelection
            selectedService={selectedService}
            onNext={() => setCurrentStep("calendar")}
            onServiceChange={(service) => {
              setSelectedService(service);
              setSelectedCalendar(null);
              setSelectedSlot(null);
            }}
          />
        )}

        {currentStep === "calendar" && selectedService && (
          <StepCalendar
            selectedCalendar={selectedCalendar}
            selectedDate={selectedDate}
            selectedSlot={selectedSlot}
            serviceId={selectedService.id}
            onBack={() => setCurrentStep("service_selection")}
            onCalendarChange={setSelectedCalendar}
            onDateChange={setSelectedDate}
            onNext={() => setCurrentStep("client_form")}
            onSlotChange={setSelectedSlot}
          />
        )}

        {currentStep === "client_form" && (
          <div className="flex min-h-0 flex-1 flex-col">
            {submitError && (
              <div className="mb-3 rounded-lg bg-danger-50 p-3 text-small text-danger">
                {submitError}
              </div>
            )}
            {isSubmitting ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <Spinner color="primary" size="lg" />
                <p className="text-small text-default-500">Reservando tu cita...</p>
              </div>
            ) : (
              <StepClientForm
                onBack={() => {
                  setSubmitError(null);
                  setCurrentStep("calendar");
                }}
                onSubmit={handleClientFormSubmit}
              />
            )}
          </div>
        )}

        {currentStep === "confirmation" && bookingData && (
          <StepConfirmation bookingData={bookingData} onReschedule={handleReschedule} />
        )}
      </div>
    </div>
  );
}
```

**Step 2: Update app/page.tsx — remove unused props**

The `BookingWizard` no longer takes `initialServiceId`, `initialSpecialistId`, or `token` props (the mock specialist concept is gone). Simplify:

```typescript
"use client";

import { Suspense } from "react";
import { Spinner } from "@heroui/react";

import BookingWizard from "@/components/booking/booking-wizard";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Spinner color="primary" size="lg" />
        </div>
      }
    >
      <BookingWizard />
    </Suspense>
  );
}
```

**Step 3: Verify build**

Run: `npx next build 2>&1 | tail -30`
Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add components/booking/booking-wizard.tsx app/page.tsx
git commit -m "refactor: rewire booking wizard to use live Supabase data end-to-end"
```

---

### Task 11: Final Verification

**Step 1: Full build check**

Run: `npx next build`
Expected: Build succeeds, no TypeScript or import errors.

**Step 2: Start dev server and smoke test**

Run: `npx next dev`
Navigate to `http://localhost:3000`

Verify:
1. Services load from Supabase (6 service cards appear)
2. Clicking a service → shows calendar selection (if multiple vets) or goes straight to date picker
3. Selecting a date → shows available time slots from backend (09:00-18:00 on weekdays, 09:00-13:00 on Saturday)
4. Client form has phone field
5. Submitting creates a real appointment (check `appointments` table in Supabase)

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete Supabase booking integration - live services, slots, and appointments"
```
