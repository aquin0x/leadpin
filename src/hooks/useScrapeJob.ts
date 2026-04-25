import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import type { ScrapeJob } from "@/types"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000"

export function useScrapeJob(jobId: string | null) {
  const [job, setJob] = useState<ScrapeJob | null>(null)

  const fetchJobStatus = useCallback(async (): Promise<"ok" | "error"> => {
    if (!jobId) return "ok"
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`${API_URL}/api/scrape/${jobId}`, {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      })
      if (response.ok) {
        const data = await response.json()
        setJob(data)
        return "ok"
      }
      return "error"
    } catch {
      return "error"
    }
  }, [jobId])

  useEffect(() => {
    if (!jobId) {
      setJob(null)
      return
    }

    let failures = 0
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      if (stopped) return
      const isTerminal =
        job && (job.status === "completed" || job.status === "failed" || job.status === "stopped")
      if (!isTerminal) {
        const result = await fetchJobStatus()
        if (result === "error") {
          failures += 1
          if (failures >= 5) return
        } else {
          failures = 0
        }
      }
      timer = setTimeout(tick, 2000)
    }

    tick()

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [jobId, fetchJobStatus, job?.status])

  return { job, isFetching: false }
}
