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
  getAvailabilityDays,
  getBlockedDates,
  getGeneralServices,
  bookAppointment,
} from "@/lib/booking";
import type {
  Veterinarian,
  VeterinarianService,
  AvailableSlot,
  BookingResult,
  GeneralService,
} from "@/lib/booking";

interface BookingContextValue {
  veterinarians: Veterinarian[];
  loadingVets: boolean;

  vetServices: VeterinarianService[];
  loadingVetServices: boolean;

  availableSlots: AvailableSlot[];
  loadingSlots: boolean;

  generalServices: GeneralService[];
  loadingGeneralServices: boolean;

  availableDays: string[];
  blockedDates: string[];
  loadingAvailability: boolean;

  fetchVetServicesFor: (veterinarianId: string) => void;
  fetchSlotsFor: (calendarId: string, date: string, vetServiceId?: string, serviceId?: string) => void;
  fetchAvailabilityFor: (calendarId: string) => void;
  fetchGeneralServices: () => void;

  submitBooking: (params: {
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
  }) => Promise<BookingResult>;

  bookingResult: BookingResult | null;
  submitting: boolean;
  submitError: string | null;
  clearSubmitError: () => void;
  resetBookingState: () => void;
}

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [veterinarians, setVeterinarians] = useState<Veterinarian[]>([]);
  const [vetServicesState, setVetServices] = useState<VeterinarianService[]>([]);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);

  const [loadingVets, setLoadingVets] = useState(true);
  const [loadingVetServices, setLoadingVetServices] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [generalServicesState, setGeneralServices] = useState<GeneralService[]>([]);
  const [loadingGeneralServices, setLoadingGeneralServices] = useState(false);

  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

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
    (calendarId: string, date: string, vetServiceId?: string, serviceId?: string) => {
      setLoadingSlots(true);
      setAvailableSlots([]);
      getAvailableSlots(calendarId, date, serviceId, vetServiceId)
        .then(setAvailableSlots)
        .catch(() => setAvailableSlots([]))
        .finally(() => setLoadingSlots(false));
    },
    [],
  );

  const fetchGeneralServicesCallback = useCallback(() => {
    setLoadingGeneralServices(true);
    getGeneralServices()
      .then(setGeneralServices)
      .catch(() => setGeneralServices([]))
      .finally(() => setLoadingGeneralServices(false));
  }, []);

  const fetchAvailabilityFor = useCallback((calendarId: string) => {
    setLoadingAvailability(true);
    setAvailableDays([]);
    setBlockedDates([]);
    Promise.all([
      getAvailabilityDays(calendarId),
      getBlockedDates(calendarId),
    ])
      .then(([days, blocked]) => {
        setAvailableDays(days);
        setBlockedDates(blocked);
      })
      .catch(() => {
        setAvailableDays([]);
        setBlockedDates([]);
      })
      .finally(() => setLoadingAvailability(false));
  }, []);

  const submitBooking = useCallback(
    async (params: {
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
    }) => {
      setSubmitting(true);
      setSubmitError(null);
      try {
        const result = await bookAppointment(params);
        setBookingResult(result);
        return result;
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : "";
        const message = raw.startsWith("Este horario")
          ? raw
          : "Ocurrió un error al agendar tu cita. Por favor intenta nuevamente.";
        setSubmitError(message);
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  const clearSubmitError = useCallback(() => setSubmitError(null), []);

  const resetBookingState = useCallback(() => {
    setBookingResult(null);
    setSubmitError(null);
    setAvailableSlots([]);
  }, []);

  const value = useMemo<BookingContextValue>(
    () => ({
      veterinarians,
      loadingVets,
      vetServices: vetServicesState,
      loadingVetServices,
      availableSlots,
      loadingSlots,
      generalServices: generalServicesState,
      loadingGeneralServices,
      availableDays,
      blockedDates,
      loadingAvailability,
      fetchVetServicesFor,
      fetchSlotsFor,
      fetchAvailabilityFor,
      fetchGeneralServices: fetchGeneralServicesCallback,
      submitBooking,
      bookingResult,
      submitting,
      submitError,
      clearSubmitError,
      resetBookingState,
    }),
    [
      veterinarians,
      loadingVets,
      vetServicesState,
      loadingVetServices,
      availableSlots,
      loadingSlots,
      generalServicesState,
      loadingGeneralServices,
      availableDays,
      blockedDates,
      loadingAvailability,
      fetchVetServicesFor,
      fetchSlotsFor,
      fetchAvailabilityFor,
      fetchGeneralServicesCallback,
      submitBooking,
      bookingResult,
      submitting,
      submitError,
      clearSubmitError,
      resetBookingState,
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
