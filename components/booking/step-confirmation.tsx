"use client";

import { Button, Chip, Divider, Link, Spinner } from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import type { Veterinarian, VeterinarianService } from "@/lib/booking";
import { useEffect, useMemo, useRef } from "react";

import { useBooking } from "./booking-context";
import { addMinutesToTime, normalizeTime } from "@/lib/payments";

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
  // Specialist services with a deposit have already had the appointment
  // confirmed by the payment step (payments-process-card + webhook).
  // We must NOT call submitBooking again — just render the success card.
  const alreadyConfirmedByPayment =
    !isGeneralFlow && (vetService?.deposit_amount ?? 0) > 0;

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
    if (alreadyConfirmedByPayment) return;
    if (didSubmit.current) return;
    didSubmit.current = true;
    submitBooking(bookingParams).catch(() => {});
  }, [alreadyConfirmedByPayment]);

  const handleRetry = () => {
    clearSubmitError();
    didSubmit.current = false;
    submitBooking(bookingParams).catch(() => {});
  };

  if (submitting && !bookingResult && !alreadyConfirmedByPayment) {
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

  if (!bookingResult && !alreadyConfirmedByPayment) {
    return null;
  }

  const effectiveStartTime = bookingResult?.start_time ?? normalizeTime(startTime);
  const effectiveEndTime =
    bookingResult?.end_time ??
    addMinutesToTime(normalizeTime(startTime), vetService?.duration_minutes ?? 0);

  const serviceName = isGeneralFlow
    ? generalServiceName
    : vetService?.label;

  const details = [
    {
      icon: "solar:clipboard-list-linear",
      label: "Servicio",
      value: serviceName,
    },
    ...(!isGeneralFlow && veterinarian
      ? [{
          icon: "solar:user-rounded-linear",
          label: "Especialista",
          value: `${veterinarian.name} — ${veterinarian.specialty}`,
        }]
      : []),
    {
      icon: "solar:calendar-linear",
      label: "Fecha y hora",
      value: (
        <>
          {dateFormatted}
          <br />
          {formatTime(effectiveStartTime)} -{" "}
          {formatTime(effectiveEndTime)}
        </>
      ),
    },
    {
      icon: "solar:phone-linear",
      label: "Cliente",
      value: `${clientData.name} (${clientData.phone})`,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 rounded-large bg-default-50 py-8 shadow-small">
      <div className="flex w-full flex-col items-center px-8">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
          className="mb-3"
        >
          <Icon
            className="text-success-500"
            icon="solar:check-circle-bold-duotone"
            width={56}
          />
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-default-foreground mb-2 text-lg font-medium font-serif"
        >
          ¡Tu cita ha sido agendada!
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-tiny text-default-500 text-center"
        >
          Hemos enviado un correo con los detalles de tu cita.
        </motion.p>
      </div>

      <Divider className="w-full" />

      <div className="flex w-full flex-col gap-4 px-8">
        {details.map((detail, i) => (
          <motion.div
            key={detail.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 + i * 0.08 }}
            className="flex w-full flex-col gap-1"
          >
            <p className="text-small font-medium text-default-foreground flex items-center gap-1.5">
              <Icon icon={detail.icon} width={14} className="text-default-400" />
              {detail.label}
            </p>
            <p className="text-tiny text-default-500 pl-[22px]">{detail.value}</p>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 + details.length * 0.08 }}
          className="flex w-full flex-col gap-1"
        >
          <p className="text-small font-medium text-default-foreground flex items-center gap-1.5">
            <Icon icon="solar:paw-bold" width={14} className="text-default-400" />
            Mascota
          </p>
          <span className="flex items-center gap-1 pl-[22px]">
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
        </motion.div>
        {clientData.notes && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 + (details.length + 1) * 0.08 }}
            className="flex w-full flex-col gap-1"
          >
            <p className="text-small font-medium text-default-foreground flex items-center gap-1.5">
              <Icon icon="solar:chat-line-linear" width={14} className="text-default-400" />
              Comentarios adicionales
            </p>
            <p className="text-tiny text-default-500 pl-[22px]">{clientData.notes}</p>
          </motion.div>
        )}
      </div>

      <Divider className="w-full" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="flex flex-col items-center gap-2 px-8"
      >
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
      </motion.div>

    </div>
  );
}
