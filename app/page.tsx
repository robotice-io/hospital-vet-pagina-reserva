"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Spinner } from "@heroui/react";

import { BookingProvider } from "@/components/booking/booking-context";
import BookingWizard from "@/components/booking/booking-wizard";

function BookingPage() {
  const searchParams = useSearchParams();

  const vetId = searchParams.get("vet") ?? undefined;
  const vetServiceId = searchParams.get("vetService") ?? undefined;

  return (
    <BookingProvider>
      <BookingWizard
        initialVetId={vetId}
        initialVetServiceId={vetServiceId}
      />
    </BookingProvider>
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
