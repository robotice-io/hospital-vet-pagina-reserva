"use client";

import { Button, Card, Avatar, Spinner, Chip, ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";

import type { Veterinarian, VeterinarianService } from "@/lib/booking";

import { useBooking } from "./booking-context";

interface StepServiceSelectionProps {
  selectedVet: Veterinarian | null;
  selectedVetService: VeterinarianService | null;
  onVetChange: (vet: Veterinarian | null) => void;
  onVetServiceChange: (service: VeterinarianService) => void;
  onNext: () => void;
}

const fadeVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export default function StepServiceSelection({
  selectedVet,
  selectedVetService,
  onVetChange,
  onVetServiceChange,
  onNext,
}: StepServiceSelectionProps) {
  const {
    veterinarians,
    loadingVets,
    vetServices,
    loadingVetServices,
  } = useBooking();

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col">
      <AnimatePresence mode="wait">
        {!selectedVet ? (
          <motion.div
            key="vet"
            animate="visible"
            className="flex min-h-0 flex-1 flex-col gap-3"
            exit="exit"
            initial="hidden"
            transition={{ duration: 0.25 }}
            variants={fadeVariants}
          >
            <div className="shrink-0 flex flex-col gap-1 pb-[15px]">
              <h2 className="text-lg font-semibold text-default-foreground">
                Selecciona un Especialista
              </h2>
              <p className="text-small text-default-500">
                Elige al profesional que atenderá a tu mascota
              </p>
            </div>
            <div className="flex min-h-0 flex-1">
              {loadingVets ? (
                <div className="flex flex-1 items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                <ScrollShadow hideScrollBar className="flex w-full flex-col gap-3">
                  {veterinarians.map((vet) => (
                    <Card
                      key={vet.id}
                      isPressable
                      shadow="none"
                      className="shrink-0 flex cursor-pointer flex-row items-center gap-3 border border-default-200 p-3 transition-all hover:border-default-400"
                      onPress={() => onVetChange(vet)}
                    >
                      <Avatar
                        alt={vet.name}
                        className="shrink-0"
                        size="md"
                        src={`https://i.pravatar.cc/150?u=${vet.id}`}
                      />
                      <div className="flex flex-col gap-0.5">
                        <p className="text-small font-medium text-default-foreground">
                          {vet.name}
                        </p>
                        <p className="text-tiny text-default-500">{vet.specialty}</p>
                      </div>
                    </Card>
                  ))}
                </ScrollShadow>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="service"
            animate="visible"
            className="flex min-h-0 flex-1 flex-col gap-3"
            exit="exit"
            initial="hidden"
            transition={{ duration: 0.25 }}
            variants={fadeVariants}
          >
            <button
              className="shrink-0 flex items-center gap-2 text-small text-default-500 transition-colors hover:text-default-700"
              type="button"
              onClick={() => onVetChange(null)}
            >
              <Icon icon="solar:arrow-left-linear" width={16} />
              <Avatar
                alt={selectedVet.name}
                className="h-6 w-6 shrink-0"
                src={`https://i.pravatar.cc/150?u=${selectedVet.id}`}
              />
              {selectedVet.name}
            </button>

            <div className="shrink-0 flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-default-foreground">
                Selecciona un Servicio
              </h2>
              <p className="text-small text-default-500">
                Servicios disponibles con {selectedVet.name}
              </p>
            </div>

            <div className="flex min-h-0 flex-1">
              {loadingVetServices ? (
                <div className="flex flex-1 items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                <ScrollShadow hideScrollBar className="w-full">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {vetServices.map((service) => (
                      <Card
                        key={service.id}
                        isPressable
                        shadow="none"
                        className={`cursor-pointer transition-all ${
                          selectedVetService?.id === service.id
                            ? "border-2 border-primary"
                            : "border border-default-200 hover:border-default-400"
                        }`}
                        onPress={() => onVetServiceChange(service)}
                      >
                        <div className="flex flex-col gap-2 p-4">
                          <div className="flex flex-1 flex-col gap-0.5">
                            <p className="font-medium text-default-foreground">
                              {service.label}
                            </p>
                            <Chip size="sm" variant="flat">
                              {capitalizeFirst(service.appointment_type)}
                            </Chip>
                          </div>
                          <div className="flex items-center justify-between text-small">
                            <span className="text-default-500">
                              {service.duration_minutes} min
                            </span>
                            <span className="font-semibold text-primary">
                              {new Intl.NumberFormat("es-CL", {
                                style: "currency",
                                currency: "CLP",
                                maximumFractionDigits: 0,
                              }).format(service.price)}
                            </span>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollShadow>
              )}
            </div>

            <Button
              className="shrink-0 w-full"
              color="primary"
              isDisabled={!selectedVetService}
              onPress={onNext}
            >
              Continuar
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
