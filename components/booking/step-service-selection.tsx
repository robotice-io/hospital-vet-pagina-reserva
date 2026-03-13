"use client";

import { Button, Card, Avatar, Spinner, Chip, ScrollShadow } from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";

import type { Veterinarian, VeterinarianService, GeneralService } from "@/lib/booking";

import { useBooking } from "./booking-context";

interface StepServiceSelectionProps {
  selectedVet: Veterinarian | null;
  selectedVetService: VeterinarianService | null;
  onVetChange: (vet: Veterinarian | null) => void;
  onVetServiceChange: (service: VeterinarianService) => void;
  onGeneralServiceSelect: (service: GeneralService) => void;
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

function normalizeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

type Phase = "attention_type" | "specialty" | "vet" | "service" | "general_service";

export default function StepServiceSelection({
  selectedVet,
  selectedVetService,
  onVetChange,
  onVetServiceChange,
  onGeneralServiceSelect,
  onNext,
}: StepServiceSelectionProps) {
  const {
    veterinarians,
    loadingVets,
    vetServices,
    loadingVetServices,
    generalServices,
    loadingGeneralServices,
    fetchGeneralServices,
  } = useBooking();

  const [phase, setPhase] = useState<Phase>("attention_type");
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | null>(null);

  const specialties = useMemo(() => {
    const seen = new Map<string, string>();
    veterinarians.forEach((v) => {
      const key = normalizeAccents(v.specialty);
      if (!seen.has(key)) {
        seen.set(key, v.specialty);
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "es"));
  }, [veterinarians]);

  const filteredVets = useMemo(() => {
    if (!selectedSpecialty) return veterinarians;
    const normalizedSelected = normalizeAccents(selectedSpecialty);
    return veterinarians.filter(
      (v) => normalizeAccents(v.specialty) === normalizedSelected,
    );
  }, [veterinarians, selectedSpecialty]);

  const handleAttentionType = (type: "general" | "specialist") => {
    if (type === "general") {
      fetchGeneralServices();
      setPhase("general_service");
    } else {
      setPhase("specialty");
    }
  };

  const handleSpecialtySelect = (specialty: string) => {
    setSelectedSpecialty(specialty);
    setPhase("vet");
  };

  const handleVetSelect = (vet: Veterinarian) => {
    onVetChange(vet);
    setPhase("service");
  };

  const handleBackFromService = () => {
    onVetChange(null);
    setPhase("vet");
  };

  const handleBackFromVet = () => {
    if (selectedSpecialty) {
      setPhase("specialty");
    } else {
      setPhase("attention_type");
    }
  };

  const handleBackFromSpecialty = () => {
    setSelectedSpecialty(null);
    setPhase("attention_type");
  };

  const handleBackFromGeneralService = () => {
    setPhase("attention_type");
  };

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col">
      <AnimatePresence mode="wait">
        {phase === "attention_type" && (
          <motion.div
            key="attention_type"
            animate="visible"
            className="flex min-h-0 flex-1 flex-col gap-3"
            exit="exit"
            initial="hidden"
            transition={{ duration: 0.25 }}
            variants={fadeVariants}
          >
            <div className="shrink-0 flex flex-col gap-1 pb-[15px]">
              <h2 className="text-xl font-semibold font-serif text-default-foreground">
                ¿Qué tipo de atención necesitas?
              </h2>
              <p className="text-small text-default-500">
                Elige el tipo de consulta para tu mascota
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Card
                isPressable
                shadow="none"
                className="cursor-pointer border border-default-200 p-4 transition-all hover:border-default-400"
                onPress={() => handleAttentionType("general")}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50">
                    <Icon className="text-primary" icon="solar:stethoscope-bold-duotone" width={22} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-small font-medium text-default-foreground">
                      Consulta General
                    </p>
                    <p className="text-tiny text-default-500">
                      Atención veterinaria general
                    </p>
                  </div>
                </div>
              </Card>
              <Card
                isPressable
                shadow="none"
                className="cursor-pointer border border-default-200 p-4 transition-all hover:border-default-400"
                onPress={() => handleAttentionType("specialist")}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-50">
                    <Icon className="text-secondary" icon="solar:user-check-bold-duotone" width={22} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-small font-medium text-default-foreground">
                      Especialista
                    </p>
                    <p className="text-tiny text-default-500">
                      Consulta con un especialista
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </motion.div>
        )}

        {phase === "general_service" && (
          <motion.div
            key="general_service"
            animate="visible"
            className="flex min-h-0 flex-1 flex-col gap-3"
            exit="exit"
            initial="hidden"
            transition={{ duration: 0.25 }}
            variants={fadeVariants}
          >
            <button
              className="shrink-0 flex items-center gap-1 text-small text-default-500 transition-colors hover:text-default-700"
              type="button"
              onClick={handleBackFromGeneralService}
            >
              <Icon icon="solar:arrow-left-linear" width={16} />
              Volver
            </button>
            <div className="shrink-0 flex flex-col gap-1 pb-[5px]">
              <h2 className="text-xl font-semibold font-serif text-default-foreground">
                Selecciona un Servicio
              </h2>
              <p className="text-small text-default-500">
                Servicios de atención general disponibles
              </p>
            </div>
            <div className="flex min-h-0 flex-1">
              {loadingGeneralServices ? (
                <div className="flex flex-1 items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                <ScrollShadow hideScrollBar className="w-full">
                  <div className="grid grid-cols-2 gap-3">
                    {generalServices.map((service) => (
                      <Card
                        key={service.id}
                        isPressable
                        shadow="none"
                        className="cursor-pointer border border-default-200 p-4 transition-all hover:border-default-400"
                        onPress={() => onGeneralServiceSelect(service)}
                      >
                        <div className="flex flex-col gap-2">
                          <p className="text-small font-medium text-default-foreground text-center">
                            {service.name}
                          </p>
                          <div className="flex items-center justify-center gap-2 text-tiny text-default-500">
                            <span>{service.duration_minutes} min</span>
                            {service.price > 0 && (
                              <>
                                <span>·</span>
                                <span className="font-semibold text-primary">
                                  {new Intl.NumberFormat("es-CL", {
                                    style: "currency",
                                    currency: "CLP",
                                    maximumFractionDigits: 0,
                                  }).format(service.price)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollShadow>
              )}
            </div>
          </motion.div>
        )}

        {phase === "specialty" && (
          <motion.div
            key="specialty"
            animate="visible"
            className="flex min-h-0 flex-1 flex-col gap-3"
            exit="exit"
            initial="hidden"
            transition={{ duration: 0.25 }}
            variants={fadeVariants}
          >
            <button
              className="shrink-0 flex items-center gap-1 text-small text-default-500 transition-colors hover:text-default-700"
              type="button"
              onClick={handleBackFromSpecialty}
            >
              <Icon icon="solar:arrow-left-linear" width={16} />
              Volver
            </button>
            <div className="shrink-0 flex flex-col gap-1 pb-[5px]">
              <h2 className="text-xl font-semibold font-serif text-default-foreground">
                Selecciona una Especialidad
              </h2>
              <p className="text-small text-default-500">
                Elige el área de especialización
              </p>
            </div>
            <div className="flex min-h-0 flex-1">
              {loadingVets ? (
                <div className="flex flex-1 items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                <ScrollShadow hideScrollBar className="w-full">
                  <div className="grid grid-cols-2 gap-3">
                    {specialties.map((specialty) => (
                      <Card
                        key={specialty}
                        isPressable
                        shadow="none"
                        className="shrink-0 cursor-pointer border border-default-200 p-4 transition-all hover:border-default-400"
                        onPress={() => handleSpecialtySelect(specialty)}
                      >
                        <p className="text-small font-medium text-default-foreground text-center">
                          {specialty}
                        </p>
                      </Card>
                    ))}
                  </div>
                </ScrollShadow>
              )}
            </div>
          </motion.div>
        )}

        {phase === "vet" && (
          <motion.div
            key="vet"
            animate="visible"
            className="flex min-h-0 flex-1 flex-col gap-3"
            exit="exit"
            initial="hidden"
            transition={{ duration: 0.25 }}
            variants={fadeVariants}
          >
            <button
              className="shrink-0 flex items-center gap-1 text-small text-default-500 transition-colors hover:text-default-700"
              type="button"
              onClick={handleBackFromVet}
            >
              <Icon icon="solar:arrow-left-linear" width={16} />
              Volver
            </button>
            <div className="shrink-0 flex flex-col gap-1 pb-[5px]">
              <h2 className="text-xl font-semibold font-serif text-default-foreground">
                Selecciona un Especialista
              </h2>
              <p className="text-small text-default-500">
                {selectedSpecialty
                  ? `Especialistas en ${selectedSpecialty}`
                  : "Elige al profesional que atenderá a tu mascota"}
              </p>
            </div>
            <div className="flex min-h-0 flex-1">
              {loadingVets ? (
                <div className="flex flex-1 items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                <ScrollShadow hideScrollBar className="flex w-full flex-col gap-3">
                  {filteredVets.map((vet) => (
                    <Card
                      key={vet.id}
                      isPressable
                      shadow="none"
                      className="shrink-0 flex cursor-pointer flex-row items-center gap-3 border border-default-200 p-3 transition-all hover:border-default-400"
                      onPress={() => handleVetSelect(vet)}
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
        )}

        {phase === "service" && selectedVet && (
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
              onClick={handleBackFromService}
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
              <h2 className="text-xl font-semibold font-serif text-default-foreground">
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
