"use client";

// TODO: MOCKUP - Replace with real booking confirmation data from backend

import {Button, Chip, Divider, Link} from "@heroui/react";
import {Icon} from "@iconify/react";
import type {BookingData} from "./calendar-types";

interface StepConfirmationProps {
  bookingData: BookingData;
  onReschedule: () => void;
}

export default function StepConfirmation({bookingData, onReschedule}: StepConfirmationProps) {
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
          Hemos enviado un correo con los detalles de tu cita.
        </p>
      </div>

      <Divider className="w-full" />

      <div className="flex w-full flex-col gap-4 px-8">
        <div className="flex w-full flex-col gap-1">
          <p className="text-small font-medium text-default-foreground">Servicio</p>
          <p className="text-tiny text-default-500">{bookingData.service?.name ?? "—"}</p>
        </div>
        <div className="flex w-full flex-col gap-1">
          <p className="text-small font-medium text-default-foreground">Especialista</p>
          <p className="text-tiny text-default-500">{bookingData.specialist?.name ?? "—"}</p>
        </div>
        <div className="flex w-full flex-col gap-1">
          <p className="text-small font-medium text-default-foreground">Fecha y hora</p>
          <p className="text-tiny text-default-500">
            {bookingData.date}
            <br />
            {bookingData.timeSlot}
          </p>
        </div>
        <div className="flex w-full flex-col gap-1">
          <p className="text-small font-medium text-default-foreground">Cliente</p>
          <p className="text-tiny text-default-500">
            {bookingData.clientName} ({bookingData.clientEmail})
          </p>
        </div>
        <div className="flex w-full flex-col gap-1">
          <p className="text-small font-medium text-default-foreground">Mascota</p>
          <span className="flex items-center gap-1">
            <p className="text-tiny text-default-500">{bookingData.petName}</p>
            {bookingData.petType && (
              <Chip
                classNames={{base: "px-0.5 h-4", content: "text-[10px] leading-3"}}
                color="primary"
                size="sm"
                variant="flat"
              >
                {bookingData.petType.charAt(0).toUpperCase() + bookingData.petType.slice(1)}
              </Chip>
            )}
          </span>
        </div>
        {bookingData.notes && (
          <div className="flex w-full flex-col gap-1">
            <p className="text-small font-medium text-default-foreground">Comentarios adicionales</p>
            <p className="text-tiny text-default-500">{bookingData.notes}</p>
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

      <Divider className="w-full" />

      <div className="flex flex-col items-center gap-2">
        <p className="text-tiny text-default-500">Agregar al calendario</p>
        <div className="flex items-center gap-2">
          <Button isIconOnly className="bg-default-100" size="sm">
            <Icon className="text-default-600" icon="mdi:google" width={16} />
          </Button>
          <Button isIconOnly className="bg-default-100" size="sm">
            <Icon className="text-default-600" icon="mdi:microsoft-outlook" width={16} />
          </Button>
          <Button isIconOnly className="bg-default-100" size="sm">
            <Icon className="text-default-600" icon="mdi:microsoft-office" width={16} />
          </Button>
          <Button isIconOnly className="bg-default-100" size="sm">
            <Icon className="text-default-600" icon="mdi:calendar-outline" width={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
