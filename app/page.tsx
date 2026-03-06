import { BookingProvider } from "@/components/booking/booking-context";
import BookingWizard from "@/components/booking/booking-wizard";
import ComingSoon from "@/components/coming-soon";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;

  if ("book" in params) {
    const vetId = typeof params.vet === "string" ? params.vet : undefined;
    const vetServiceId = typeof params.vetService === "string" ? params.vetService : undefined;

    return (
      <BookingProvider>
        <BookingWizard initialVetId={vetId} initialVetServiceId={vetServiceId} />
      </BookingProvider>
    );
  }

  return <ComingSoon />;
}
