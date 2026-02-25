"use client";

import {Button, Form, Input, Link, Select, SelectItem, Textarea} from "@heroui/react";
import {useCallback, useState} from "react";

const petTypeOptions = [
  {key: "perro", label: "Perro"},
  {key: "gato", label: "Gato"},
  {key: "ave", label: "Ave"},
  {key: "reptil", label: "Reptil"},
  {key: "otro", label: "Otro"},
];

interface StepClientFormProps {
  onBack: () => void;
  onSubmit: (data: {
    name: string;
    email: string;
    petName: string;
    petType: string;
    notes: string;
  }) => void;
}

export default function StepClientForm({onBack, onSubmit}: StepClientFormProps) {
  const [petType, setPetType] = useState<string>("");

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.target as HTMLFormElement);
      const name = formData.get("name") as string;
      const email = formData.get("email") as string;
      const petName = formData.get("petName") as string;
      const notes = (formData.get("notes") as string) || "";

      onSubmit({name, email, petName, petType, notes});
    },
    [onSubmit, petType],
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
            label="Tipo de mascota"
            labelPlacement="outside"
            placeholder="Selecciona"
            selectedKeys={petType ? [petType] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0];
              setPetType(selected ? String(selected) : "");
            }}
          >
            {petTypeOptions.map((option) => (
              <SelectItem key={option.key}>{option.label}</SelectItem>
            ))}
          </Select>
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
