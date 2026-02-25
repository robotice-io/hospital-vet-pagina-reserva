"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Spinner } from "@heroui/react";
import { getLocalTimeZone, today } from "@internationalized/date";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import type { DateValue } from "@heroui/react";
import type {
  BookingData,
  BookingStepType,
  Specialist,
  TimeSlot,
  VetService,
} from "./calendar-types";
import {
  DurationEnum,
  vetServices,
  specialists,
} from "./calendar-types";
import StepServiceSelection from "./step-service-selection";
import StepCalendar from "./step-calendar";
import StepClientForm from "./step-client-form";
import StepConfirmation from "./step-confirmation";

interface BookingWizardProps {
  initialServiceId?: string;
  initialSpecialistId?: string;
  /** TODO: Validate this token against backend to authorize the booking session */
  token?: string;
}

const steps: { key: BookingStepType; label: string }[] = [
  { key: "service_selection", label: "Servicio" },
  { key: "calendar", label: "Fecha y Hora" },
  { key: "client_form", label: "Datos" },
  { key: "confirmation", label: "Confirmación" },
];

export default function BookingWizard({
  initialServiceId,
  initialSpecialistId,
}: BookingWizardProps) {
  const preSelectedService = useMemo(
    () => vetServices.find((s) => s.id === initialServiceId) ?? null,
    [initialServiceId],
  );
  const preSelectedSpecialist = useMemo(
    () => specialists.find((s) => s.id === initialSpecialistId) ?? null,
    [initialSpecialistId],
  );

  const shouldSkipStep1 = preSelectedService !== null && preSelectedSpecialist !== null;

  const [mounted, setMounted] = useState(false);
  const [currentStep, setCurrentStep] = useState<BookingStepType>(
    shouldSkipStep1 ? "calendar" : "service_selection",
  );
  const [selectedService, setSelectedService] = useState<VetService | null>(preSelectedService);
  const [selectedSpecialist, setSelectedSpecialist] = useState<Specialist | null>(preSelectedSpecialist);
  const [selectedDate, setSelectedDate] = useState<DateValue>(() => today(getLocalTimeZone()));
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [selectedTimeSlotRange, setSelectedTimeSlotRange] = useState<TimeSlot[]>([]);
  const [duration, setDuration] = useState<DurationEnum>(() => {
    if (preSelectedService?.duration.includes("60")) return DurationEnum.SixtyMinutes;
    return DurationEnum.ThirtyMinutes;
  });
  const [bookingData, setBookingData] = useState<BookingData | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentStepIndex = steps.findIndex((s) => s.key === currentStep);

  const handleTimeChange = useCallback((time: string, timeSlotRange?: TimeSlot[]) => {
    setSelectedTime(time);
    if (timeSlotRange) setSelectedTimeSlotRange(timeSlotRange);
  }, []);

  const handleClientFormSubmit = useCallback(
    (data: { name: string; email: string; petName: string; petType: string; notes: string }) => {
      const dateFormatted = format(
        new Date(selectedDate.toString()),
        "EEEE, d 'de' MMMM yyyy",
        { locale: es },
      );

      const timeLabel =
        selectedTimeSlotRange.length >= 2
          ? `${selectedTimeSlotRange[0].label} - ${selectedTimeSlotRange[1].label}`
          : selectedTime;

      setBookingData({
        service: selectedService,
        specialist: selectedSpecialist,
        date: dateFormatted,
        timeSlot: timeLabel,
        timeSlotRange: selectedTimeSlotRange,
        duration,
        clientName: data.name,
        clientEmail: data.email,
        petName: data.petName,
        petType: data.petType,
        notes: data.notes,
      });
      setCurrentStep("confirmation");
    },
    [selectedDate, selectedTimeSlotRange, selectedTime, selectedService, selectedSpecialist, duration],
  );

  const handleReschedule = useCallback(() => {
    setCurrentStep("service_selection");
    setSelectedTime("");
    setSelectedTimeSlotRange([]);
    setBookingData(null);
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

      <div className="flex min-h-0 flex-1 flex-col">
        {currentStep === "service_selection" && (
          <StepServiceSelection
            selectedService={selectedService}
            selectedSpecialist={selectedSpecialist}
            onNext={() => setCurrentStep("calendar")}
            onServiceChange={(service) => {
              setSelectedService(service);
              setDuration(
                service.duration.includes("60")
                  ? DurationEnum.SixtyMinutes
                  : DurationEnum.ThirtyMinutes,
              );
            }}
            onSpecialistChange={(specialist) => {
              setSelectedSpecialist(specialist);
              setSelectedService(null);
            }}
          />
        )}

        {currentStep === "calendar" && (
          <StepCalendar
            duration={duration}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            onBack={() => setCurrentStep("service_selection")}
            onDateChange={setSelectedDate}
            onNext={() => setCurrentStep("client_form")}
            onTimeChange={handleTimeChange}
          />
        )}

        {currentStep === "client_form" && (
          <StepClientForm
            onBack={() => setCurrentStep("calendar")}
            onSubmit={handleClientFormSubmit}
          />
        )}

        {currentStep === "confirmation" && bookingData && (
          <StepConfirmation bookingData={bookingData} onReschedule={handleReschedule} />
        )}
      </div>
    </div>
  );
}
