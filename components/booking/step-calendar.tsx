"use client";

import {
  Button,
  Calendar,
  ScrollShadow,
  Spinner,
  Tab,
  Tabs,
  type DateValue,
} from "@heroui/react";
import {Icon} from "@iconify/react";
import {getDayOfWeek, getLocalTimeZone, today} from "@internationalized/date";
import {format} from "date-fns";
import {es} from "date-fns/locale";
import {motion} from "framer-motion";
import {useEffect, useMemo, useRef, useState} from "react";
import {useBooking} from "./booking-context";
import type {TimeSlot} from "./calendar-types";
import {TimeFormatEnum, timeFormats} from "./calendar-types";

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
  weekday: string;
  day: number;
  timeSlots: TimeSlot[];
  loading: boolean;
  timeFormat: TimeFormatEnum;
  onTimeFormatChange: (selectedKey: React.Key) => void;
  selectedTime: string;
  onTimeChange: (time: string, selectedTimeSlotRange?: TimeSlot[]) => void;
  onConfirm: () => void;
}

function CalendarTimeSelect({
  weekday,
  day,
  timeSlots,
  loading,
  timeFormat,
  onTimeFormatChange,
  selectedTime,
  onTimeChange,
  onConfirm,
}: CalendarTimeSelectProps) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 lg:w-[240px] lg:flex-none lg:self-stretch">
      <div className="flex w-full shrink-0 justify-between py-2">
        <p className="text-small flex items-center">
          <span className="text-default-700">{weekday}</span>
          &nbsp;
          <span className="text-default-500">{day}</span>
        </p>
        <Tabs
          classNames={{
            tab: "h-6 py-0.5 px-1.5",
            tabList: "p-0.5 rounded-[7px] gap-0.5",
            cursor: "rounded-md",
          }}
          selectedKey={timeFormat}
          size="sm"
          onSelectionChange={onTimeFormatChange}
        >
          {timeFormats.map((tf) => (
            <Tab key={tf.key} title={tf.label} />
          ))}
        </Tabs>
      </div>
      <div className="flex min-h-0 w-full flex-1">
        {loading ? (
          <div className="flex w-full flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : timeSlots.length === 0 ? (
          <div className="flex w-full flex-1 items-center justify-center text-small text-default-500">
            No hay horarios disponibles
          </div>
        ) : (
          <ScrollShadow hideScrollBar className="flex w-full flex-col gap-2">
            {timeSlots.map((slot) => (
              <CalendarTimeSlot
                key={slot.value}
                isSelected={slot.value === selectedTime}
                slot={slot}
                timeSlots={timeSlots}
                onConfirm={onConfirm}
                onTimeChange={onTimeChange}
              />
            ))}
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
  const {availableSlots, loadingSlots, fetchSlotsFor, availableDays, blockedDates, fetchAvailabilityFor} = useBooking();
  const [timeFormat, setTimeFormat] = useState<TimeFormatEnum>(TimeFormatEnum.TwelveHour);

  useEffect(() => {
    fetchAvailabilityFor(calendarId);
  }, [calendarId, fetchAvailabilityFor]);

  useEffect(() => {
    const dateString = selectedDate.toString();
    fetchSlotsFor(calendarId, dateString, vetServiceId, serviceId);
  }, [selectedDate, calendarId, vetServiceId, serviceId, fetchSlotsFor]);

  const onTimeFormatChange = (selectedKey: React.Key) => {
    const timeFormatIndex = timeFormats.findIndex((tf) => tf.key === selectedKey);

    if (timeFormatIndex !== -1) {
      setTimeFormat(timeFormats[timeFormatIndex].key);
    }
  };

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
    const dayOfWeek = getDayOfWeek(date, 'en-US');
    const dayName = dayNameMap[dayOfWeek];
    // Block days the vet doesn't work (once availability is loaded)
    if (availableDays.length > 0 && !availableDays.includes(dayName)) return true;
    // Block specific blocked dates
    if (blockedDates.includes(date.toString())) return true;
    return false;
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
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
            gridHeaderRow: "px-2 pb-3 lg:px-3",
            gridBodyRow: "gap-x-0.5 px-2 mb-1 first:mt-4 last:mb-0 lg:gap-x-1 lg:px-3",
            gridWrapper: "pb-3 w-full max-w-full overflow-hidden",
            cell: "p-1 w-full lg:p-1.5",
            cellButton:
              "w-full h-9 rounded-medium data-selected:shadow-[0_2px_12px_0] data-selected:shadow-primary-300 text-small font-medium",
            content: "w-full",
          }}
          isDateUnavailable={isDateUnavailable}
          minValue={today(getLocalTimeZone())}
          value={selectedDate}
          weekdayStyle="short"
          onChange={onDateChange}
        />
        </div>
        <CalendarTimeSelect
          day={selectedDate.day}
          loading={loadingSlots}
          selectedTime={selectedTime}
          timeFormat={timeFormat}
          timeSlots={timeSlots}
          weekday={format(selectedDate.toString(), "EEE", {locale: es})}
          onConfirm={onNext}
          onTimeChange={onTimeChange}
          onTimeFormatChange={onTimeFormatChange}
        />
      </div>

      <button
        className="shrink-0 flex items-center gap-1 self-start text-small text-default-500 transition-colors hover:text-default-700"
        type="button"
        onClick={onBack}
      >
        <Icon icon="solar:arrow-left-linear" width={16} />
        Volver
      </button>
    </div>
  );
}
