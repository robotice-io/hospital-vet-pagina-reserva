"use client";

import {
  Button,
  Calendar,
  ScrollShadow,
  Tab,
  Tabs,
  type DateValue,
} from "@heroui/react";
import {Icon} from "@iconify/react";
import {isWeekend} from "@internationalized/date";
import {format} from "date-fns";
import {enUS} from "date-fns/locale";
import {motion} from "framer-motion";
import {useMemo, useRef, useState} from "react";
import type {TimeSlot} from "./calendar-types";
import {
  DurationEnum,
  TimeFormatEnum,
  timeFormats,
} from "./calendar-types";

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
  duration: DurationEnum;
  selectedTime: string;
  onTimeChange: (time: string, selectedTimeSlotRange?: TimeSlot[]) => void;
  onConfirm: () => void;
}

function CalendarTimeSelect({
  weekday,
  day,
  duration,
  selectedTime,
  onTimeChange,
  onConfirm,
}: CalendarTimeSelectProps) {
  const [timeFormat, setTimeFormat] = useState<TimeFormatEnum>(TimeFormatEnum.TwelveHour);

  const onTimeFormatChange = (selectedKey: React.Key) => {
    const timeFormatIndex = timeFormats.findIndex((tf) => tf.key === selectedKey);

    if (timeFormatIndex !== -1) {
      setTimeFormat(timeFormats[timeFormatIndex].key);
      onTimeChange("");
    }
  };

  const intervalMinutes = duration === DurationEnum.ThirtyMinutes ? 30 : 60;

  const timeSlots = useMemo(() => {
    const slots: TimeSlot[] = [];
    const totalMinutesInDay = 24 * 60;

    for (let minutes = 0; minutes < totalMinutesInDay; minutes += intervalMinutes) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;

      const value = `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;

      if (timeFormat === TimeFormatEnum.TwelveHour) {
        const period = hours >= 12 ? "pm" : "am";
        const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;

        slots.push({
          value,
          label: `${displayHours}:${mins.toString().padStart(2, "0")} ${period}`,
        });
      } else {
        slots.push({
          value,
          label: value,
        });
      }
    }

    return slots;
  }, [timeFormat, intervalMinutes]);

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
      </div>
    </div>
  );
}

interface StepCalendarProps {
  selectedDate: DateValue;
  onDateChange: (date: DateValue) => void;
  selectedTime: string;
  onTimeChange: (time: string, selectedTimeSlotRange?: TimeSlot[]) => void;
  duration: DurationEnum;
  onBack: () => void;
  onNext: () => void;
}

export default function StepCalendar({
  selectedDate,
  onDateChange,
  selectedTime,
  onTimeChange,
  duration,
  onBack,
  onNext,
}: StepCalendarProps) {
  const isDateUnavailable = (date: DateValue) => {
    return isWeekend(date, "en-US");
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
          value={selectedDate}
          weekdayStyle="short"
          onChange={onDateChange}
        />
        </div>
        <CalendarTimeSelect
          day={selectedDate.day}
          duration={duration}
          selectedTime={selectedTime}
          weekday={format(selectedDate.toString(), "EEE", {locale: enUS})}
          onConfirm={onNext}
          onTimeChange={onTimeChange}
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
