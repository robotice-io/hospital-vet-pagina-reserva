"use client";

import { Button, Chip, Divider, Link, Spinner } from "@heroui/react";
import { Icon } from "@iconify/react";
import type { Veterinarian, VeterinarianService } from "@/lib/booking";
import { useEffect, useMemo, useRef } from "react";

import { useBooking } from "./booking-context";

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hours = parseInt(h, 10);
  const period = hours >= 12 ? "pm" : "am";
  const display = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${display}:${m} ${period}`;
}

interface StepConfirmationProps {
  veterinarian?: Veterinarian;
  vetService?: VeterinarianService;
  generalServiceName?: string;
  calendarId: string;
  serviceId?: string;
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
  onChangeTime: () => void;
}

export default function StepConfirmation({
  veterinarian,
  vetService,
  generalServiceName,
  calendarId,
  serviceId,
  date,
  dateFormatted,
  startTime,
  clientData,
  onReschedule,
  onChangeTime,
}: StepConfirmationProps) {
  const {
    submitBooking,
    bookingResult,
    submitting,
    submitError,
    clearSubmitError,
  } = useBooking();
  const didSubmit = useRef(false);

  const isGeneralFlow = !veterinarian;

  const bookingParams = useMemo(
    () => ({
      phone: clientData.phone,
      clientName: clientData.name,
      email: clientData.email || undefined,
      patientName: clientData.petName || undefined,
      patientSpecies: clientData.species || undefined,
      patientBreed: clientData.breed || undefined,
      calendarId,
      date,
      startTime,
      veterinarianId: veterinarian?.id,
      vetServiceId: vetService?.id,
      serviceId,
      notes: clientData.notes || undefined,
    }),
    [
      clientData,
      calendarId,
      date,
      startTime,
      veterinarian?.id,
      vetService?.id,
      serviceId,
    ],
  );

  useEffect(() => {
    if (didSubmit.current) return;
    didSubmit.current = true;
    submitBooking(bookingParams).catch(() => {});
  }, []);

  const handleRetry = () => {
    clearSubmitError();
    didSubmit.current = false;
    submitBooking(bookingParams).catch(() => {});
  };

  if (submitting && !bookingResult) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 rounded-large bg-default-50 py-12 shadow-small">
        <Spinner color="primary" size="lg" />
        <p className="text-small text-default-500">Confirmando tu cita...</p>
      </div>
    );
  }

  if (submitError) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 rounded-large bg-default-50 py-8 px-8 shadow-small">
        <Icon
          className="text-danger-500 mb-3"
          icon="solar:close-circle-bold-duotone"
          width={56}
        />
        <p className="text-default-foreground text-lg font-medium font-serif">
          Error al confirmar
        </p>
        <p className="text-tiny text-default-500 text-center">{submitError}</p>
        <div className="flex gap-2">
          <Button variant="flat" onPress={onChangeTime}>
            Cambiar horario
          </Button>
          <Button color="primary" onPress={handleRetry}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (!bookingResult) {
    return null;
  }

  const serviceName = isGeneralFlow
    ? generalServiceName
    : vetService?.label;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 rounded-large bg-default-50 py-8 shadow-small">
      <div className="flex w-full flex-col items-center px-8">
        <Icon
          className="text-success-500 mb-3"
          icon="solar:check-circle-bold-duotone"
          width={56}
        />
        <p className="text-default-foreground mb-2 text-lg font-medium font-serif">
          ¡Tu cita ha sido agendada!
        </p>
        <p className="text-tiny text-default-500 text-center">
          Hemos enviado un correo con los detalles de tu cita.
        </p>
      </div>

      <Divider className="w-full" />

      <div className="flex w-full flex-col gap-4 px-8">
        <div className="flex w-full flex-col gap-1">
          <p className="text-small font-medium text-default-foreground">
            Servicio
          </p>
          <p className="text-tiny text-default-500">{serviceName}</p>
        </div>
        {!isGeneralFlow && veterinarian && (
          <div className="flex w-full flex-col gap-1">
            <p className="text-small font-medium text-default-foreground">
              Especialista
            </p>
            <p className="text-tiny text-default-500">
              {veterinarian.name} — {veterinarian.specialty}
            </p>
          </div>
        )}
        <div className="flex w-full flex-col gap-1">
          <p className="text-small font-medium text-default-foreground">
            Fecha y hora
          </p>
          <p className="text-tiny text-default-500">
            {dateFormatted}
            <br />
            {formatTime(bookingResult.start_time)} -{" "}
            {formatTime(bookingResult.end_time)}
          </p>
        </div>
        <div className="flex w-full flex-col gap-1">
          <p className="text-small font-medium text-default-foreground">
            Cliente
          </p>
          <p className="text-tiny text-default-500">
            {clientData.name} ({clientData.phone})
          </p>
        </div>
        <div className="flex w-full flex-col gap-1">
          <p className="text-small font-medium text-default-foreground">
            Mascota
          </p>
          <span className="flex items-center gap-1">
            <p className="text-tiny text-default-500">{clientData.petName}</p>
            {clientData.species && (
              <Chip
                classNames={{ base: "px-0.5 h-4", content: "text-[10px] leading-3" }}
                color="primary"
                size="sm"
                variant="flat"
              >
                {clientData.species.charAt(0).toUpperCase() +
                  clientData.species.slice(1)}
              </Chip>
            )}
          </span>
        </div>
        {clientData.notes && (
          <div className="flex w-full flex-col gap-1">
            <p className="text-small font-medium text-default-foreground">
              Comentarios adicionales
            </p>
            <p className="text-tiny text-default-500">{clientData.notes}</p>
          </div>
        )}
      </div>

      <Divider className="w-full" />

      <div className="flex flex-col items-center gap-2 px-8">
        <p className="text-tiny text-default-500">¿Necesitas hacer un cambio?</p>
        <div className="flex items-center gap-2">
          <Link
            className="text-small text-default-800"
            href="#"
            size="sm"
            underline="always"
            onPress={onReschedule}
          >
            Reagendar
          </Link>
          <span className="text-default-400">|</span>
          <Link
            className="text-small text-default-800"
            href="#"
            size="sm"
            underline="always"
            onPress={onReschedule}
          >
            Cancelar
          </Link>
        </div>
      </div>

    </div>
  );
}
