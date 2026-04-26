import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { AlertTriangle, X, ChevronRight } from "lucide-react"
import { listExpiringLeads } from "@/lib/api-client"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "expiring-leads-banner-dismissed-at"
const DISMISS_HOURS = 24

function isDismissed(): boolean {
  try {
    const ts = Number(localStorage.getItem(STORAGE_KEY) || 0)
    if (!ts) return false
    const ageHours = (Date.now() - ts) / (3600 * 1000)
    return ageHours < DISMISS_HOURS
  } catch {
    return false
  }
}

export function ExpiringLeadsBanner() {
  const [hidden, setHidden] = useState(isDismissed())

  const { data } = useQuery({
    queryKey: ["expiring-leads"],
    queryFn: listExpiringLeads,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    enabled: !hidden,
  })

  if (hidden || !data || data.total === 0) return null

  const minDaysLeft = Math.max(
    1,
    Math.ceil(
      (new Date(data.rows[0].expires_at).getTime() - Date.now()) / (24 * 3600 * 1000)
    )
  )

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()))
    } catch {}
    setHidden(true)
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3",
        "border-amber-500/30 bg-amber-500/[0.06]"
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
        <AlertTriangle className="size-5 text-amber-400" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-amber-100">
          <span className="font-bold">{data.total}</span> lead {minDaysLeft} gün içinde otomatik silinecek
        </div>
        <div className="text-[11px] text-amber-200/70 mt-0.5">
          Listeye ekle veya mesaj gönder; aksi halde 60 günü dolan eski lead'ler depolama optimizasyonu için silinir.
        </div>
      </div>

      <a
        href="#expiring"
        className="hidden sm:flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200 shrink-0"
        title="Detayları gör"
      >
        İncele
        <ChevronRight className="size-3" />
      </a>

      <button
        onClick={handleDismiss}
        className="shrink-0 text-amber-400/60 hover:text-amber-300 p-1 -m-1"
        title="24 saat gizle"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
