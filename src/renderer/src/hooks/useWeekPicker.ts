import { useState, useMemo, useCallback } from 'react'

function getMonday(d: Date) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
  return new Date(date.setDate(diff))
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatLabel(startStr: string): string {
  const start = new Date(startStr)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)

  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const startFmt = start.toLocaleDateString('en-US', options)
  const endFmt = end.toLocaleDateString('en-US', options)
  const year = start.getFullYear()
  
  // If years are different, show both. If same, show at end.
  if (start.getFullYear() !== end.getFullYear()) {
      return `${startFmt}, ${start.getFullYear()} - ${endFmt}, ${end.getFullYear()}`
  }
  return `${startFmt} - ${endFmt}, ${year}`
}

export function useWeekPicker() {
  const [selectedWeek, setSelectedWeek] = useState<string>(() => {
    return formatDate(getMonday(new Date()))
  })

  const weekLabel = useMemo(() => formatLabel(selectedWeek), [selectedWeek])

  const setWeek = useCallback((dateStr: string) => {
    setSelectedWeek(dateStr)
  }, [])

  const nextWeek = useCallback(() => {
    setSelectedWeek((prev) => {
      const date = new Date(prev)
      date.setDate(date.getDate() + 7)
      return formatDate(date)
    })
  }, [])

  const prevWeek = useCallback(() => {
    setSelectedWeek((prev) => {
      const date = new Date(prev)
      date.setDate(date.getDate() - 7)
      return formatDate(date)
    })
  }, [])

  return {
    selectedWeek,
    weekLabel,
    setWeek,
    nextWeek,
    prevWeek
  }
}
