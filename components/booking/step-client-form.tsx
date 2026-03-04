"use client";

import {Button, Form, Input, Link, Select, SelectItem, Textarea} from "@heroui/react";
import {useCallback, useState} from "react";

const speciesOptions = [
  {key: "Perro", label: "Perro"},
  {key: "Gato", label: "Gato"},
  {key: "Ave", label: "Ave"},
  {key: "Reptil", label: "Reptil"},
  {key: "Otro", label: "Otro"},
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
      const formData = new FormData(e.target as HTMLFormElement);
      const phone = formData.get("phone") as string;
      const name = formData.get("name") as string;
      const email = formData.get("email") as string;
      const petName = formData.get("petName") as string;
      const breed = (formData.get("breed") as string) || "";
      const notes = (formData.get("notes") as string) || "";

      onSubmit({phone, name, email, petName, species, breed, notes});
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
            label="Correo electrónico"
            labelPlacement="outside"
            name="email"
            placeholder=" "
            type="email"
          />
          <Input
            isRequired
            classNames={{label: "text-tiny text-default-600"}}
            label="Nombre de la mascota"
            labelPlacement="outside"
            name="petName"
            placeholder=" "
          />
          <Select
            isRequired
            classNames={{label: "text-tiny text-default-600"}}
            label="Especie"
            labelPlacement="outside"
            placeholder="Selecciona"
            selectedKeys={species ? [species] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0];
              setSpecies(selected ? String(selected) : "");
            }}
          >
            {speciesOptions.map((option) => (
              <SelectItem key={option.key}>{option.label}</SelectItem>
            ))}
          </Select>
          <Input
            classNames={{label: "text-tiny text-default-600"}}
            label="Raza (opcional)"
            labelPlacement="outside"
            name="breed"
            placeholder=" "
          />
          <Textarea
            classNames={{label: "text-tiny text-default-600"}}
            label="Comentarios adicionales"
            labelPlacement="outside"
            minRows={2}
            name="notes"
          />
          <p className="text-default-500 text-xs">
            Al continuar aceptas nuestros{" "}
            <Link className="text-default-800 text-xs" href="#" size="sm">
              Términos
            </Link>{" "}
            y{" "}
            <Link className="text-default-800 text-xs" href="#" size="sm">
              Política de Privacidad
            </Link>
            .
          </p>
        </div>
      </div>
      <div className="flex w-full shrink-0 justify-end gap-2 pt-3">
        <Button variant="flat" onPress={onBack}>
          Volver
        </Button>
        <Button color="primary" type="submit">
          Confirmar Cita
        </Button>
      </div>
    </Form>
  );
}
