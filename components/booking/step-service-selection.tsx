"use client";

import { useMemo } from "react";
import { Button, Card, Avatar } from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";

import type { Specialist, VetService } from "./calendar-types";
import { vetServices, specialists } from "./calendar-types";

interface StepServiceSelectionProps {
  selectedService: VetService | null;
  onServiceChange: (service: VetService) => void;
  selectedSpecialist: Specialist | null;
  onSpecialistChange: (specialist: Specialist) => void;
  onNext: () => void;
}

const fadeVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

export default function StepServiceSelection({
  selectedService,
  onServiceChange,
  selectedSpecialist,
  onSpecialistChange,
  onNext,
}: StepServiceSelectionProps) {
  const availableServices = useMemo(() => {
    if (!selectedSpecialist) return [];
    return vetServices.filter((s) => selectedSpecialist.serviceIds.includes(s.id));
  }, [selectedSpecialist]);

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col">
      <AnimatePresence mode="wait">
        {!selectedSpecialist ? (
          <motion.div
            key="specialist"
            animate="visible"
            className="flex min-h-0 flex-1 flex-col gap-3"
            exit="exit"
            initial="hidden"
            transition={{ duration: 0.25 }}
            variants={fadeVariants}
          >
            <div className="shrink-0 flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-default-foreground">
                Selecciona un Especialista
              </h2>
              <p className="text-small text-default-500">
                Elige al profesional que atenderá a tu mascota
              </p>
            </div>
            <div className="flex flex-1 flex-col gap-3">
                {specialists.map((specialist) => (
                  <Card
                    key={specialist.id}
                    isPressable
                    shadow="none"
                    className="flex cursor-pointer flex-row items-center gap-3 border border-default-200 p-3 transition-all hover:border-default-400"
                    onPress={() => onSpecialistChange(specialist)}
                  >
                    <Avatar
                      alt={specialist.name}
                      className="shrink-0"
                      size="md"
                      src={specialist.avatar}
                    />
                    <div className="flex flex-col gap-0.5">
                      <p className="text-small font-medium text-default-foreground">
                        {specialist.name}
                      </p>
                      <p className="text-tiny text-default-500">{specialist.specialty}</p>
                    </div>
                  </Card>
                ))}
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
              onClick={() => onSpecialistChange(null as unknown as Specialist)}
            >
              <Icon icon="solar:arrow-left-linear" width={16} />
              <Avatar
                alt={selectedSpecialist.name}
                className="h-6 w-6 shrink-0"
                src={selectedSpecialist.avatar}
              />
              {selectedSpecialist.name}
            </button>

            <div className="shrink-0 flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-default-foreground">
                Selecciona un Servicio
              </h2>
              <p className="text-small text-default-500">
                Servicios disponibles con {selectedSpecialist.name}
              </p>
            </div>

            <div className="flex-1">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {availableServices.map((service) => (
                  <Card
                    key={service.id}
                    isPressable
                    shadow="none"
                    className={`cursor-pointer transition-all ${
                      selectedService?.id === service.id
                        ? "border-2 border-primary"
                        : "border border-default-200 hover:border-default-400"
                    }`}
                    onPress={() => onServiceChange(service)}
                  >
                    <div className="flex flex-col gap-2 p-4">
                      <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-default-100 p-2">
                          <Icon className="text-default-600" icon={service.icon} width={24} />
                        </div>
                        <div className="flex flex-1 flex-col gap-0.5">
                          <p className="font-medium text-default-foreground">{service.name}</p>
                          <p className="text-tiny text-default-500">{service.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-small">
                        <span className="text-default-500">{service.duration}</span>
                        <span className="font-semibold text-primary">{service.price}</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <Button
              className="shrink-0 w-full"
              color="primary"
              isDisabled={!selectedService}
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
