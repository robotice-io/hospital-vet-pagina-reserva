"use client";

import { useState, useCallback, useEffect } from "react";
import { Skeleton } from "@heroui/react";
import { getLocalTimeZone, today } from "@internationalized/date";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";

import type { DateValue } from "@heroui/react";
import type { Veterinarian, VeterinarianService, GeneralService } from "@/lib/booking";
import type { BookingStepType, TimeSlot } from "./calendar-types";
import { useBooking } from "./booking-context";
import StepServiceSelection from "./step-service-selection";
import StepCalendar from "./step-calendar";
import StepClientForm from "./step-client-form";
import StepConfirmation from "./step-confirmation";
import StepPaymentBrick from "./step-payment-brick";

interface ClientFormData {
  phone: string;
  name: string;
  email: string;
  petName: string;
  species: string;
  breed: string;
  notes: string;
  payFullPrice: boolean;
}

interface BookingWizardProps {
  initialVetId?: string;
  initialVetServiceId?: string;
}

const baseSteps: { key: BookingStepType; label: string }[] = [
  { key: "service_selection", label: "Servicio" },
  { key: "calendar", label: "Fecha y Hora" },
  { key: "client_form", label: "Datos" },
  { key: "confirmation", label: "Hora confirmada" },
];

const stepsWithPayment: { key: BookingStepType; label: string }[] = [
  { key: "service_selection", label: "Servicio" },
  { key: "calendar", label: "Fecha y Hora" },
  { key: "client_form", label: "Datos" },
  { key: "payment", label: "Pago reserva" },
  { key: "confirmation", label: "Hora confirmada" },
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
  const [serviceSelectionAttentionPhase, setServiceSelectionAttentionPhase] =
    useState(true);
  const [attentionType, setAttentionType] = useState<
    "general" | "specialist" | null
  >(null);
  const [stepDirection, setStepDirection] = useState(0);
  const [selectedVet, setSelectedVet] = useState<Veterinarian | null>(null);
  const [selectedVetService, setSelectedVetService] = useState<VeterinarianService | null>(null);
  const [selectedGeneralService, setSelectedGeneralService] = useState<GeneralService | null>(null);
  const [selectedDate, setSelectedDate] = useState<DateValue>(() => today(getLocalTimeZone()));
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [selectedTimeSlotRange, setSelectedTimeSlotRange] = useState<TimeSlot[]>([]);
  const [clientData, setClientData] = useState<ClientFormData | null>(null);

  const isGeneralFlow = selectedGeneralService !== null;
  // Stepper shows 5 steps as soon as the user picks "Especialista" on the
  // first page. Whether the actual payment step renders is still gated on
  // the selected service having a deposit_amount > 0 (some specialists may
  // not require it), so we keep that check on the routing side.
  const isSpecialistFlow = attentionType === "specialist";
  const hasDeposit = (selectedVetService?.deposit_amount ?? 0) > 0;
  const requiresPayment = isSpecialistFlow && hasDeposit;
  const steps = isSpecialistFlow ? stepsWithPayment : baseSteps;

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
      goTo(requiresPayment ? "payment" : "confirmation", 1);
    },
    [goTo, requiresPayment],
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
    setAttentionType(null);
    goTo("service_selection", -1);
  }, [resetBookingState, goTo]);

  if (!mounted || loadingVets) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col gap-5">
        {/* Logo placeholder — matches the attention_type header */}
        <div className="flex justify-start pb-0">
          <div className="flex items-center gap-2">
            <Skeleton className="h-[46px] w-[46px] rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-40 rounded-md" />
              <Skeleton className="h-3 w-20 rounded-md" />
            </div>
          </div>
        </div>
        {/* Content placeholder — matches the two attention-type cards */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-3/4 rounded-md" />
          <Skeleton className="h-3 w-1/2 rounded-md" />
        </div>
        <div className="flex flex-col gap-3 pt-2">
          <Skeleton className="h-20 w-full rounded-large" />
          <Skeleton className="h-20 w-full rounded-large" />
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
    <div className="flex min-h-0 w-full flex-1 flex-col gap-5">
      <AnimatePresence mode="wait">
        {currentStep === "service_selection" && serviceSelectionAttentionPhase ? (
          <motion.div
            key="hvi-logo"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex justify-start pb-0"
          >
            <div className="flex items-center gap-2">
              <Image
                src="/hvi-logo.png"
                alt="Hospital Veterinario Integral"
                width={46}
                height={46}
                priority
                className="rounded-full"
              />
              <div className="flex flex-col leading-tight">
                <span className="text-medium font-semibold font-serif text-default-foreground">
                  Hospital Veterinario
                </span>
                <span className="text-small tracking-[0.18em] text-default-500">
                  INTEGRAL
                </span>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="stepper"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-1 -mt-[5px]"
          >
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
          </motion.div>
        )}
      </AnimatePresence>

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
          onAnimationComplete={(definition) => {
            // Strip residual transform after the slide-in finishes.
            // Mobile WebKit/Blink mishandle touch events on iframes nested
            // inside ancestors with any transform value (including translate(0,0)),
            // which breaks the MP card brick's secure fields after first focus.
            if (definition === "center" && currentStep === "confirmation") {
              const el = document.querySelector<HTMLElement>(
                `[data-wizard-step="${currentStep}"]`,
              );
              if (el) {
                el.style.transform = "none";
                el.style.willChange = "auto";
              }
            }
          }}
          data-wizard-step={currentStep}
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
              onAttentionPhaseChange={setServiceSelectionAttentionPhase}
              onAttentionTypeChange={setAttentionType}
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
              depositAmount={requiresPayment ? (selectedVetService?.deposit_amount ?? undefined) : undefined}
              fullPrice={requiresPayment ? (selectedVetService?.price ?? undefined) : undefined}
            />
          )}

          {currentStep === "payment" &&
            requiresPayment &&
            clientData &&
            selectedVet &&
            selectedVetService && (
              <StepPaymentBrick
                veterinarian={selectedVet}
                vetService={selectedVetService}
                date={selectedDate.toString()}
                startTime={selectedTime}
                clientData={clientData}
                onConfirmed={() => goTo("confirmation", 1)}
                onSlotTaken={handleChangeTime}
                onCancel={() => goTo("client_form", -1)}
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
