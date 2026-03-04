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
