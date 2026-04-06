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
import { initMercadoPago, CardPayment } from "@mercadopago/sdk-react";
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
  | "slot_taken";

interface ClientFormData {
  phone: string;
  name: string;
  email: string;
  petName: string;
  species: string;
  breed: string;
  notes: string;
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

// HVI brand palette (from hero.ts primary scale)
const HVI = {
  primary: "#493598",
  primaryDark: "#362871",
  primaryLight: "#745CD6",

  text: "#11181C",
  textMuted: "#71717A",
  border: "#E4E4E7",
  surface: "#FAFAFA",
  inputBg: "#FFFFFF",
};

// Single source of truth for Brick customization. The Brick's native accordion
// handles method selection + collapsing the unselected options. We hide its
// internal title row (we render our own page header) and let MP show the form
// for credit / debit / wallet on the same surface.
const HVI_BRICK_CUSTOMIZATION = {
  visual: {
    hideFormTitle: true,
    hidePaymentButton: true,
    style: {
      theme: "default" as const,
      customVariables: {
        textPrimaryColor: HVI.text,
        textSecondaryColor: HVI.textMuted,
        formBackgroundColor: HVI.surface,
        inputBackgroundColor: HVI.inputBg,
        baseColor: HVI.primary,
        baseColorFirstVariant: HVI.primaryDark,
        baseColorSecondVariant: HVI.primaryLight,
        errorColor: "#d32f2f",
        successColor: "#2e7d32",
        outlinePrimaryColor: HVI.primary,
        outlineSecondaryColor: HVI.border,
        buttonTextColor: "#FFFFFF",
        fontSizeExtraExtraSmall: "10px",
        fontSizeExtraSmall: "12px",
        fontSizeSmall: "13px",
        fontSizeMedium: "14px",
        fontSizeLarge: "16px",
        fontSizeExtraLarge: "20px",
        fontWeightNormal: "400",
        fontWeightSemiBold: "600",
        formInputsTextTransform: "none",
        // (No input padding / border overrides — they shift the iframe
        //  hit-area off the visible bounds and break touches on the
        //  narrow expiry/CVV row on mobile.)
        inputFocusedBoxShadow: "0 0 0 3px rgba(73, 53, 152, 0.18)",
        inputErrorFocusedBoxShadow: "0 0 0 3px rgba(211, 47, 47, 0.18)",
        borderRadiusSmall: "6px",
        borderRadiusMedium: "10px",
        borderRadiusLarge: "14px",
        formPadding: "16px",
      },
    },
    texts: {
      formTitle: "Pago de reserva",
      formSubmit: "Pagar reserva",
      emailSectionTitle: "Tu correo",
      installmentsSectionTitle: "Cuotas",
      paymentMethods: {
        creditCardTitle: "Tarjeta de crédito",
        debitCardTitle: "Tarjeta de débito",
      },
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
  const didRequest = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const depositAmount = hold?.amount ?? vetService.deposit_amount ?? 0;

  // 1. Create preference once on mount
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

  // 3b. After confirmed, hold the success animation for 2s then redirect
  useEffect(() => {
    if (state !== "confirmed") return;
    const id = setTimeout(() => onConfirmedRef.current(), 2000);
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
          setState("awaiting_payment"); // Brick stays mounted; user can retry
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

  const handlePayPress = useCallback(async () => {
    try {
      const w = window as unknown as {
        cardPaymentBrickController?: {
          getFormData: () => Promise<Record<string, unknown>>;
        };
      };
      const ctl = w.cardPaymentBrickController;
      if (!ctl) return;
      const cardFormData = await ctl.getFormData();
      if (!cardFormData?.token) return; // validation failed; Brick shows inline errors
      await submitCardData(cardFormData);
    } catch {
      // getFormData rejects when the form is invalid — Brick already shows inline errors
    }
  }, [submitCardData]);

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

  const initialization = useMemo(
    () =>
      hold
        ? {
            amount: depositAmount,
            payer: { email: clientData.email || "" },
          }
        : null,
    [hold, depositAmount, clientData.email],
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
    <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-sm flex-1 flex-col rounded-large bg-default-50 shadow-small">
      <div className="relative flex flex-col items-center gap-0.5 px-4 pt-3 pb-0">
        <button
          type="button"
          aria-label="Volver"
          onClick={onCancel}
          className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-default-500 hover:bg-default-100 hover:text-default-700"
        >
          <Icon icon="solar:arrow-left-linear" width={20} />
        </button>
        <p className="text-default-foreground text-2xl font-medium font-serif leading-tight">
          Pago de reserva
        </p>
        <p className="text-tiny text-default-500 text-center">
          {veterinarian.name} — {vetService.label}
        </p>
        <p className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-tiny text-default-500">Valor reserva:</span>
          <span className="text-2xl font-semibold font-serif text-primary">
            {formatCLP(depositAmount)}
          </span>
        </p>
      </div>

      {state === "confirmed" ? (
        <motion.div
          className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 16, delay: 0.05 }}
          >
            <Icon
              className="text-success-500"
              icon="solar:check-circle-bold"
              width={96}
            />
          </motion.div>
          <motion.p
            className="text-default-foreground text-2xl font-medium font-serif text-center"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.25 }}
          >
            ¡Pago confirmado!
          </motion.p>
        </motion.div>
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
        <div
          className="relative z-20"
          style={{
            // Brick inherits font-family from its container per MP docs
            fontFamily: "var(--font-sans), system-ui, sans-serif",
          }}
        >
          {initialization && (
            <MemoCardPayment
              initialization={initialization}
              customization={HVI_BRICK_CUSTOMIZATION}
              onSubmit={onBrickSubmit}
              onReady={onBrickReady}
              onError={onBrickError}
            />
          )}
          {brickReady && (
            <div className="flex items-center justify-center gap-1.5 px-4 pb-2">
              <Icon
                icon="simple-icons:mercadopago"
                width={16}
                style={{ color: "#00B1EA" }}
              />
              <span className="text-tiny font-medium text-default-400">
                Mercado Pago
              </span>
            </div>
          )}
        </div>
      )}

      {(state === "awaiting_payment" || state === "preparing") && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center gap-2 px-4 py-3">
          <Button
            className="pointer-events-auto w-full"
            color="primary"
            size="md"
            startContent={<Icon icon="solar:lock-keyhole-bold" width={16} />}
            isDisabled={!brickReady || state !== "awaiting_payment"}
            onPress={handlePayPress}
          >
            Pagar reserva
          </Button>
          {hold?.expiresAt && (
            <Countdown expiresAt={hold.expiresAt} onExpire={handleExpire} />
          )}
        </div>
      )}
    </div>
  );
}
