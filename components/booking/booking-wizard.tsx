"use client";

import { useState, useCallback, useEffect } from "react";
import { Skeleton } from "@heroui/react";
import { getLocalTimeZone, today } from "@internationalized/date";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AnimatePresence, motion } from "framer-motion";

import type { DateValue } from "@heroui/react";
import type { Veterinarian, VeterinarianService, GeneralService } from "@/lib/booking";
import type { BookingStepType, TimeSlot } from "./calendar-types";
import { useBooking } from "./booking-context";
import StepServiceSelection from "./step-service-selection";
import StepCalendar from "./step-calendar";
import StepClientForm from "./step-client-form";
import StepConfirmation from "./step-confirmation";

interface ClientFormData {
  phone: string;
  name: string;
  email: string;
  petName: string;
  species: string;
  breed: string;
  notes: string;
}

interface BookingWizardProps {
  initialVetId?: string;
  initialVetServiceId?: string;
}

const steps: { key: BookingStepType; label: string }[] = [
  { key: "service_selection", label: "Servicio" },
  { key: "calendar", label: "Fecha y Hora" },
  { key: "client_form", label: "Datos" },
  { key: "confirmation", label: "Confirmación" },
];

const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

export default function BookingWizard({
  initialVetId,
  initialVetServiceId,
}: BookingWizardProps) {
  const { veterinarians, vetServices, loadingVets, fetchVetServicesFor, resetBookingState } = useBooking();

  const [mounted, setMounted] = useState(false);
  const [currentStep, setCurrentStep] = useState<BookingStepType>("service_selection");
  const [stepDirection, setStepDirection] = useState(0);
  const [selectedVet, setSelectedVet] = useState<Veterinarian | null>(null);
  const [selectedVetService, setSelectedVetService] = useState<VeterinarianService | null>(null);
  const [selectedGeneralService, setSelectedGeneralService] = useState<GeneralService | null>(null);
  const [selectedDate, setSelectedDate] = useState<DateValue>(() => today(getLocalTimeZone()));
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [selectedTimeSlotRange, setSelectedTimeSlotRange] = useState<TimeSlot[]>([]);
  const [clientData, setClientData] = useState<ClientFormData | null>(null);

  const isGeneralFlow = selectedGeneralService !== null;

  const goTo = useCallback((step: BookingStepType, direction: 1 | -1) => {
    setStepDirection(direction);
    setCurrentStep(step);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!initialVetId || veterinarians.length === 0) return;
    const vet = veterinarians.find((v) => v.id === initialVetId);
    if (vet) {
      setSelectedVet(vet);
      fetchVetServicesFor(vet.id);
    }
  }, [initialVetId, veterinarians, fetchVetServicesFor]);

  useEffect(() => {
    if (!initialVetServiceId || vetServices.length === 0 || !selectedVet) return;
    const svc = vetServices.find((s) => s.id === initialVetServiceId);
    if (svc) {
      setSelectedVetService(svc);
      goTo("calendar", 1);
    }
  }, [initialVetServiceId, vetServices, selectedVet, goTo]);

  const currentStepIndex = steps.findIndex((s) => s.key === currentStep);

  const handleTimeChange = useCallback((time: string, timeSlotRange?: TimeSlot[]) => {
    setSelectedTime(time);
    if (timeSlotRange) setSelectedTimeSlotRange(timeSlotRange);
  }, []);

  const handleClientFormSubmit = useCallback(
    (data: ClientFormData) => {
      setClientData(data);
      goTo("confirmation", 1);
    },
    [goTo],
  );

  const handleGeneralServiceSelect = useCallback((service: GeneralService) => {
    setSelectedGeneralService(service);
    setSelectedVet(null);
    setSelectedVetService(null);
    goTo("calendar", 1);
  }, [goTo]);

  const handleChangeTime = useCallback(() => {
    resetBookingState();
    setSelectedTime("");
    setSelectedTimeSlotRange([]);
    setClientData(null);
    goTo("calendar", -1);
  }, [resetBookingState, goTo]);

  const handleReschedule = useCallback(() => {
    resetBookingState();
    setSelectedVet(null);
    setSelectedVetService(null);
    setSelectedGeneralService(null);
    setSelectedTime("");
    setSelectedTimeSlotRange([]);
    setClientData(null);
    goTo("service_selection", -1);
  }, [resetBookingState, goTo]);

  if (!mounted || loadingVets) {
    return (
      <div className="flex w-full flex-1 flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-1 flex-1 rounded-full" />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="mx-auto h-3 w-12 rounded-md" />
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-4 pt-4">
          <Skeleton className="h-5 w-3/4 rounded-md" />
          <Skeleton className="h-3 w-1/2 rounded-md" />
          <div className="flex flex-col gap-3 pt-2">
            <Skeleton className="h-16 w-full rounded-large" />
            <Skeleton className="h-16 w-full rounded-large" />
          </div>
        </div>
      </div>
    );
  }

  const calendarId = isGeneralFlow
    ? selectedGeneralService.calendar_id
    : selectedVet?.calendar_id ?? "";

  const dateFormatted = format(
    new Date(selectedDate.year, selectedDate.month - 1, selectedDate.day),
    "EEEE, d 'de' MMMM yyyy",
    { locale: es },
  );

  const canShowCalendar = calendarId && (isGeneralFlow || selectedVetService);
  const canShowConfirmation = clientData && (isGeneralFlow || (selectedVet && selectedVetService));

  return (
    <div className={`flex w-full flex-1 flex-col gap-5 ${currentStep === "confirmation" ? "overflow-y-auto" : "overflow-hidden"}`}>
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

      <AnimatePresence mode="wait" custom={stepDirection}>
        <motion.div
          key={currentStep}
          custom={stepDirection}
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.25 }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {currentStep === "service_selection" && (
            <StepServiceSelection
              selectedVet={selectedVet}
              selectedVetService={selectedVetService}
              onVetChange={(vet) => {
                setSelectedVet(vet);
                setSelectedVetService(null);
                setSelectedGeneralService(null);
                if (vet) {
                  fetchVetServicesFor(vet.id);
                }
              }}
              onVetServiceChange={(service) => {
                setSelectedVetService(service);
              }}
              onGeneralServiceSelect={handleGeneralServiceSelect}
              onNext={() => goTo("calendar", 1)}
            />
          )}

          {currentStep === "calendar" && canShowCalendar && (
            <StepCalendar
              calendarId={calendarId}
              vetServiceId={isGeneralFlow ? undefined : selectedVetService!.id}
              serviceId={isGeneralFlow ? selectedGeneralService.id : undefined}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              onBack={() => goTo("service_selection", -1)}
              onDateChange={setSelectedDate}
              onNext={() => goTo("client_form", 1)}
              onTimeChange={handleTimeChange}
            />
          )}

          {currentStep === "client_form" && (
            <StepClientForm
              onBack={() => goTo("calendar", -1)}
              onSubmit={handleClientFormSubmit}
            />
          )}

          {currentStep === "confirmation" && canShowConfirmation && (
            <StepConfirmation
              veterinarian={isGeneralFlow ? undefined : selectedVet!}
              vetService={isGeneralFlow ? undefined : selectedVetService!}
              generalServiceName={isGeneralFlow ? selectedGeneralService.name : undefined}
              calendarId={calendarId}
              serviceId={isGeneralFlow ? selectedGeneralService.id : undefined}
              date={selectedDate.toString()}
              dateFormatted={dateFormatted}
              startTime={selectedTime}
              clientData={clientData}
              onReschedule={handleReschedule}
              onChangeTime={handleChangeTime}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
