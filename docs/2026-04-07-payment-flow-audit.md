# Payment Flow Audit — 2026-04-07

Full audit of the HVI booking → Mercado Pago Card Payment Brick flow.
Sources: codebase (`components/booking/`, `lib/`), Supabase edge functions
(`payments-create`, `payments-process-card`, `mercadopago-webhook`,
`payments-cleanup`), Postgres schema/triggers/RLS/cron, Mercado Pago MCP
(`quality_evaluation`, `notifications_history`, `quality_checklist`), and
the live `payments` / `appointments` tables.

App-side (latest 3 real MP txns evaluated): scores **95 / 70 / 80**, current
deploy **homologation-approved** at 95 ≥ 73. The integration is healthy in
the money path; the issues below are about data integrity, fail-closed
guarantees, UX, and the few remaining MP-quality points.

Severity legend
- 🔴 **Critical** — silently corrupts data or money/security guarantee.
- 🟠 **High** — works today but one config change away from breaking, or
  meaningfully degrades UX/scoring.
- 🟡 **Medium** — hygiene, dead code, lints.
- ⚪ **Low** — nice-to-have.

---

## 🔴 S1 — 21 zombie `payments.status='pending'` rows

### What

```text
total_pending_payments              : 21
zombie_pending_with_cancelled_appt  : 21
truly_active                        : 0
pending_overdue                     : 0
```

Every row in `payments.status='pending'` has a joined `appointments.status='cancelled'`.
None of them have an `mp_payment_id` (the user opened the brick but never
submitted, or submission failed before reaching MP). They will sit in
`pending` forever because no code path will ever transition them.

### Where

- `public.evict_expired_holds_for_slot()` (PG trigger function) — fires `BEFORE INSERT` on `appointments`
- `supabase/functions/payments-cleanup/index.ts` — the per-minute cron that *should* be a safety net

### Root cause A — Eviction trigger leaks

`evict_expired_holds_for_slot` runs when a new hold is being inserted. It
cancels any *prior* expired pending hold that overlaps the new slot:

```sql
UPDATE appointments
SET status = 'cancelled',
    payment_status = 'failed',
    cancellation_reason = COALESCE(cancellation_reason,
                                   'Hold expirado, slot liberado por nuevo intento')
WHERE calendar_id = NEW.calendar_id
  AND appointment_date = NEW.appointment_date
  AND start_time < NEW.end_time
  AND end_time > NEW.start_time
  AND status = 'pending'
  AND payment_status = 'pending'
  AND payment_expires_at IS NOT NULL
  AND payment_expires_at < now();
```

It only touches `appointments`. The joined `payments` row is left untouched.
The cleanup cron then can't find it because its query filters by
`appointments.status='pending'`:

```ts
.eq("status", "pending")
.eq("payment_status", "pending")
.lt("payment_expires_at", nowIso)
```

Confirmed by 2 of 21 zombies whose `cancellation_reason` matches the
trigger's exact message:

| payment_id    | external_reference                     | appt_status | cancellation_reason                                  |
|---------------|----------------------------------------|-------------|------------------------------------------------------|
| 55f376aa-…    | a911b987-d797-49a7-91c2-ffd88c664b20   | cancelled   | Hold expirado, slot liberado por nuevo intento       |
| a878afe3-…    | 29324350-c91a-431a-97d3-cca97810ec95   | cancelled   | Hold expirado, slot liberado por nuevo intento       |

### Root cause B — Manual operator drain

The remaining 19 rows have
`cancellation_reason='Drenaje manual: cleanup cron estaba caído'`. Someone
hand-cancelled appointments while the cron was down, again without touching
the `payments` rows. Same orphan shape.

### Real-world impact

- No money lost (all 21 have `mp_payment_id IS NULL`).
- Reporting on `payments.status` is wrong (21 false positives in pending).
- Dashboards / "retry pending" operator scripts will misbehave.
- Easy to fix.

### Fix A — Patch the trigger (preferred, atomic)

```sql
CREATE OR REPLACE FUNCTION public.evict_expired_holds_for_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_evicted_ids uuid[];
BEGIN
  IF NEW.status NOT IN ('pending', 'confirmed') THEN
    RETURN NEW;
  END IF;

  -- 1. Cancel the appointments AND capture which ones we touched
  WITH evicted AS (
    UPDATE appointments
    SET status = 'cancelled',
        payment_status = 'failed',
        cancellation_reason = COALESCE(
          cancellation_reason,
          'Hold expirado, slot liberado por nuevo intento'
        )
    WHERE calendar_id = NEW.calendar_id
      AND appointment_date = NEW.appointment_date
      AND start_time < NEW.end_time
      AND end_time > NEW.start_time
      AND status = 'pending'
      AND payment_status = 'pending'
      AND payment_expires_at IS NOT NULL
      AND payment_expires_at < now()
    RETURNING id
  )
  SELECT array_agg(id) INTO v_evicted_ids FROM evicted;

  -- 2. Expire the joined payment rows in the same statement chain
  IF v_evicted_ids IS NOT NULL THEN
    UPDATE payments
    SET status = 'expired',
        updated_at = now()
    WHERE appointment_id = ANY(v_evicted_ids)
      AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;
```

### Fix B — Defensive widening of cleanup cron (also recommended)

In `supabase/functions/payments-cleanup/index.ts`, after the existing
appointment-driven loop, add a second sweep for orphan payments. This also
catches Root Cause B and any future code path that forgets to update the
payment row.

```ts
// Second sweep: payments still pending whose appointment is already terminal.
// This catches: trigger eviction races, manual drains, future code paths
// that forget to flip the payment row.
const { data: orphans, error: orphanErr } = await db
  .from("payments")
  .select("id, appointment_id, external_reference, appointments(status)")
  .eq("status", "pending")
  .not("appointment_id", "is", null)
  .limit(50);

if (!orphanErr && orphans) {
  for (const p of orphans) {
    // deno-lint-ignore no-explicit-any
    const a = (p as any).appointments;
    if (!a || a.status === "cancelled") {
      // Poll MP one more time before declaring expired (covers the race
      // where the user paid right before the trigger fired).
      const mpStatus = await pollMpByExternalReference(p.external_reference);
      const newStatus = mpStatus === "approved" ? "approved" : "expired";
      await db.from("payments")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", p.id)
        .eq("status", "pending");
    }
  }
}
```

### Fix C — One-shot backfill for the existing 21 rows

```sql
-- Run ONCE after deploying Fix A. Idempotent.
UPDATE payments p
SET status = 'expired', updated_at = now()
FROM appointments a
WHERE a.id = p.appointment_id
  AND p.status = 'pending'
  AND a.status = 'cancelled'
  AND p.mp_payment_id IS NULL;
```

### Verification

After applying:
```sql
SELECT count(*) FROM payments p
JOIN appointments a ON a.id = p.appointment_id
WHERE p.status = 'pending' AND a.status = 'cancelled';
-- expect: 0
```

---

## 🟠 S2 — Webhook signature verifier is fail-open by default

### Where

`supabase/functions/_shared/mercadopago.ts:251-254` (also bundled inside
each edge function's local copy of `_shared/mercadopago.ts`):

```ts
export async function verifyWebhookSignature(input: WebhookSignatureInput): Promise<boolean> {
  const { webhookSecret } = await getMpConfig();
  if (!webhookSecret) {
    // Secret not configured yet — fail closed in production, allow in dev
    console.warn("MP_WEBHOOK_SECRET not set; skipping signature verification");
    return true;   // ← fail-open
  }
  ...
}
```

### Status of the secret today

Verified via vault:
```
mp_access_token   : true
mp_public_key     : true
mp_webhook_secret : true
```

So the fail-open path is currently inert. But the comment lies: it does
**not** fail closed in production. The branch is unconditional.

### Risk

- If the vault entry is rotated to empty / removed / `get_secret` errors
  out, every webhook will be accepted with no signature check.
- A misconfigured staging deploy that shares the same code will accept any
  forged webhook.
- This contradicts the file's own header comment ("MP sends header
  `x-signature`… HMAC-SHA256… constant-time-ish compare").

### Fix

```ts
if (!webhookSecret) {
  console.error("MP_WEBHOOK_SECRET missing — refusing webhook (fail-closed)");
  return false;
}
```

Then re-deploy `mercadopago-webhook` (the bundled copy of
`_shared/mercadopago.ts` is what actually runs).

---

## 🟠 F1 — Payer payload to MP is incomplete (drops phone, never collects email/last name)

### Where

- `components/booking/step-client-form.tsx:7-40`
- `components/booking/step-payment-brick.tsx:392-449`

### What

The booking client form only collects:
```ts
{ phone, name, petName, species }
```

`email`, `breed`, `notes` are hard-coded `""` at submit (line 37):
```ts
onSubmit({phone, name, email: "", petName, species, breed: "", notes: ""});
```

That has two cascading consequences:

1. **`clients.email` is never written from this flow.**
   `upsertClientAndPatient` calls `upsert_client_and_patient(p_email := null)`
   so the DB never persists the booker's email. Only the brick's own email
   field captures it, and that data lives only inside MP.

2. **Brick `initialization.payer.email` is always `""`.**
   `step-payment-brick.tsx:489-498`:
   ```ts
   const initialization = useMemo(
     () => hold ? { amount: depositAmount, payer: { email: clientData.email || "" } } : null,
     [hold, depositAmount, clientData.email],
   );
   ```
   The user has to type their email *again* inside the brick. Friction.

3. **`payer.phone` is never sent to MP**, even though we have it in
   `clientData.phone`. The submit handler in `step-payment-brick.tsx:398-408`
   only forwards what the brick gave us:
   ```ts
   await processCardPayment({
     externalReference: currentHold.externalReference,
     token: formData.token as string,
     paymentMethodId: formData.payment_method_id as string,
     installments: formData.installments as number | undefined,
     issuerId: formData.issuer_id as string | number | undefined,
     payer: formData.payer as { email: string; identification?: ... },
   });
   ```

4. **`payer.first_name` / `payer.last_name`** today come from whatever the
   user types as cardholder name. In test data both fields landed as
   `"jose"`/`"jose"`. MP scoring is fine because *something* is there, but
   for fraud-prevention these should be the actual booker's name, not the
   cardholder.

### Quality-checklist impact (last 3 MP txns)

| id | check                | status today | weight | gain after fix |
|----|----------------------|--------------|--------|----------------|
| 65 | payer.phone          | ❌ empty     | 0      | fraud rate ↓   |
| 59 | payer.address        | ❌ empty     | 0      | fraud rate ↓   |
| 62 | payer.first_name     | ⚠️ proxy     | 3      | accuracy       |
| 64 | payer.last_name      | ⚠️ proxy     | 3      | accuracy       |
| 61 | payer.email          | ✅ brick     | 4      | (already)      |

Phone has weight 0 in the score but is in the **isNecessary** set, which
means MP's fraud engine penalizes its absence at decision time even though
homologation doesn't.

### Fix

#### 1. Add real fields to the form (`step-client-form.tsx`)

```tsx
<Input isRequired name="email" type="email" label="Correo electrónico" labelPlacement="outside" />
<Input isRequired name="lastName" label="Apellido" labelPlacement="outside" />
```

And update the submit:
```ts
const email = formData.get("email") as string;
const lastName = formData.get("lastName") as string;
onSubmit({ phone, name, lastName, email, petName, species, breed: "", notes: "" });
```

Plumb `lastName` through `ClientFormData` everywhere it's referenced
(`booking-wizard.tsx`, `step-payment-brick.tsx`, `step-confirmation.tsx`).

#### 2. Persist email to DB

`step-payment-brick.tsx:268-275` already passes `email: clientData.email || undefined`
— it will start working as soon as the form actually collects it.

#### 3. Pre-fill the brick's email field

`step-payment-brick.tsx:494` already does this — once `clientData.email` is
non-empty, the brick will auto-populate.

#### 4. Forward `payer.phone` and the real first/last name to MP

`step-payment-brick.tsx:398-408` becomes:

```ts
const result = await processCardPayment({
  externalReference: currentHold.externalReference,
  token: formData.token as string,
  paymentMethodId: formData.payment_method_id as string,
  installments: formData.installments as number | undefined,
  issuerId: formData.issuer_id as string | number | undefined,
  payer: {
    ...(formData.payer as Record<string, unknown>),
    email: clientData.email || (formData.payer as { email?: string }).email || "",
    first_name: clientData.name,
    last_name: clientData.lastName,
    phone: {
      area_code: "",
      number: clientData.phone.replace(/\D/g, ""),
    },
  } as never,
});
```

And on the backend, extend the `payer` interface in
`payments-process-card/index.ts:30-36` to allow `phone` and forward it to
MP in `_shared/mercadopago.ts:200-218` (`createPayment.body.payer`).

---

## 🟠 F4 — 8-minute countdown is defined but never rendered (UX bug)

### Where

`components/booking/step-payment-brick.tsx`

- `Countdown` component defined at **line 166–205**
- `handleExpire` callback defined at **line 355-357**
- **Neither is referenced in JSX anywhere in the file** (verified via
  grep).

### Effect

Users get an 8-minute hold on the slot but **see no timer**. They have no
idea how long they have to enter card details. Failure modes:

- They abandon the page assuming there's no time pressure → cleanup cron
  cancels their slot silently.
- They notice the form stops working but get no explanation → drop-off.
- The "El tiempo de reserva expiró" screen (`step-payment-brick.tsx:608-624`)
  fires from the realtime cancel event, not from a local timer, so the
  user only finds out after the cron has already cancelled them.

This is the most likely contributor to the **19 of 21 zombie payments**
showing 8+ minutes between hold creation and the 'expired' state.

### Fix

Render `<Countdown>` inside the awaiting_payment block. Wire `handleExpire`
to optimistically transition state when local clock hits 0:00 (the realtime
event still arrives later as authoritative).

`step-payment-brick.tsx` ~line 565 (just under the header row, above the
brick host):

```tsx
{hold?.expiresAt && (state === "awaiting_payment" || state === "preparing") && (
  <div className="px-3 pb-1">
    <Countdown expiresAt={hold.expiresAt} onExpire={handleExpire} />
  </div>
)}
```

`handleExpire` already does the right thing:
```ts
const handleExpire = useCallback(() => {
  setState((prev) => (prev === "awaiting_payment" ? "expired" : prev));
}, []);
```

---

## 🟠 F3 — Anon RLS on `appointments` is over-permissive

### Where

```sql
SELECT * FROM pg_policies WHERE tablename='appointments';
```

Returns:

| policyname                          | cmd    | roles    | qual                                |
|-------------------------------------|--------|----------|-------------------------------------|
| Anon can read appointment by id     | SELECT | {anon}   | `true`                              |
| Service role full access on appointments | ALL    | {public} | `(auth.role() = 'service_role')`    |
| Service role full access to appointments | ALL    | {public} | `(auth.role() = 'service_role')`    |

### Effect

`qual = true` means the anon role can `SELECT *` from the entire
appointments table — any column, any row — as long as the call goes through
PostgREST or the realtime channel. The "by id" in the policy name is just a
convention enforced client-side, not by the policy.

This is what powers the realtime subscription in
`lib/payments.ts:164-193`, but it leaks PII (client phones via FK,
appointment dates, vet assignments) to anyone who cares to query.

### Fix

Either:

1. **Narrow the policy** to non-PII columns + require an id filter:
   ```sql
   DROP POLICY "Anon can read appointment by id" ON appointments;

   CREATE POLICY "Anon can read appointment status by id"
     ON appointments
     FOR SELECT
     TO anon
     USING (true);  -- still permissive at row level

   -- but only expose status columns via a view:
   CREATE VIEW public.appointment_status_v AS
     SELECT id, status, payment_status FROM appointments;

   GRANT SELECT ON public.appointment_status_v TO anon;
   REVOKE SELECT ON public.appointments FROM anon;
   ```
   Then change `lib/payments.ts:fetchAppointmentStatus` and
   `subscribeToAppointment` to read from the view. Realtime still works on
   the underlying table for service-role-broadcasted changes.

2. **Or**: keep the table access but use a `SECURITY DEFINER` function
   that takes the appointment id and returns only status fields. The
   trade-off is losing realtime; you'd need to poll.

Given realtime is a load-bearing UX piece (the brick depends on it for
confirmation), option 1 (view) is the right call.

---

## 🟡 S3 — `payments-create.preference` flow is dead code

### Where

`supabase/functions/payments-create/index.ts:35-39` declares the optional
`flow` field, and lines **148–187** implement the entire `preference` /
Checkout-Pro / Wallet Brick path:

```ts
flow?: "preference" | "card";
...
// 5. Preference flow: create MP preference for Payment/Wallet Brick
let preference;
try {
  preference = await createPreference({...});
} catch (e) {
  await db.from("payments").delete().eq("id", payment.id);
  await db.from("appointments").delete().eq("id", appt.id);
  ...
}
```

### What's actually used

Frontend only ever sends `flow:"card"` (`lib/payments.ts:56`). The
`preference` branch has zero callers in the codebase.

### Effect

- 60+ LoC of unmaintained code that drifts out of sync with the card path
  on every change.
- Future maintainer reads it and assumes both flows are live.
- The `createPreference` helper in `_shared/mercadopago.ts:48-117` is also
  dead by extension.

### Fix

Either:

1. **Delete** the `preference` branch + `createPreference` helper. Remove
   the `flow?` field from `CreatePaymentBody`. ~80 LoC down.

2. **Document** at the top of the file: "WhatsApp/wallet flow — invoked
   by Milo bot via direct HTTP, no frontend caller." (And confirm that's
   actually true by grepping the WhatsApp bot repo.)

I recommend option 1 unless the WhatsApp bot really is calling
`payments-create` with `flow:"preference"` — verifiable with `mp.notifications_history`
filtered by source.

---

## 🟡 S4 — Duplicate service-role policy on `appointments`

### Where

`pg_policies` shows two near-identical rows for the same table:

| policyname                                | with_check                     |
|-------------------------------------------|--------------------------------|
| Service role full access on appointments  | `(auth.role() = 'service_role')` |
| Service role full access to appointments  | `null`                         |

Same `qual`, same role, same `cmd=ALL`. The only difference is one has a
`with_check` and one doesn't.

### Fix

```sql
DROP POLICY "Service role full access to appointments" ON appointments;
```

Keep the one that has `with_check` set (it enforces the same condition on
both reads and writes).

---

## 🟡 S5 — `function_search_path_mutable` lints

### Where

Reported by `mcp__supabase__get_advisors`:

- `public.check_waitlist_adjacency`
- `public.notify_web_appointment`

Both are missing `SET search_path TO 'public'`. The other trigger functions
(`enforce_slot_availability`, `evict_expired_holds_for_slot`,
`upsert_client_and_patient`) already have it set.

### Why it matters

Without a fixed `search_path`, a `SECURITY DEFINER` function can be tricked
into resolving objects from a malicious schema if a user with `CREATE`
privilege on `public` (or `pg_temp`) drops a same-named function/table in
their own schema and prefixes the search_path. Low risk but the linter is
right.

### Fix

```sql
ALTER FUNCTION public.check_waitlist_adjacency() SET search_path = 'public';
ALTER FUNCTION public.notify_web_appointment()  SET search_path = 'public';
```

(Or include `SET search_path = 'public'` inside each `CREATE OR REPLACE
FUNCTION` next time they're edited.)

---

## 🟡 S6 — Production deposit amounts are still set to CLP $1

### Where

```sql
SELECT id, label, deposit_amount
FROM veterinarian_services
WHERE deposit_amount IS NOT NULL;
```

All 34 rows return `deposit_amount = 1`. This is the test value.

### Effect

The integration is in test mode for charges. Won't affect quality scoring
(MP doesn't grade amounts), but **must be set** before launch — otherwise
HVI will charge real customers CLP $1 deposits.

### Fix

Single migration with the production matrix, e.g.:

```sql
UPDATE veterinarian_services SET deposit_amount = 10000 WHERE label LIKE 'Consulta %';
UPDATE veterinarian_services SET deposit_amount = 5000  WHERE label LIKE 'Control %';
UPDATE veterinarian_services SET deposit_amount = 15000 WHERE label LIKE 'Quimioterapia%';
```

(Exact values to be confirmed with HVI billing.)

---

## 🟡 S7 — MP Backend SDK warning (only remaining quality gap, score 95 → 100)

### Where

`supabase/functions/_shared/mercadopago.ts` — entire file uses raw `fetch`
calls instead of the official `mercadopago` Node SDK.

### Effect on quality_evaluation

```
Improvement id 81 — Backend SDK
  weight       : 5
  isMandatory  : false
  isNecessary  : true
  status       : warning
```

This is the only thing keeping us off score 100. It's also the only
remaining `warning` in any block on the latest payment (153561222276).

### Fix

Replace the raw fetch helpers with the official SDK. Vault loading via
`getMpConfig()` stays the same.

```ts
// _shared/mercadopago.ts
import MercadoPago, { Payment, Preference } from "npm:mercadopago@2";

export async function createPreference(input: CreatePreferenceInput) {
  const { accessToken } = await getMpConfig();
  const client = new MercadoPago({ accessToken });
  return await new Preference(client).create({ body: { ... } });
}

export async function createPayment(input: CreatePaymentInput) {
  const { accessToken } = await getMpConfig();
  const client = new MercadoPago({ accessToken, options: { timeout: 5000 } });
  return await new Payment(client).create({
    body: { ... },
    requestOptions: { idempotencyKey: input.idempotencyKey },
  });
}
```

The webhook signature verification still has to be hand-rolled (the SDK
doesn't expose it cleanly), but `createPreference` / `createPayment` /
`getPayment` / `pollMpByExternalReference` all map cleanly.

---

## 🟡 F2 — Dead `handleExpire` callback (subset of F4)

`step-payment-brick.tsx:355-357` defines `handleExpire` but it has no
caller. Resolved by F4 — once `<Countdown onExpire={handleExpire} />` is
wired in, this is no longer dead.

---

## ⚪ Hardcoded edge function URLs

`lib/payments.ts:3-6`:
```ts
const FUNCTIONS_BASE = "https://rakuixxlscclchnsvuom.supabase.co/functions/v1";
```

This is fine in single-environment deployments, but if you ever stand up a
staging Supabase project this will silently call production. Move to
`process.env.NEXT_PUBLIC_SUPABASE_URL + "/functions/v1"` (the URL is
already in `lib/supabase.ts:3`).

---

## ⚪ `BookingResult.is_new_client` is wired but never surfaced

`lib/booking.ts:78` returns it from `book_appointment`, the brick's
`upsertClientAndPatient` returns the same flag, but neither code path uses
it. Could power a "Welcome to HVI 🐾" banner for first-time clients on the
confirmation step, or be deleted.

---

## Things that are correct (do NOT touch)

These were verified during the audit and are working as intended:

| Component                                | Status                            |
|------------------------------------------|-----------------------------------|
| `appointments_no_overlap` exclusion idx  | ✅ Atomic, gist-indexed            |
| `enforce_slot_availability` trigger      | ✅ Maps to SQLSTATE 23P01          |
| `payments-create` slot hold + rollback   | ✅ Deletes both rows on MP failure |
| `X-Idempotency-Key = payments.id`        | ✅ MP retries don't double-charge  |
| `binary_mode: true` everywhere           | ✅ No `in_process` limbo           |
| Server-trusts-DB amount in process-card  | ✅ Ignores client `amount`         |
| Webhook HMAC compare (constant-time-ish) | ✅ Algorithm matches MP docs       |
| Webhook 503 only on transient errors     | ✅ MP doesn't retry permanent fail |
| Realtime subscription + polling fallback | ✅ Race-safe                       |
| Brick `MemoCardPayment` ref-equal memo   | ✅ Iframes never remount           |
| `transform: none` post-slide-in workaround | ✅ Mobile WebKit touch fix       |
| `additional_info.items` block on payment | ✅ Lifts MP score from 80 to 95    |
| `statement_descriptor: "HVI VETERINARIA"` | ✅ Quality id 107 ✓              |
| `payments-cleanup` cron schedule + health | ✅ Active, 100% success           |
| Vault: MP_ACCESS_TOKEN / PUBLIC_KEY / WEBHOOK_SECRET | ✅ All present         |
| MP webhook delivery (last 4) | ✅ 4/4 success, avg 713 ms                |
| MP homologation (latest payment 153561222276) | ✅ Score 95 ≥ 73 minScore     |
| All mandatory checklist items            | ✅ 7/7 complete                    |

---

## Last 3 real MP transactions — quality detail

| # | mp_payment_id | DB status | created (UTC)        | quality | homolog | notes                                              |
|---|---------------|-----------|----------------------|---------|---------|----------------------------------------------------|
| 1 | 153561222276  | rejected  | 2026-04-06 22:48:54  | **95**  | ✅ pass | Latest deploy. Only `id 81 Backend SDK` warning.   |
| 2 | 152801228613  | rejected  | 2026-04-06 21:05:28  | **70**  | ❌ fail | Pre-deploy. No statement_descriptor, no items.     |
| 3 | 153520895004  | approved  | 2026-04-06 18:35:36  | **80**  | ✅ pass | Pre-deploy. Default MP statement, no items.        |

Score deltas:
- 70 → 80: gained `statement_descriptor` (any value, weight 10)
- 80 → 95: gained `additional_info.items.{id,title,description,category_id,quantity,unit_price}` (weights 3+2+3+2+3+2 = 15)
- 95 → 100: closing the Backend SDK warning (S7) is the only remaining gap

`mp.notifications_history`: 4/4 successful, avg 713 ms, HTTP 200.

---

## Aggregate integrity check (good)

| Anomaly query                                         | Count |
|-------------------------------------------------------|-------|
| `payment.approved` + `appointment.cancelled` (orphan) | 0     |
| `appointment.pending` + `payment_expires_at < now()`  | 0     |
| `payment.approved` + `appointment.pending`            | 0     |
| `payment.expired` + `appointment.confirmed/pending`   | 0     |
| **Zombie pending payments (S1)**                      | **21**|

---

## Suggested order of operations

1. **S1 Fix A + B + C** — patch the trigger, widen cleanup cron, run the
   backfill SQL. Verify with the integrity check at the bottom of S1.
2. **F4** — wire `<Countdown>` so users can see the timer.
3. **S2** — change `verifyWebhookSignature` to fail-closed.
4. **F1** — add email + lastName to the form, plumb everywhere, forward
   `payer.phone` to MP.
5. **F3** — narrow anon RLS via a status view.
6. **S3** — delete or document the dead `preference` flow.
7. **S4** — drop the duplicate RLS policy.
8. **S5** — pin `search_path` on the two flagged functions.
9. **S6** — set production deposit amounts (this is the launch gate).
10. **S7** — migrate edge functions to MP Node SDK to push score to 100.

S1, F4, and S6 are blockers for going live. S2 and F3 are blockers for
going public-traffic-volume. The rest are quality/hygiene polish.
