"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Clock4, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Slider } from "@/components/ui/slider"
import { getLocalTzOffsetMin } from "@/lib/date"
import { photoTakenDateList } from "@/request/photo"
import { type PhotoTakenDateVo } from "@/server/entity/vo/photo"
import { useTranslations } from "next-intl"

interface PhotoDateDrawerProps {
  // albumId Filter time range by album when incoming.
  albumId?: string | null
  // onRangeChange Confirm the change in the time range and then pass it to the page.
  onRangeChange?: (range: { startDate: Date, endDate: Date }) => void
}

// Parse the date string returned by the interface into a local date.
function parseDate(date: string) {
  return new Date(`${date}T00:00:00`)
}

// Round the date to the last millisecond of the day, Used for end time filtering.
function toDayEnd(date: Date) {
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return end
}

// Format date into page display copy, Fixed display of year, month and day.
function formatDate(date: Date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

// Render the right drawer of the photo page to select the time range by day.
function PhotoDateDrawer({ albumId, onRangeChange }: PhotoDateDrawerProps) {
  const t = useTranslations("photos")
  const [dateList, setDateList] = useState<PhotoTakenDateVo[]>([]) // dateList Save the date and number of existing photos.
  const [open, setOpen] = useState(false) // open Control the time to choose whether the drawer is opened.
  const [savedDateRange, setSavedDateRange] = useState([0, 0]) // savedDateRange Save the last confirmed date index range.
  const [dateRange, setDateRange] = useState([0, 0]) // dateRange Save the currently selected start and end date index.
  const saveCloseRef = useRef(false) // saveCloseRef Record whether this shutdown is triggered by clicking on the mask save.

  // Query the date of existing photos based on album conditions, and initialize the slider range.
  useEffect(() => {
    photoTakenDateList({
      albumId,
      tzOffset: getLocalTzOffsetMin(),
    }).then((data) => {
      const fullRange = [0, Math.max(0, data.length - 1)]

      setDateList(data)
      setDateRange(fullRange)
      setSavedDateRange(fullRange)
    })
  }, [albumId])

  // Toggle drawer open state, Revert to the last confirmed time range when closing without saving.
  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen)

    if (nextOpen) {
      setDateRange(savedDateRange)
    } else if (!saveCloseRef.current) {
      setTimeout(() => {
        setDateRange(savedDateRange)
      }, 300)
    }

    saveCloseRef.current = false
  }

  // When the mask is clicked to close, Only call back to the page when the time range changes.
  function saveRange() {
    saveCloseRef.current = true

    if (!dateList.length ||
      (dateRange[0] === savedDateRange[0] && dateRange[1] === savedDateRange[1])) {
      return
    }

    setSavedDateRange(dateRange)
    onRangeChange?.({
      startDate: parseDate(dateList[dateRange[0]].date),
      endDate: toDayEnd(parseDate(dateList[dateRange[1]].date)),
    })
  }

  const maxDateIndex = Math.max(0, dateList.length - 1)
  const startPosition = maxDateIndex ? dateRange[0] / maxDateIndex * 100 : 0
  const endPosition = maxDateIndex ? dateRange[1] / maxDateIndex * 100 : 0
  const yearMarks = useMemo(() => {
    const marks: { year: string, position: number }[] = []

    // Dates have been sorted in ascending order, The first occurrence of each year is the starting tick of that year..
    for (const [index, item] of dateList.entries()) {
      const year = item.date.slice(0, 4)

      if (marks.at(-1)?.year !== year) {
        marks.push({
          year,
          position: maxDateIndex ? index / maxDateIndex * 100 : 0,
        })
      }
    }

    return marks.filter((mark) => mark.position > 0 && mark.position < 100)
  }, [dateList, maxDateIndex])

  return (
    <Drawer direction="right" handleOnly open={open} onOpenChange={changeOpen}>
      <DrawerTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
        >
          <Clock4 />
        </Button>
      </DrawerTrigger>
      <DrawerContent
        className="!top-12 !h-[calc(100dvh-3rem)] !w-38 md:!w-35 !rounded-none pr-9 md:pr-6 pb-8 pt-8 sm:max-w-none border-t border-border/40 shadow-xl"
        onPointerDownOutside={saveRange}
      >
        <div className="absolute top-3 left-4 text-xs font-semibold text-foreground">{t("selectDateRange")}</div>
        <DrawerClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-2.5 right-6 md:right-3"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        </DrawerClose>
        <div className="relative h-full min-h-0 w-full">
          {yearMarks.map((mark) => (
            <div
              key={mark.year}
              className="pointer-events-none absolute right-0 flex translate-y-1/2 items-center gap-1 text-xs text-muted-foreground"
              style={{ bottom: `${mark.position}%` }}
            >
              <span className="pr-2">{mark.year}</span>
              <span className="h-px w-3 bg-border" />
            </div>
          ))}
          <span
            className="absolute right-6 z-10 translate-y-1/2 whitespace-nowrap rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
            style={{ bottom: `${endPosition}%` }}
          >
            {dateList.length ? formatDate(parseDate(dateList[dateRange[1]].date)) : "-"}
          </span>
          <Slider
            className="absolute right-0 h-full"
            orientation="vertical"
            disabled={!dateList.length}
            min={0}
            max={maxDateIndex}
            step={1}
            value={dateRange}
            onValueChange={(value) => setDateRange([value[0] ?? 0, value[1] ?? maxDateIndex])}
          />
          <span
            className="absolute right-6 z-9 translate-y-1/2 whitespace-nowrap rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
            style={{ bottom: `${startPosition}%` }}
          >
            {dateList.length ? formatDate(parseDate(dateList[dateRange[0]].date)) : "-"}
          </span>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

export { PhotoDateDrawer }
