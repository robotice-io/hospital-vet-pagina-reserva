# Wire All Pages to Supabase — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all mock data in the 4-step booking wizard with live Supabase data, using the veterinarian-centric data model (`veterinarians` + `veterinarian_services`).

**Architecture:** Single-page 4-step wizard. Each step wired to `BookingProvider` context that fetches from Supabase. RPCs updated to accept `veterinarian_service_id` for duration/pricing. The flow is: Pick Vet → Pick Vet Service → Pick Date/Time from real slots → Fill Client Form (with phone) → Submit via `book_appointment` RPC → Show real confirmation.

**Tech Stack:** Next.js 15 (App Router), React 18, TypeScript, HeroUI, Supabase (client-side), Framer Motion, date-fns

---

## Phase 1: Update Database RPCs

Update `get_available_slots` and `book_appointment` to support the vet-centric model.

### Task 1.1: Update `get_available_slots` to accept `veterinarian_service_id`

**Files:**
- Migration via Supabase MCP `execute_sql`

**Step 1: Apply the migration**

Run this SQL via Supabase MCP `execute_sql`:

```sql
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_calendar_id uuid,
  p_date date,
  p_service_id uuid DEFAULT NULL::uuid,
  p_vet_service_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(slot_start time without time zone, slot_end time without time zone, is_available boolean)
LANGUAGE plpgsql
AS $function$
DECLARE
  config_rec RECORD;
  slot_duration integer;
  current_slot time;
BEGIN
  SELECT ac.start_time, ac.end_time, ac.slot_duration_minutes, ac.max_concurrent
  INTO config_rec
  FROM availability_config ac
  WHERE ac.calendar_id = p_calendar_id
    AND ac.day = lower(to_char(p_date, 'FMDay'))::day_of_week
    AND ac.is_active = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM blocked_dates bd
    WHERE bd.blocked_date = p_date
      AND (bd.calendar_id IS NULL OR bd.calendar_id = p_calendar_id)
  ) THEN
    RETURN;
  END IF;

  slot_duration := config_rec.slot_duration_minutes;

  IF p_vet_service_id IS NOT NULL THEN
    SELECT vs.duration_minutes INTO slot_duration
    FROM veterinarian_services vs WHERE vs.id = p_vet_service_id;
  ELSIF p_service_id IS NOT NULL THEN
    SELECT cs.duration_minutes INTO slot_duration
    FROM clinic_services cs WHERE cs.id = p_service_id;
  END IF;

  current_slot := config_rec.start_time;

  WHILE current_slot + (slot_duration || ' minutes')::interval <= config_rec.end_time LOOP
    slot_start := current_slot;
    slot_end := current_slot + (slot_duration || ' minutes')::interval;
    is_available := check_slot_available(p_calendar_id, p_date, current_slot, slot_end);
    RETURN NEXT;
    current_slot := current_slot + (slot_duration || ' minutes')::interval;
  END LOOP;
END;
$function$;
```

**Step 2: Verify**

Run: `SELECT * FROM get_available_slots('<any_calendar_id>', '2026-03-10'::date, NULL, '<any_vet_service_id>');`
Expected: Rows with slot_start, slot_end, is_available based on vet service duration.

### Task 1.2: Update `book_appointment` to accept vet-centric params

The `appointments` table has `service_id` as NOT NULL with FK to `clinic_services`. Since we're moving to vet-centric, we need to:
1. Make `service_id` nullable on the appointments table
2. Update the RPC to accept `veterinarian_id` and `veterinarian_service_id`

**Step 1: Alter appointments table**

```sql
ALTER TABLE public.appointments ALTER COLUMN service_id DROP NOT NULL;
```

**Step 2: Replace book_appointment function**

```sql
CREATE OR REPLACE FUNCTION public.book_appointment(
  p_phone text,
  p_client_name text,
  p_email text DEFAULT NULL::text,
  p_patient_name text DEFAULT NULL::text,
  p_patient_species text DEFAULT NULL::text,
  p_patient_breed text DEFAULT NULL::text,
  p_service_id uuid DEFAULT NULL::uuid,
  p_calendar_id uuid DEFAULT NULL::uuid,
  p_date date DEFAULT NULL::date,
  p_start_time time without time zone DEFAULT NULL::time without time zone,
  p_notes text DEFAULT NULL::text,
  p_veterinarian_id uuid DEFAULT NULL::uuid,
  p_veterinarian_service_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_client_id uuid;
  v_patient_id uuid;
  v_appointment_id uuid;
  v_end_time time;
  v_duration integer;
  v_service_name text;
  v_is_new_client boolean := false;
BEGIN
  IF p_phone IS NULL OR p_calendar_id IS NULL
     OR p_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'Missing required fields: phone, calendar_id, date, start_time';
  END IF;

  IF p_veterinarian_service_id IS NOT NULL THEN
    SELECT vs.duration_minutes, vs.label INTO v_duration, v_service_name
    FROM veterinarian_services vs
    WHERE vs.id = p_veterinarian_service_id AND vs.is_active = true;

    IF v_duration IS NULL THEN
      RAISE EXCEPTION 'Veterinarian service not found or inactive';
    END IF;
  ELSIF p_service_id IS NOT NULL THEN
    SELECT cs.duration_minutes, cs.name INTO v_duration, v_service_name
    FROM clinic_services cs WHERE cs.id = p_service_id AND cs.is_active = true;

    IF v_duration IS NULL THEN
      RAISE EXCEPTION 'Service not found or inactive';
    END IF;
  ELSE
    RAISE EXCEPTION 'Either service_id or veterinarian_service_id is required';
  END IF;

  v_end_time := p_start_time + (v_duration || ' minutes')::interval;

  IF NOT check_slot_available(p_calendar_id, p_date, p_start_time, v_end_time) THEN
    RAISE EXCEPTION 'Slot not available';
  END IF;

  SELECT id INTO v_client_id FROM clients WHERE phone = p_phone;

  IF v_client_id IS NULL THEN
    INSERT INTO clients (phone, name, email)
    VALUES (p_phone, p_client_name, p_email)
    RETURNING id INTO v_client_id;
    v_is_new_client := true;
  ELSE
    UPDATE clients
    SET name = COALESCE(p_client_name, name),
        email = COALESCE(p_email, email)
    WHERE id = v_client_id;
  END IF;

  IF p_patient_name IS NOT NULL AND p_patient_species IS NOT NULL THEN
    SELECT id INTO v_patient_id
    FROM patients
    WHERE client_id = v_client_id
      AND lower(name) = lower(p_patient_name)
      AND is_active = true;

    IF v_patient_id IS NULL THEN
      INSERT INTO patients (client_id, name, species, breed)
      VALUES (v_client_id, p_patient_name, p_patient_species, p_patient_breed)
      RETURNING id INTO v_patient_id;
    END IF;
  END IF;

  INSERT INTO appointments (
    client_id, patient_id, service_id, calendar_id,
    veterinarian_id, veterinarian_service_id,
    appointment_date, start_time, end_time,
    status, source, notes
  ) VALUES (
    v_client_id, v_patient_id, p_service_id, p_calendar_id,
    p_veterinarian_id, p_veterinarian_service_id,
    p_date, p_start_time, v_end_time,
    'confirmed', 'web', p_notes
  ) RETURNING id INTO v_appointment_id;

  RETURN jsonb_build_object(
    'appointment_id', v_appointment_id,
    'client_id', v_client_id,
    'patient_id', v_patient_id,
    'is_new_client', v_is_new_client,
    'service_name', v_service_name,
    'date', p_date,
    'start_time', p_start_time,
    'end_time', v_end_time
  );
END;
$function$;
```

**Step 3: Verify**

Run a test query:
```sql
SELECT * FROM book_appointment(
  '+56900000000', 'Test User', 'test@test.com',
  'Luna', 'Perro', 'Labrador',
  NULL, '<calendar_id>', '2026-03-10', '10:00',
  'Test note', '<vet_id>', '<vet_service_id>'
);
```
Expected: JSON with appointment_id, client_id, service_name, etc.

Then clean up the test:
```sql
DELETE FROM appointments WHERE notes = 'Test note';
DELETE FROM patients WHERE name = 'Luna';
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat(db): update RPCs to support veterinarian-centric booking"
```

---

## Phase 2: Update `lib/booking.ts` — Data Access Layer

### Task 2.1: Add vet-centric types and fetchers

**Files:**
- Modify: `lib/booking.ts`

**Step 1: Add new types and functions**

Add these interfaces to `lib/booking.ts`:

```typescript
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
```

Add these fetcher functions:

```typescript
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
```

**Step 2: Update `getAvailableSlots` to pass vet_service_id**

Replace the existing `getAvailableSlots`:

```typescript
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
```

**Step 3: Update `BookingParams` and `bookAppointment`**

Update the `BookingParams` interface:

```typescript
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
```

Update `bookAppointment`:

```typescript
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
```

**Step 4: Commit**

```bash
git add lib/booking.ts && git commit -m "feat(lib): add vet-centric types and update booking API"
```

---

## Phase 3: Rewire `booking-context.tsx`

### Task 3.1: Rewrite context to use vet-centric model

**Files:**
- Modify: `components/booking/booking-context.tsx`

**Step 1: Replace the entire context implementation**

The context should:
- Fetch `veterinarians` on mount (replaces calendars-as-specialists)
- Expose `fetchVetServicesFor(vetId)` (replaces `fetchServicesFor`)
- Expose `fetchSlotsFor(calendarId, date, vetServiceId)` using the updated RPC
- Expose `submitBooking` with vet-centric params
- Track selected veterinarian (needed for calendar_id resolution)

Replace `booking-context.tsx` with:

```typescript
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import {
  getVeterinarians,
  getVetServices,
  getAvailableSlots,
  bookAppointment,
} from "@/lib/booking";
import type {
  Veterinarian,
  VeterinarianService,
  AvailableSlot,
  BookingResult,
} from "@/lib/booking";

interface BookingContextValue {
  veterinarians: Veterinarian[];
  loadingVets: boolean;

  vetServices: VeterinarianService[];
  loadingVetServices: boolean;

  availableSlots: AvailableSlot[];
  loadingSlots: boolean;

  fetchVetServicesFor: (veterinarianId: string) => void;
  fetchSlotsFor: (calendarId: string, date: string, vetServiceId: string) => void;

  submitBooking: (params: {
    phone: string;
    clientName: string;
    email?: string;
    patientName?: string;
    patientSpecies?: string;
    patientBreed?: string;
    calendarId: string;
    date: string;
    startTime: string;
    notes?: string;
    veterinarianId: string;
    vetServiceId: string;
  }) => Promise<BookingResult>;

  bookingResult: BookingResult | null;
  submitting: boolean;
  submitError: string | null;
  clearSubmitError: () => void;
}

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [veterinarians, setVeterinarians] = useState<Veterinarian[]>([]);
  const [vetServicesState, setVetServices] = useState<VeterinarianService[]>([]);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);

  const [loadingVets, setLoadingVets] = useState(true);
  const [loadingVetServices, setLoadingVetServices] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    getVeterinarians()
      .then(setVeterinarians)
      .catch(() => setVeterinarians([]))
      .finally(() => setLoadingVets(false));
  }, []);

  const fetchVetServicesFor = useCallback((veterinarianId: string) => {
    setLoadingVetServices(true);
    setVetServices([]);
    setAvailableSlots([]);
    getVetServices(veterinarianId)
      .then(setVetServices)
      .catch(() => setVetServices([]))
      .finally(() => setLoadingVetServices(false));
  }, []);

  const fetchSlotsFor = useCallback(
    (calendarId: string, date: string, vetServiceId: string) => {
      setLoadingSlots(true);
      setAvailableSlots([]);
      getAvailableSlots(calendarId, date, undefined, vetServiceId)
        .then(setAvailableSlots)
        .catch(() => setAvailableSlots([]))
        .finally(() => setLoadingSlots(false));
    },
    [],
  );

  const submitBooking = useCallback(
    async (params: {
      phone: string;
      clientName: string;
      email?: string;
      patientName?: string;
      patientSpecies?: string;
      patientBreed?: string;
      calendarId: string;
      date: string;
      startTime: string;
      notes?: string;
      veterinarianId: string;
      vetServiceId: string;
    }) => {
      setSubmitting(true);
      setSubmitError(null);
      try {
        const result = await bookAppointment(params);
        setBookingResult(result);
        return result;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        setSubmitError(message);
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  const clearSubmitError = useCallback(() => setSubmitError(null), []);

  const value = useMemo<BookingContextValue>(
    () => ({
      veterinarians,
      loadingVets,
      vetServices: vetServicesState,
      loadingVetServices,
      availableSlots,
      loadingSlots,
      fetchVetServicesFor,
      fetchSlotsFor,
      submitBooking,
      bookingResult,
      submitting,
      submitError,
      clearSubmitError,
    }),
    [
      veterinarians,
      loadingVets,
      vetServicesState,
      loadingVetServices,
      availableSlots,
      loadingSlots,
      fetchVetServicesFor,
      fetchSlotsFor,
      submitBooking,
      bookingResult,
      submitting,
      submitError,
      clearSubmitError,
    ],
  );

  return (
    <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
  );
}

export function useBooking(): BookingContextValue {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used within BookingProvider");
  return ctx;
}
```

**Step 2: Commit**

```bash
git add components/booking/booking-context.tsx && git commit -m "feat(context): rewire BookingProvider to vet-centric model"
```

---

## Phase 4: Wire `step-service-selection.tsx`

### Task 4.1: Replace mock data with context

**Files:**
- Modify: `components/booking/step-service-selection.tsx`
- Modify: `components/booking/calendar-types.ts` (remove mock exports)

**Step 1: Update StepServiceSelection to use context**

The component currently imports `vetServices` and `specialists` from `calendar-types.ts` (mock). Replace with `useBooking()` context.

Key changes:
- Import `useBooking` from `./booking-context`
- Get `veterinarians` and `vetServices` from context
- Call `fetchVetServicesFor(vetId)` when a vet is selected
- Replace `Specialist` type with `Veterinarian`
- Replace `VetService` type with `VeterinarianService`
- Update card rendering to use new field names (`label` instead of `name`, `price` as number, `duration_minutes` instead of `duration` string)
- Show loading spinners when `loadingVets` or `loadingVetServices`

New props interface:

```typescript
interface StepServiceSelectionProps {
  selectedVet: Veterinarian | null;
  selectedVetService: VeterinarianService | null;
  onVetChange: (vet: Veterinarian | null) => void;
  onVetServiceChange: (service: VeterinarianService) => void;
  onNext: () => void;
}
```

Service card should display:
- `service.label` as the name
- `service.appointment_type` as a chip/badge
- `${service.duration_minutes} min` for duration
- `new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(service.price)` for price

Vet card should display:
- `vet.name` 
- `vet.specialty`
- Avatar from `https://i.pravatar.cc/150?u=${vet.id}`

**Step 2: Remove mock data arrays from calendar-types.ts**

Remove the `vetServices` array constant and `specialists` array constant from `calendar-types.ts`. Keep the interfaces `VetService`, `Specialist` for now (they'll be fully removed in Phase 8 cleanup) but mark them deprecated. Keep `TimeSlot`, `BookingStepType`, `DurationEnum`, `BookingData`, `TimeFormatEnum`, `timeFormats`.

**Step 3: Commit**

```bash
git add components/booking/step-service-selection.tsx components/booking/calendar-types.ts && git commit -m "feat(step1): wire service selection to Supabase veterinarians"
```

---

## Phase 5: Wire `step-calendar.tsx`

### Task 5.1: Fetch real available slots

**Files:**
- Modify: `components/booking/step-calendar.tsx`

**Step 1: Update component to use context**

Key changes:
- Import `useBooking` from `./booking-context`
- Add new props: `calendarId: string`, `vetServiceId: string`
- On mount and on date change, call `fetchSlotsFor(calendarId, date, vetServiceId)`
- Replace the client-generated `timeSlots` array with `availableSlots` from context
- Convert `AvailableSlot` to the display format: `{ value: slot.slot_start, label: formatTime(slot.slot_start) }`
- Show a `Spinner` when `loadingSlots` is true
- Show "No hay horarios disponibles" message when slots are empty and not loading
- Remove the 12h/24h toggle (slots come pre-formatted from backend, but we can format them client-side)
- Keep the `isDateUnavailable` check for weekends (backend also handles it via `availability_config` but client-side check prevents unnecessary RPC calls)

Updated props:

```typescript
interface StepCalendarProps {
  calendarId: string;
  vetServiceId: string;
  selectedDate: DateValue;
  onDateChange: (date: DateValue) => void;
  selectedTime: string;
  onTimeChange: (time: string, selectedTimeSlotRange?: TimeSlot[]) => void;
  onBack: () => void;
  onNext: () => void;
}
```

Remove `duration` prop — no longer needed since slots come with correct intervals from backend.

**Step 2: Commit**

```bash
git add components/booking/step-calendar.tsx && git commit -m "feat(step2): wire calendar to real available slots from Supabase"
```

---

## Phase 6: Wire `step-client-form.tsx`

### Task 6.1: Add phone field and species/breed

**Files:**
- Modify: `components/booking/step-client-form.tsx`

**Step 1: Add phone field**

The `book_appointment` RPC requires `p_phone` (the primary client identifier). Add a phone input field as the first field in the form.

```tsx
<Input
  isRequired
  classNames={{ label: "text-tiny text-default-600" }}
  label="Teléfono"
  labelPlacement="outside"
  name="phone"
  placeholder="+569 1234 5678"
  type="tel"
/>
```

**Step 2: Replace petType select with species + optional breed**

Replace the "Tipo de mascota" select with:

```tsx
<Select
  isRequired
  classNames={{ label: "text-tiny text-default-600" }}
  label="Especie"
  labelPlacement="outside"
  placeholder="Selecciona"
  name="species"
  selectedKeys={species ? [species] : []}
  onSelectionChange={(keys) => {
    const selected = Array.from(keys)[0];
    setSpecies(selected ? String(selected) : "");
  }}
>
  {speciesOptions.map((option) => (
    <SelectItem key={option.key}>{option.label}</SelectItem>
  ))}
</Select>
<Input
  classNames={{ label: "text-tiny text-default-600" }}
  label="Raza (opcional)"
  labelPlacement="outside"
  name="breed"
  placeholder=" "
/>
```

Where `speciesOptions` replaces `petTypeOptions`:

```typescript
const speciesOptions = [
  { key: "Perro", label: "Perro" },
  { key: "Gato", label: "Gato" },
  { key: "Ave", label: "Ave" },
  { key: "Reptil", label: "Reptil" },
  { key: "Otro", label: "Otro" },
];
```

**Step 3: Update onSubmit signature**

```typescript
onSubmit: (data: {
  phone: string;
  name: string;
  email: string;
  petName: string;
  species: string;
  breed: string;
  notes: string;
}) => void;
```

Extract phone and breed from form data:

```typescript
const phone = formData.get("phone") as string;
const breed = (formData.get("breed") as string) || "";
onSubmit({ phone, name, email, petName, species, breed, notes });
```

**Step 4: Commit**

```bash
git add components/booking/step-client-form.tsx && git commit -m "feat(step3): add phone field and species/breed to client form"
```

---

## Phase 7: Wire `step-confirmation.tsx`

### Task 7.1: Submit real booking and show result

**Files:**
- Modify: `components/booking/step-confirmation.tsx`

**Step 1: Restructure as a two-state component**

Currently the confirmation shows a static success page. Change it to:

1. **Submitting state:** Show on mount, call `submitBooking()` via context, display spinner
2. **Success state:** Show appointment details from `BookingResult`
3. **Error state:** Show error message with retry button

The component receives all booking data as props and calls `submitBooking` on mount:

```typescript
interface StepConfirmationProps {
  veterinarian: Veterinarian;
  vetService: VeterinarianService;
  calendarId: string;
  date: string;
  dateFormatted: string;
  startTime: string;
  clientData: {
    phone: string;
    name: string;
    email: string;
    petName: string;
    species: string;
    breed: string;
    notes: string;
  };
  onReschedule: () => void;
}
```

On mount:

```typescript
useEffect(() => {
  if (bookingResult || submitting) return;
  submitBooking({
    phone: clientData.phone,
    clientName: clientData.name,
    email: clientData.email || undefined,
    patientName: clientData.petName || undefined,
    patientSpecies: clientData.species || undefined,
    patientBreed: clientData.breed || undefined,
    calendarId,
    date,
    startTime,
    veterinarianId: veterinarian.id,
    vetServiceId: vetService.id,
  }).catch(() => {});
}, []);
```

Display logic:
- `submitting` → `<Spinner />` + "Confirmando tu cita..."
- `submitError` → Error message + "Reintentar" button
- `bookingResult` → Success card with all details

**Step 2: Commit**

```bash
git add components/booking/step-confirmation.tsx && git commit -m "feat(step4): wire confirmation to real book_appointment RPC"
```

---

## Phase 8: Wire `booking-wizard.tsx` and `page.tsx`

### Task 8.1: Wrap wizard in BookingProvider

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/booking/booking-wizard.tsx`
- Modify: `components/booking/calendar-types.ts` (final cleanup)

**Step 1: Wrap in BookingProvider in page.tsx**

```typescript
import { BookingProvider } from "@/components/booking/booking-context";

function BookingPage() {
  const searchParams = useSearchParams();
  const vetId = searchParams.get("vet") ?? undefined;
  const vetServiceId = searchParams.get("vetService") ?? undefined;

  return (
    <BookingProvider>
      <BookingWizard
        initialVetId={vetId}
        initialVetServiceId={vetServiceId}
      />
    </BookingProvider>
  );
}
```

**Step 2: Rewrite BookingWizard state management**

Replace mock-based state with vet-centric state:

```typescript
interface BookingWizardProps {
  initialVetId?: string;
  initialVetServiceId?: string;
}
```

State variables:

```typescript
const { veterinarians, vetServices, loadingVets } = useBooking();

const [currentStep, setCurrentStep] = useState<BookingStepType>("service_selection");
const [selectedVet, setSelectedVet] = useState<Veterinarian | null>(null);
const [selectedVetService, setSelectedVetService] = useState<VeterinarianService | null>(null);
const [selectedDate, setSelectedDate] = useState<DateValue>(() => today(getLocalTimeZone()));
const [selectedTime, setSelectedTime] = useState<string>("");
const [clientData, setClientData] = useState<ClientFormData | null>(null);
```

Handle URL pre-selection:

```typescript
useEffect(() => {
  if (!initialVetId || veterinarians.length === 0) return;
  const vet = veterinarians.find((v) => v.id === initialVetId);
  if (vet) {
    setSelectedVet(vet);
    fetchVetServicesFor(vet.id);
    if (initialVetServiceId) {
      // Will be set once vetServices loads
    }
  }
}, [initialVetId, veterinarians]);

useEffect(() => {
  if (!initialVetServiceId || vetServices.length === 0) return;
  const svc = vetServices.find((s) => s.id === initialVetServiceId);
  if (svc) {
    setSelectedVetService(svc);
    setCurrentStep("calendar");
  }
}, [initialVetServiceId, vetServices]);
```

Pass correct props to each step:

- `StepServiceSelection`: `selectedVet`, `selectedVetService`, `onVetChange`, `onVetServiceChange`, `onNext`
- `StepCalendar`: `calendarId={selectedVet.calendar_id}`, `vetServiceId={selectedVetService.id}`, date/time state
- `StepClientForm`: `onBack`, `onSubmit` (sets clientData and advances to confirmation)
- `StepConfirmation`: all accumulated data, `onReschedule`

**Step 3: Clean up calendar-types.ts**

Remove the deprecated `VetService` and `Specialist` interfaces and their mock data. Remove `BookingData` (replaced by individual props). Keep only:

- `DurationEnum` (if still used for display)
- `TimeSlot`
- `BookingStepType`
- `TimeFormatEnum`, `timeFormats`

**Step 4: Verify the full flow**

Run: `npm run dev`
1. Open `http://localhost:3000` — should see real vets loading
2. Select a vet → should see their real services with prices
3. Select a service → calendar should show, date change should fetch real slots
4. Select a time → client form should appear with phone field
5. Submit → should call real `book_appointment` RPC
6. Confirmation should show real result from Supabase

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: complete Supabase wiring for all booking wizard steps"
```

---

## Dependency Graph

```
Phase 1 (DB RPCs)
  └─→ Phase 2 (lib/booking.ts)
       └─→ Phase 3 (booking-context.tsx)
            ├─→ Phase 4 (step-service-selection)
            ├─→ Phase 5 (step-calendar)
            ├─→ Phase 6 (step-client-form)
            ├─→ Phase 7 (step-confirmation)
            └─→ Phase 8 (booking-wizard + page + cleanup)
```

Phases 4-7 are independent of each other and could be parallelized, but must wait for Phase 3. Phase 8 integrates everything and must be last.
