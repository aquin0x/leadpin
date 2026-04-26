import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { AlertCircle, X, Sparkles, Zap, Crown } from "lucide-react"
import { getSubscriptionStatus } from "@/lib/api-client"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "limit-banner-dismissed-at"
const DISMISS_HOURS = 6

const UPGRADE_URL = "https://leadpin.com.tr/plans"

interface LimitInfo {
  label: string
  used: number
  limit: number
  pct: number
  exhausted: boolean
}

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

export function LimitWarningBanner() {
  const [hidden, setHidden] = useState(isDismissed())

  const { data: status } = useQuery({
    queryKey: ["subscription", "status"],
    queryFn: getSubscriptionStatus,
    refetchInterval: 60_000,
    enabled: !hidden,
  })

  if (hidden || !status || status.is_admin) return null

  const limits: LimitInfo[] = [
    {
      label: "tarama",
      used: status.scrape_used,
      limit: status.scrape_limit,
      pct: status.scrape_limit > 0 ? (status.scrape_used / status.scrape_limit) * 100 : 0,
      exhausted: status.scrape_used >= status.scrape_limit,
    },
    {
      label: "mesaj",
      used: status.message_used,
      limit: status.message_limit,
      pct: status.message_limit > 0 ? (status.message_used / status.message_limit) * 100 : 0,
      exhausted: status.message_used >= status.message_limit,
    },
    {
      label: "saklı lead",
      used: status.lead_count,
      limit: status.lead_storage,
      pct: status.lead_storage > 0 ? (status.lead_count / status.lead_storage) * 100 : 0,
      exhausted: status.lead_count >= status.lead_storage,
    },
  ]

  // %85 üstü warning, %100 critical
  const warning = limits.find((l) => l.pct >= 85 && !l.exhausted)
  const critical = limits.find((l) => l.exhausted)
  const triggered = critical || warning
  if (!triggered) return null

  const isCritical = !!critical
  const planMeta: Record<string, { icon: any; label: string }> = {
    free: { icon: Sparkles, label: "Ücretsiz" },
    pro: { icon: Zap, label: "Pro" },
    unlimited: { icon: Crown, label: "Sınırsız" },
  }
  const PlanIcon = planMeta[status.plan_id]?.icon ?? Sparkles

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
        isCritical
          ? "border-red-500/40 bg-red-500/[0.07]"
          : "border-amber-500/30 bg-amber-500/[0.06]"
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          isCritical ? "bg-red-500/15" : "bg-amber-500/15"
        )}
      >
        <AlertCircle className={cn("size-5", isCritical ? "text-red-400" : "text-amber-400")} />
      </div>

      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-medium", isCritical ? "text-red-100" : "text-amber-100")}>
          {isCritical ? (
            <>
              Aylık <span className="font-bold">{triggered.label}</span> kotan doldu (
              {triggered.used.toLocaleString("tr-TR")}/{triggered.limit.toLocaleString("tr-TR")})
            </>
          ) : (
            <>
              <span className="font-bold">{triggered.label}</span> kotası %{Math.round(triggered.pct)} doldu
            </>
          )}
        </div>
        <div
          className={cn(
            "text-[11px] mt-0.5",
            isCritical ? "text-red-200/70" : "text-amber-200/70"
          )}
        >
          <PlanIcon className="inline size-3 mr-1 -mt-0.5" />
          {planMeta[status.plan_id]?.label ?? status.plan_name} plan ·{" "}
          {isCritical
            ? "Yeni token gir veya bir sonraki dönemi bekle."
            : "Limit dolmadan önce planını yükselt."}
        </div>
      </div>

      <a
        href={UPGRADE_URL}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
          isCritical
            ? "bg-red-500/20 text-red-200 hover:bg-red-500/30"
            : "bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
        )}
      >
        Yükselt →
      </a>

      <button
        onClick={handleDismiss}
        className={cn(
          "shrink-0 p-1 -m-1",
          isCritical ? "text-red-400/60 hover:text-red-300" : "text-amber-400/60 hover:text-amber-300"
        )}
        title="6 saat gizle"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
