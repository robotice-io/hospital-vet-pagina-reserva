import { Icon } from "@iconify/react";

export default function Page() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Icon
            className="text-primary"
            icon="solar:stethoscope-bold-duotone"
            width={32}
          />
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          Hospital Veterinario Integral
        </h1>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-lg font-medium text-default-600">
          Próximamente
        </p>
        <p className="max-w-sm text-small text-default-400">
          Estamos preparando nuestro sistema de citas en línea. Muy pronto
          podrás agendar tu cita desde aquí.
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl bg-default-100 px-4 py-3">
        <Icon
          className="text-primary"
          icon="solar:phone-bold-duotone"
          width={20}
        />
        <span className="text-small text-default-600">
          Mientras tanto, llámanos para agendar tu cita
        </span>
      </div>
    </div>
  );
}
