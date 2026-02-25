"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Spinner } from "@heroui/react";

import BookingWizard from "@/components/booking/booking-wizard";

function BookingPage() {
  const searchParams = useSearchParams();

  // TODO: Replace with signed URL token validation against backend
  const serviceId = searchParams.get("service") ?? undefined;
  const specialistId = searchParams.get("specialist") ?? undefined;
  const token = searchParams.get("token") ?? undefined;

  return (
    <BookingWizard
      initialServiceId={serviceId}
      initialSpecialistId={specialistId}
      token={token}
    />
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Spinner color="primary" size="lg" />
        </div>
      }
    >
      <BookingPage />
    </Suspense>
  );
}
