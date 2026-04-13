"use client";

import { Button, Skeleton, Spinner } from "@heroui/react";
import { Icon } from "@iconify/react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { initMercadoPago, CardPayment, StatusScreen } from "@mercadopago/sdk-react";
import { motion } from "framer-motion";

import {
  createCardPaymentHold,
  processCardPayment,
  fetchAppointmentStatus,
  subscribeToAppointment,
  SlotTakenError,
  SlotExpiredError,
  MercadoPagoUnavailableError,
  upsertClientAndPatient,
  addMinutesToTime,
  normalizeTime,
  type PaymentHoldResponse,
} from "@/lib/payments";
import type { Veterinarian, VeterinarianService } from "@/lib/booking";

type PaymentState =
  | "preparing"
  | "awaiting_payment"
  | "processing"
  | "confirmed"
  | "failed"
  | "expired"
  | "slot_taken"
  | "status_screen";

interface ClientFormData {
  phone: string;
  name: string;
  email: string;
  petName: string;
  species: string;
  breed: string;
  notes: string;
  payFullPrice: boolean;
}

interface StepPaymentBrickProps {
  veterinarian: Veterinarian;
  vetService: VeterinarianService;
  date: string;
  startTime: string;
  clientData: ClientFormData;
  onConfirmed: () => void;
  onSlotTaken: () => void;
  onCancel: () => void;
}

// Default MP Brick customization — uses the standard theme so the form
// looks like a familiar, trustworthy payment experience out of the box.
const BRICK_CUSTOMIZATION = {
  visual: {
    hideFormTitle: true,
    style: {
      theme: "default" as const,
      customVariables: {},
    },
  },
  paymentMethods: {
    maxInstallments: 1,
  },
};

// Memoized CardPayment wrapper. Mercado Pago's React SDK is over-eager
// about re-running its `bricksBuilder.create()` effect whenever the parent
// re-renders, even if our props are stable. Wrapping in React.memo with a
// reference-equality check on `initialization` guarantees the brick subtree
// never re-renders after first mount, so the secure-field iframes are not
// destroyed and recreated on every interaction.
const MemoCardPayment = memo(
  function MemoCardPayment({
    initialization,
    customization,
    onSubmit,
    onReady,
    onError,
  }: {
    initialization: { amount: number; payer?: { email?: string } };
    customization: unknown;
    onSubmit: (data: Record<string, unknown>) => Promise<void>;
    onReady: () => void;
    onError: (err: unknown) => void;
  }) {
    return (
      <CardPayment
        initialization={initialization}
        customization={customization as never}
        onSubmit={onSubmit as never}
        onReady={onReady}
        onError={onError}
      />
    );
  },
  (prev, next) => prev.initialization === next.initialization,
);

function Countdown({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  onExpire: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );
  const expiredFiredRef = useRef(false);

  useEffect(() => {
    expiredFiredRef.current = false;
    const expiresMs = new Date(expiresAt).getTime();
    const tick = () => {
      const diff = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
      setSecondsLeft(diff);
      if (diff === 0 && !expiredFiredRef.current) {
        expiredFiredRef.current = true;
        onExpire();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);

  if (secondsLeft <= 0) return null;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const label = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <p className="text-tiny text-default-400">
      Tienes <span className="font-semibold">{label}</span> para completar el
      pago
    </p>
  );
}

function BrickSkeleton() {
  const Field = ({ wide = "w-24" }: { wide?: string }) => (
    <div className="flex flex-col gap-1">
      <Skeleton className={`h-2.5 ${wide} rounded-md`} />
      <Skeleton className="h-9 w-full rounded-medium" />
    </div>
  );
  return (
    <div className="flex flex-col gap-2 px-4 pt-4">
      <Field wide="w-24" />
      <div className="grid grid-cols-2 gap-2">
        <Field wide="w-16" />
        <Field wide="w-20" />
      </div>
      <Field wide="w-32" />
      <Field wide="w-24" />
      <div className="flex flex-col gap-2 pt-1">
        <Field wide="w-14" />
        <Field wide="w-20" />
        <Field wide="w-24" />
      </div>
    </div>
  );
}

function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

let mpInitialized = false;

export default function StepPaymentBrick({
  veterinarian,
  vetService,
  date,
  startTime,
  clientData,
  onConfirmed,
  onSlotTaken,
  onCancel,
}: StepPaymentBrickProps) {
  const [state, setState] = useState<PaymentState>("preparing");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hold, setHold] = useState<PaymentHoldResponse | null>(null);
  const [brickReady, setBrickReady] = useState(false);
  const [mpPaymentId, setMpPaymentId] = useState<string | null>(null);
  const didRequest = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const depositAmount = clientData.payFullPrice
    ? vetService.price
    : (vetService.deposit_amount ?? 0);

  // 0. Init MP SDK immediately — don't wait for the hold.
  //    Uses env var (available at build time) or falls back to the hold's key.
  useEffect(() => {
    if (mpInitialized) return;
    const key = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
    if (key) {
      initMercadoPago(key, { locale: "es-CL" });
      mpInitialized = true;
    }
  }, []);

  // 1. Create hold once on mount (runs in PARALLEL with brick init)
  useEffect(() => {
    if (didRequest.current) return;
    didRequest.current = true;

    (async () => {
      try {
        const upsert = await upsertClientAndPatient({
          phone: clientData.phone,
          clientName: clientData.name,
          email: clientData.email || undefined,
          patientName: clientData.petName || undefined,
          patientSpecies: clientData.species || undefined,
          patientBreed: clientData.breed || undefined,
        });

        const normalizedStart = normalizeTime(startTime);
        const endTime = addMinutesToTime(
          normalizedStart,
          vetService.duration_minutes,
        );

        const h = await createCardPaymentHold({
          clientId: upsert.client_id,
          patientId: upsert.patient_id ?? undefined,
          vetServiceId: vetService.id,
          date,
          startTime: normalizedStart,
          endTime,
          payerEmail: clientData.email || undefined,
        });

        // Fallback: if env var wasn't set, init SDK now with the hold's key
        if (!mpInitialized) {
          initMercadoPago(h.publicKey, { locale: "es-CL" });
          mpInitialized = true;
        }

        setHold(h);
        setState("awaiting_payment");
      } catch (err) {
        if (err instanceof SlotTakenError) {
          setState("slot_taken");
        } else if (err instanceof MercadoPagoUnavailableError) {
          setErrorMsg(
            "Mercado Pago no está disponible en este momento. Intenta nuevamente.",
          );
          setState("failed");
        } else {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : "No pudimos iniciar el pago. Intenta nuevamente.",
          );
          setState("failed");
        }
      }
    })();
  }, []);

  // 2. Subscribe to appointment status as soon as we have an appointmentId
  useEffect(() => {
    if (!hold?.appointmentId) return;
    const appointmentId = hold.appointmentId;

    unsubscribeRef.current = subscribeToAppointment(
      appointmentId,
      () => {
        setState("confirmed");
      },
      () => {
        setState("failed");
        setErrorMsg("La reserva fue cancelada. Intenta nuevamente.");
      },
    );

    fetchAppointmentStatus(appointmentId).then((status) => {
      if (
        status?.status === "confirmed" &&
        status.payment_status === "paid"
      ) {
        setState("confirmed");
      } else if (status?.status === "cancelled") {
        setState("failed");
      }
    });

    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [hold?.appointmentId]);

  // Countdown is rendered as an isolated component (see <Countdown />)
  // so its 1Hz re-render does not bubble up and reflow the Brick iframes.
  const handleExpire = useCallback(() => {
    setState((prev) => (prev === "awaiting_payment" ? "expired" : prev));
  }, []);

  // 3b. After confirmed, give the user time to see the status screen then redirect
  useEffect(() => {
    if (state !== "confirmed") return;
    const id = setTimeout(() => onConfirmedRef.current(), 3000);
    return () => clearTimeout(id);
  }, [state]);

  // 4. Unmount Brick on leave
  useEffect(() => {
    return () => {
      try {
        const w = window as unknown as {
          cardPaymentBrickController?: { unmount: () => void };
        };
        w.cardPaymentBrickController?.unmount();
      } catch {
        /* noop */
      }
    };
  }, []);

  const holdRef = useRef<PaymentHoldResponse | null>(null);
  useEffect(() => {
    holdRef.current = hold;
  }, [hold]);

  // Stash the latest onConfirmed in a ref so we can call it without
  // listing it as a dependency anywhere. Keeps callbacks identity-stable.
  const onConfirmedRef = useRef(onConfirmed);
  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  }, [onConfirmed]);

  const submitCardData = useCallback(
    async (formData: Record<string, unknown>) => {
      const currentHold = holdRef.current;
      if (!currentHold) return;
      setState("processing");
      try {
        const result = await processCardPayment({
          externalReference: currentHold.externalReference,
          token: formData.token as string,
          paymentMethodId: formData.payment_method_id as string,
          installments: formData.installments as number | undefined,
          issuerId: formData.issuer_id as string | number | undefined,
          payer: formData.payer as {
            email: string;
            identification?: { type: string; number: string };
          },
        });

        // Show the MP Status Screen Brick for any response with a payment ID
        // (approved, rejected, or pending). It handles all 3 states with proper UX.
        if (result.mpPaymentId) {
          setMpPaymentId(result.mpPaymentId);
          setState("status_screen");
          return;
        }

        if (result.status === "approved") {
          setState("confirmed");
          return;
        }
        if (result.status === "rejected") {
          setErrorMsg(
            result.statusDetail
              ? `Pago rechazado (${result.statusDetail}). Intenta con otra tarjeta.`
              : "Pago rechazado. Intenta con otra tarjeta.",
          );
          setState("failed");
          return;
        }
        // pending / in_process — wait for webhook via realtime
      } catch (err) {
        if (err instanceof SlotExpiredError) {
          setState("expired");
          return;
        }
        if (err instanceof MercadoPagoUnavailableError) {
          setErrorMsg(
            "Mercado Pago no está disponible en este momento. Intenta nuevamente.",
          );
          setState("failed");
          return;
        }
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "No pudimos procesar el pago. Intenta nuevamente.",
        );
        setState("failed");
      }
    },
    [],
  );

  const onBrickSubmit = useCallback(
    async (cardFormData: Record<string, unknown>) => {
      await submitCardData(cardFormData);
    },
    [submitCardData],
  );

  const onBrickReady = useCallback(() => setBrickReady(true), []);
  const onBrickError = useCallback((err: unknown) => {
    const e = err as { type?: string; cause?: string; message?: string } | null;
    if (e?.type === "non_critical") {
      // Validation / informational events (e.g. incomplete_fields).
      // The Brick already shows inline field errors; nothing for us to do.
      console.warn("MP Brick non-critical:", e.cause, e.message);
      return;
    }
    console.error("MP Brick error", err);
    setErrorMsg("Hubo un problema con el pago, intenta de nuevo.");
    setState("failed");
  }, []);

  // Amount comes from vetService props (always available), NOT from hold.
  // This lets the brick mount immediately while payments-create runs in parallel.
  const initialization = useMemo(
    () => ({
      amount: depositAmount,
      payer: { email: clientData.email || "" },
    }),
    [depositAmount, clientData.email],
  );

  if (state === "slot_taken") {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 rounded-large bg-default-50 px-8 py-10 shadow-small">
        <Icon
          className="text-warning-500"
          icon="solar:clock-circle-bold-duotone"
          width={56}
        />
        <p className="text-default-foreground text-lg font-medium font-serif text-center">
          Ese horario ya no está disponible
        </p>
        <p className="text-tiny text-default-500 text-center">
          Otra persona acaba de tomarlo. Elige otro horario.
        </p>
        <Button color="primary" onPress={onSlotTaken}>
          Elegir otro horario
        </Button>
      </div>
    );
  }

  if (state === "failed") {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 rounded-large bg-default-50 px-8 py-10 shadow-small">
        <Icon
          className="text-danger-500"
          icon="solar:close-circle-bold-duotone"
          width={56}
        />
        <p className="text-default-foreground text-lg font-medium font-serif text-center">
          Hubo un problema con el pago
        </p>
        {errorMsg && (
          <p className="text-tiny text-default-500 text-center">{errorMsg}</p>
        )}
        <div className="flex gap-2">
          <Button variant="flat" onPress={onCancel}>
            Cambiar horario
          </Button>
          <Button color="primary" onPress={() => window.location.reload()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  // awaiting_payment | processing | confirmed
  return (
    <div className="mx-auto -mb-6 -mt-[10px] flex min-h-0 w-full max-w-sm flex-1 flex-col">
    <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-large bg-white shadow-small">
      {state === "status_screen" && mpPaymentId ? (
        <div className="p-2">
          <StatusScreen
            initialization={{ paymentId: mpPaymentId }}
            onReady={() => {}}
            onError={(err: unknown) => console.error("StatusScreen error", err)}
          />
        </div>
      ) : state === "confirmed" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10">
          <Icon className="text-success-500" icon="solar:check-circle-bold" width={64} />
          <p className="text-default-foreground text-lg font-medium font-serif text-center">
            ¡Pago confirmado!
          </p>
        </div>
      ) : state === "processing" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10">
          <Spinner color="primary" size="lg" />
          <p className="text-small text-default-500">Procesando pago...</p>
        </div>
      ) : state === "expired" ? (
        <div className="flex flex-col items-center gap-4 px-6 py-10">
          <Icon
            className="text-warning-500"
            icon="solar:clock-circle-bold-duotone"
            width={56}
          />
          <p className="text-default-foreground text-lg font-medium font-serif text-center">
            El tiempo de reserva expiró
          </p>
          <p className="text-tiny text-default-500 text-center">
            Intenta nuevamente para reservar tu horario.
          </p>
          <Button color="primary" onPress={onSlotTaken}>
            Volver a intentar
          </Button>
        </div>
      ) : (
        <div className="relative min-h-[360px]">
          <div className="relative z-[60] flex items-center justify-center gap-2.5 pt-3 pb-1 bg-white">
            <Icon icon="simple-icons:mercadopago" width={22} style={{ color: "#00B1EA" }} />
            <span className="text-tiny font-medium text-default-500">Mercado Pago</span>
            <span className="h-4 w-px bg-default-200" />
            <div className="flex items-center gap-1.5">
              <Icon icon="logos:visa" width={30} />
              <Icon icon="logos:mastercard" width={22} />
              <Icon icon="logos:amex" width={22} />
            </div>
          </div>
          <div className="relative z-30 -mt-4" style={{ fontFamily: 'system-ui, sans-serif' }}>
          <MemoCardPayment
            initialization={initialization}
            customization={BRICK_CUSTOMIZATION}
            onSubmit={onBrickSubmit}
            onReady={onBrickReady}
            onError={onBrickError}
          />
          </div>
          {(!brickReady || !hold) && (
            <div className="absolute inset-x-0 top-8 bottom-0 z-[70] bg-white">
              <BrickSkeleton />
            </div>
          )}
        </div>
      )}
    </div>
    {(state === "preparing" || state === "awaiting_payment") && (
      <div className="flex items-center justify-center gap-3 pt-2 pb-[10px]">
        <span className="flex items-center gap-1 text-[10px] font-medium text-default-400">
          <Icon icon="solar:lock-keyhole-bold" width={11} className="text-success-500" />
          Cifrado SSL
        </span>
        <span className="h-2.5 w-px bg-default-200" />
        <span className="flex items-center gap-1 text-[10px] font-medium text-default-400">
          <Icon icon="solar:shield-check-bold" width={11} className="text-success-500" />
          Transacción segura
        </span>
      </div>
    )}
    </div>
  );
}
