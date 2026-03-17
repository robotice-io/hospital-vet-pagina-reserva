"use client";

import {Button, Card, CardBody, Form, Input} from "@heroui/react";
import {Icon} from "@iconify/react";
import {useCallback, useState} from "react";

const speciesOptions = [
  {key: "Perro", label: "Perro", icon: "solar:bone-bold-duotone"},
  {key: "Gato", label: "Gato", icon: "solar:cat-bold-duotone"},
];

interface StepClientFormProps {
  onBack: () => void;
  onSubmit: (data: {
    phone: string;
    name: string;
    email: string;
    petName: string;
    species: string;
    breed: string;
    notes: string;
  }) => void;
}

export default function StepClientForm({onBack, onSubmit}: StepClientFormProps) {
  const [species, setSpecies] = useState<string>("");

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!species) return;
      const formData = new FormData(e.target as HTMLFormElement);
      const phone = formData.get("phone") as string;
      const name = formData.get("name") as string;
      const petName = formData.get("petName") as string;

      onSubmit({phone, name, email: "", petName, species, breed: "", notes: ""});
    },
    [onSubmit, species],
  );

  return (
    <Form
      className="flex min-h-0 w-full flex-1 flex-col gap-0"
      validationBehavior="native"
      onSubmit={handleSubmit}
    >
      <div className="flex-1 w-full">
        <div className="flex max-w-md flex-col gap-4 py-2 md:mx-auto">
          <Input
            isRequired
            classNames={{label: "text-tiny text-default-600"}}
            label="Teléfono"
            labelPlacement="outside"
            name="phone"
            placeholder="+569 1234 5678"
            type="tel"
          />
          <Input
            isRequired
            classNames={{label: "text-tiny text-default-600"}}
            label="Nombre completo"
            labelPlacement="outside"
            name="name"
            placeholder=" "
          />
          <Input
            isRequired
            classNames={{label: "text-tiny text-default-600"}}
            label="Nombre de la mascota"
            labelPlacement="outside"
            name="petName"
            placeholder=" "
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-tiny text-default-600">
              Especie <span className="text-danger">*</span>
            </span>
            <div className="grid grid-cols-2 gap-2">
              {speciesOptions.map((opt) => (
                <Card
                  key={opt.key}
                  isPressable
                  shadow="none"
                  className={`transition-colors ${
                    species === opt.key
                      ? "border-2 border-primary bg-primary-50"
                      : "border border-default-200 hover:border-default-400"
                  }`}
                  onPress={() => setSpecies(opt.key)}
                >
                  <CardBody className="flex-row items-center justify-center gap-2 p-3">
                    <Icon
                      icon={opt.icon}
                      width={20}
                      className={species === opt.key ? "text-primary" : "text-default-400"}
                    />
                    <span className={`text-small font-medium ${species === opt.key ? "text-primary" : "text-default-700"}`}>
                      {opt.label}
                    </span>
                  </CardBody>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex w-full shrink-0 justify-end gap-2 pt-3">
        <Button variant="flat" onPress={onBack}>
          Volver
        </Button>
        <Button color="primary" isDisabled={!species} type="submit">
          Confirmar Cita
        </Button>
      </div>
    </Form>
  );
}
