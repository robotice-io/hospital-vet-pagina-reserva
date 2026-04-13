"use client";

import {
  Button,
  Calendar,
  ScrollShadow,
  Skeleton,
  type DateValue,
} from "@heroui/react";
import {Icon} from "@iconify/react";
import {CalendarDate, getDayOfWeek, getLocalTimeZone, today} from "@internationalized/date";
import {motion} from "framer-motion";
import {useEffect, useMemo, useRef} from "react";
import {useBooking} from "./booking-context";
import type {TimeSlot} from "./calendar-types";
import {TimeFormatEnum} from "./calendar-types";

function formatSlotTime(time: string, format: TimeFormatEnum): string {
  const [h, m] = time.split(":");
  const hours = parseInt(h, 10);
  const mins = m;
  if (format === TimeFormatEnum.TwelveHour) {
    const period = hours >= 12 ? "pm" : "am";
    const display = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${display}:${mins} ${period}`;
  }
  return `${h}:${mins}`;
}

interface CalendarTimeSlotProps {
  slot: TimeSlot;
  timeSlots: TimeSlot[];
  isSelected: boolean;
  onTimeChange: (time: string, selectedTimeSlotRange?: TimeSlot[]) => void;
  onConfirm: () => void;
}

function CalendarTimeSlot({
  slot,
  isSelected,
  onTimeChange,
  onConfirm,
  timeSlots,
}: CalendarTimeSlotProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative flex w-full justify-end gap-2">
      <motion.div
        animate={{width: isSelected ? "calc(100% - 6.5rem)" : "100%"}}
        className="absolute left-0"
        initial={false}
      >
        <Button
          className="bg-default-100 text-default-500 w-full text-xs font-semibold leading-4"
          onPress={() => {
            const selectedTimeSlotRange: TimeSlot[] = [];
            const index = timeSlots.findIndex((s) => s.value === slot.value);

            if (index !== timeSlots.length - 1) {
              selectedTimeSlotRange.push(timeSlots[index], timeSlots[index + 1]);
            } else {
              selectedTimeSlotRange.push(timeSlots[index], timeSlots[index]);
            }
            onTimeChange(slot.value, selectedTimeSlotRange);
            confirmRef.current?.focus();
          }}
        >
          <Icon icon="solar:clock-circle-linear" width={14} className="mr-1 text-default-400" />
          {slot.label}
        </Button>
      </motion.div>
      <motion.div
        animate={{width: isSelected ? "6rem" : "0", opacity: isSelected ? 1 : 0}}
        className="overflow-hidden opacity-0"
        initial={false}
      >
        <Button
          ref={confirmRef}
          className="w-24"
          color="primary"
          tabIndex={isSelected ? undefined : -1}
          onPress={onConfirm}
        >
          Confirmar
        </Button>
      </motion.div>
    </div>
  );
}

interface CalendarTimeSelectProps {
  timeSlots: TimeSlot[];
  loading: boolean;
  isGeneralFlow: boolean;
  selectedTime: string;
  onTimeChange: (time: string, selectedTimeSlotRange?: TimeSlot[]) => void;
  onConfirm: () => void;
}

function CalendarTimeSelect({
  timeSlots,
  loading,
  isGeneralFlow,
  selectedTime,
  onTimeChange,
  onConfirm,
}: CalendarTimeSelectProps) {
  const morningSlots = timeSlots.filter((s) => parseInt(s.value.split(":")[0], 10) < 12);
  const afternoonSlots = timeSlots.filter((s) => parseInt(s.value.split(":")[0], 10) >= 12);
  const showGroups = isGeneralFlow && timeSlots.length > 3;

  const renderSlot = (slot: TimeSlot) => (
    <CalendarTimeSlot
      key={slot.value}
      isSelected={slot.value === selectedTime}
      slot={slot}
      timeSlots={timeSlots}
      onConfirm={onConfirm}
      onTimeChange={onTimeChange}
    />
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 lg:w-[240px] lg:flex-none lg:self-stretch">
      <div className="flex min-h-0 w-full flex-1">
        {loading ? (
          <div className="flex w-full flex-col gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 w-full rounded-medium" />
            ))}
          </div>
        ) : timeSlots.length === 0 ? (
          <div className="flex w-full flex-1 items-center justify-center text-small text-default-500">
            No hay horarios disponibles
          </div>
        ) : showGroups ? (
          <ScrollShadow hideScrollBar className="flex w-full flex-col gap-2">
            {morningSlots.length > 0 && (
              <>
                <p className="text-tiny text-default-400 font-medium pt-1">Mañana</p>
                {morningSlots.map(renderSlot)}
              </>
            )}
            {afternoonSlots.length > 0 && (
              <>
                <p className="text-tiny text-default-400 font-medium pt-2">Tarde</p>
                {afternoonSlots.map(renderSlot)}
              </>
            )}
          </ScrollShadow>
        ) : (
          <ScrollShadow hideScrollBar className="flex w-full flex-col gap-2">
            {timeSlots.map(renderSlot)}
          </ScrollShadow>
        )}
      </div>
    </div>
  );
}

interface StepCalendarProps {
  calendarId: string;
  vetServiceId?: string;
  serviceId?: string;
  selectedDate: DateValue;
  onDateChange: (date: DateValue) => void;
  selectedTime: string;
  onTimeChange: (time: string, selectedTimeSlotRange?: TimeSlot[]) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function StepCalendar({
  calendarId,
  vetServiceId,
  serviceId,
  selectedDate,
  onDateChange,
  selectedTime,
  onTimeChange,
  onBack,
  onNext,
}: StepCalendarProps) {
  const {availableSlots, loadingSlots, fetchSlotsFor, availableDays, blockedDates, loadingAvailability, fetchAvailabilityFor} = useBooking();
  const timeFormat = TimeFormatEnum.TwelveHour;

  useEffect(() => {
    fetchAvailabilityFor(calendarId);
  }, [calendarId, fetchAvailabilityFor]);

  // Auto-advance to the first available date when availability loads
  useEffect(() => {
    if (loadingAvailability || availableDays.length === 0) return;

    const tz = getLocalTimeZone();
    const todayDate = today(tz);
    const dayNameMap_ = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    // Check if current selectedDate is available
    const currentDow = getDayOfWeek(selectedDate, 'en-US');
    const currentDayName = dayNameMap_[currentDow];
    const currentBlocked = blockedDates.includes(selectedDate.toString());
    const currentAvailable = availableDays.includes(currentDayName) && !currentBlocked;

    if (currentAvailable) return; // Already on an available date

    // Scan up to 30 days ahead to find the first available date
    for (let i = 0; i <= 30; i++) {
      const candidate = todayDate.add({ days: i });
      const dow = getDayOfWeek(candidate, 'en-US');
      const dayName = dayNameMap_[dow];
      if (availableDays.includes(dayName) && !blockedDates.includes(candidate.toString())) {
        onDateChange(candidate);
        return;
      }
    }
  }, [loadingAvailability, availableDays, blockedDates, selectedDate, onDateChange]);

  useEffect(() => {
    const dateString = selectedDate.toString();
    fetchSlotsFor(calendarId, dateString, vetServiceId, serviceId);
  }, [selectedDate, calendarId, vetServiceId, serviceId, fetchSlotsFor]);

  const timeSlots = useMemo(() => {
    const isGeneralFlow = !vetServiceId && !!serviceId;

    let slots: TimeSlot[];

    if (isGeneralFlow) {
      // General flow: show ALL available slots chronologically
      slots = availableSlots
        .filter((slot) => slot.is_available)
        .map((slot): TimeSlot => ({
          value: slot.slot_start,
          label: formatSlotTime(slot.slot_start, timeFormat),
        }));
    } else {
      // Specialist flow: compact scheduling — only the first available slot
      const firstAvailable = availableSlots.find((slot) => slot.is_available === true);
      if (!firstAvailable) return [];
      slots = [{
        value: firstAvailable.slot_start,
        label: formatSlotTime(firstAvailable.slot_start, timeFormat),
      }];
    }

    // Filter out past slots when the selected date is today
    const tz = getLocalTimeZone();
    const todayDate = today(tz);
    if (
      selectedDate.year === todayDate.year &&
      selectedDate.month === todayDate.month &&
      selectedDate.day === todayDate.day
    ) {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      slots = slots.filter((slot) => {
        const [h, m] = slot.value.split(":");
        return parseInt(h, 10) * 60 + parseInt(m, 10) > nowMinutes;
      });
    }

    return slots;
  }, [availableSlots, timeFormat, vetServiceId, serviceId, selectedDate]);

  const dayNameMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  const isDateUnavailable = (date: DateValue) => {
    // Block all dates while availability is still loading
    if (loadingAvailability) return true;
    const dayOfWeek = getDayOfWeek(date, 'en-US');
    const dayName = dayNameMap[dayOfWeek];
    // Block days the vet doesn't work (once availability is loaded)
    if (availableDays.length > 0 && !availableDays.includes(dayName)) return true;
    // Block specific blocked dates
    if (blockedDates.includes(date.toString())) return true;
    return false;
  };

  // Show full skeleton until availability config is loaded
  if (loadingAvailability) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col gap-2">
        <button
          className="shrink-0 flex items-center gap-1 self-start text-small text-default-500 transition-colors hover:text-default-700"
          type="button"
          onClick={onBack}
        >
          <Icon icon="solar:arrow-left-linear" width={16} />
          Volver
        </button>
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
          {/* Calendar skeleton */}
          <div className="w-full shrink-0 lg:w-[380px] lg:flex-none">
            <div className="flex flex-col gap-3 p-2 lg:p-3">
              {/* Month header */}
              <div className="flex items-center justify-between pb-2">
                <Skeleton className="h-4 w-32 rounded-md" />
                <div className="flex gap-1">
                  <Skeleton className="h-6 w-6 rounded-md" />
                  <Skeleton className="h-6 w-6 rounded-md" />
                </div>
              </div>
              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <Skeleton key={`wh-${i}`} className="mx-auto h-3 w-6 rounded-sm" />
                ))}
              </div>
              {/* Day grid — 5 rows */}
              {[1, 2, 3, 4, 5].map((row) => (
                <div key={`row-${row}`} className="grid grid-cols-7 gap-1">
                  {[1, 2, 3, 4, 5, 6, 7].map((col) => (
                    <Skeleton key={`d-${row}-${col}`} className="mx-auto h-9 w-full rounded-medium" />
                  ))}
                </div>
              ))}
            </div>
          </div>
          {/* Time slot skeleton */}
          <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 lg:w-[240px] lg:flex-none lg:self-stretch">
            <div className="flex w-full flex-col gap-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-9 w-full rounded-medium" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-2">
      <button
        className="shrink-0 flex items-center gap-1 self-start text-small text-default-500 transition-colors hover:text-default-700"
        type="button"
        onClick={onBack}
      >
        <Icon icon="solar:arrow-left-linear" width={16} />
        Volver
      </button>
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
        <div className="w-full shrink-0 overflow-hidden lg:w-[380px] lg:shrink-0 lg:flex-none">
        <Calendar
          className="w-full max-w-full shadow-none dark:bg-transparent [&]:w-full"
          classNames={{
            base: "w-full max-w-full",
            headerWrapper: "bg-transparent px-2 pt-1.5 pb-3 lg:px-3",
            title: "text-default-700 text-small font-semibold",
            gridHeader: "bg-transparent shadow-none",
            gridHeaderCell: "font-medium text-default-400 text-xs p-0 w-full",
            gridHeaderRow: "px-2 pb-1.5 lg:px-3",
            gridBodyRow: "gap-x-0.5 px-2 mb-1 first:mt-2 last:mb-0 lg:gap-x-1 lg:px-3",
            gridWrapper: "pb-3 w-full max-w-full overflow-hidden",
            cell: "p-1 w-full lg:p-1.5",
            cellButton: [
              "w-full h-9 rounded-medium data-selected:shadow-[0_2px_12px_0] data-selected:shadow-primary-300 text-small",
              vetServiceId
                ? "font-semibold data-[unavailable]:font-normal"
                : "font-medium",
            ].join(" "),
            content: "w-full",
          }}
          isDateUnavailable={isDateUnavailable}
          minValue={today(getLocalTimeZone())}
          // @ts-expect-error — DateValue from @internationalized/date vs HeroUI's re-export have conflicting #private fields
          value={selectedDate}
          weekdayStyle="short"
          onChange={onDateChange}
        />
        </div>
        <CalendarTimeSelect
          isGeneralFlow={!vetServiceId && !!serviceId}
          loading={loadingSlots}
          selectedTime={selectedTime}
          timeSlots={timeSlots}
          onConfirm={onNext}
          onTimeChange={onTimeChange}
        />
      </div>
    </div>
  );
}
