import { supabase } from "@/lib/supabase";

const FUNCTIONS_BASE =
  "https://rakuixxlscclchnsvuom.supabase.co/functions/v1";
const PAYMENTS_CREATE_URL = `${FUNCTIONS_BASE}/payments-create`;
const PAYMENTS_PROCESS_CARD_URL = `${FUNCTIONS_BASE}/payments-process-card`;

export interface CreatePaymentHoldInput {
  clientId: string;
  patientId?: string;
  vetServiceId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM:SS
  endTime: string; // HH:MM:SS
  payerEmail?: string;
}

export interface PaymentHoldResponse {
  flow: "card";
  publicKey: string;
  externalReference: string;
  appointmentId: string;
  paymentId: string;
  amount: number;
  expiresAt: string;
  holdMinutes: number;
}

export class SlotTakenError extends Error {
  constructor() {
    super("SLOT_TAKEN");
    this.name = "SlotTakenError";
  }
}

export class NoDepositError extends Error {
  constructor() {
    super("NO_DEPOSIT");
    this.name = "NoDepositError";
  }
}

export class MercadoPagoUnavailableError extends Error {
  constructor() {
    super("MP_UNAVAILABLE");
    this.name = "MercadoPagoUnavailableError";
  }
}

export async function createCardPaymentHold(
  input: CreatePaymentHoldInput,
): Promise<PaymentHoldResponse> {
  const res = await fetch(PAYMENTS_CREATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, flow: "card" }),
  });

  if (res.status === 409) throw new SlotTakenError();
  if (res.status === 502) throw new MercadoPagoUnavailableError();

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error ?? "";
      if (
        res.status === 400 &&
        typeof detail === "string" &&
        detail.toLowerCase().includes("does not require a deposit")
      ) {
        throw new NoDepositError();
      }
    } catch (e) {
      if (e instanceof NoDepositError) throw e;
    }
    throw new Error(detail || `payments-create failed: ${res.status}`);
  }

  return (await res.json()) as PaymentHoldResponse;
}

export interface ProcessCardPaymentInput {
  externalReference: string;
  token: string;
  paymentMethodId: string;
  installments?: number;
  issuerId?: string | number;
  payer: {
    email: string;
    identification?: { type: string; number: string };
  };
}

export interface ProcessCardPaymentResponse {
  status: "approved" | "rejected" | "in_process" | "pending" | string;
  statusDetail?: string;
  mpPaymentId?: string;
  error?: string;
}

export class SlotExpiredError extends Error {
  constructor() {
    super("SLOT_EXPIRED");
    this.name = "SlotExpiredError";
  }
}

export async function processCardPayment(
  input: ProcessCardPaymentInput,
): Promise<ProcessCardPaymentResponse> {
  const res = await fetch(PAYMENTS_PROCESS_CARD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (res.status === 502) throw new MercadoPagoUnavailableError();

  const body = (await res.json().catch(() => null)) as
    | ProcessCardPaymentResponse
    | null;

  if (body?.error === "SLOT_EXPIRED") throw new SlotExpiredError();

  if (!res.ok || !body) {
    throw new Error(body?.error || `payments-process-card failed: ${res.status}`);
  }

  return body;
}

export interface UpsertClientResult {
  client_id: string;
  patient_id: string | null;
  is_new_client: boolean;
}

export async function upsertClientAndPatient(params: {
  phone: string;
  clientName: string;
  email?: string;
  patientName?: string;
  patientSpecies?: string;
  patientBreed?: string;
}): Promise<UpsertClientResult> {
  const { data, error } = await supabase.rpc("upsert_client_and_patient", {
    p_phone: params.phone,
    p_client_name: params.clientName,
    p_email: params.email ?? null,
    p_patient_name: params.patientName ?? null,
    p_patient_species: params.patientSpecies ?? null,
    p_patient_breed: params.patientBreed ?? null,
  });
  if (error) throw new Error(error.message);
  return data as UpsertClientResult;
}

export interface AppointmentStatus {
  status: string;
  payment_status: string;
}

export function subscribeToAppointment(
  appointmentId: string,
  onConfirmed: () => void,
  onCancelled: () => void,
): () => void {
  const channel = supabase
    .channel(`appt-${appointmentId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "appointments",
        filter: `id=eq.${appointmentId}`,
      },
      (payload) => {
        const next = payload.new as AppointmentStatus;
        if (next.status === "confirmed" && next.payment_status === "paid") {
          onConfirmed();
        } else if (next.status === "cancelled") {
          onCancelled();
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function fetchAppointmentStatus(
  appointmentId: string,
): Promise<AppointmentStatus | null> {
  const { data } = await supabase
    .from("appointments")
    .select("status, payment_status")
    .eq("id", appointmentId)
    .maybeSingle();
  return (data as AppointmentStatus | null) ?? null;
}

export function addMinutesToTime(time: string, minutes: number): string {
  // time = "HH:MM" or "HH:MM:SS"
  const [h, m, s = "0"] = time.split(":");
  const totalSeconds =
    parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10) + minutes * 60;
  const hh = Math.floor(totalSeconds / 3600) % 24;
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

export function normalizeTime(time: string): string {
  // Ensure HH:MM:SS
  const parts = time.split(":");
  if (parts.length === 2) return `${time}:00`;
  return time;
}
