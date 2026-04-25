import { useQuery } from "@tanstack/react-query"
import { Send, XCircle, MousePointerClick, Building2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { listWhatsAppOutreach, type WhatsAppOutreachRow } from "@/lib/api-client"

interface StatItem {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
  badge: string
  badgeColor: string
}

export function WhatsAppStatsCards() {
  const { data, isLoading } = useQuery({
    queryKey: ["whatsappOutreach", ""],
    queryFn: () => listWhatsAppOutreach(undefined, 500),
    placeholderData: (prev) => prev,
  })

  const rows: WhatsAppOutreachRow[] = data?.rows ?? []
  const total = data?.total ?? 0

  const sentCount = rows.filter((r) => r.status === "sent").length
  const failedCount = rows.filter((r) => r.status === "failed").length

  const uniqueBiz = new Map<string, number>()
  let totalClicks = 0
  for (const r of rows) {
    const b = r.business
    if (!b?.id) continue
    if (!uniqueBiz.has(b.id)) {
      const clicks = b.short_id_clicks || 0
      uniqueBiz.set(b.id, clicks)
      totalClicks += clicks
    }
  }

  const items: StatItem[] = [
    {
      label: "Gönderilen",
      value: total || sentCount,
      icon: Send,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      badge: "WA",
      badgeColor: "bg-emerald-500/20 text-emerald-300",
    },
    {
      label: "Başarısız",
      value: failedCount,
      icon: XCircle,
      color: "text-red-400",
      bg: "bg-red-500/10",
      badge: "ERR",
      badgeColor: "bg-red-500/20 text-red-300",
    },
    {
      label: "İşletme",
      value: uniqueBiz.size,
      icon: Building2,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      badge: "BIZ",
      badgeColor: "bg-blue-500/20 text-blue-300",
    },
    {
      label: "Tıklama",
      value: totalClicks,
      icon: MousePointerClick,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      badge: "HOT",
      badgeColor: "bg-amber-500/20 text-amber-300",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((s) => {
        const Icon = s.icon
        return (
          <Card
            key={s.label}
            className="group border-zinc-800 bg-zinc-900/40 p-4 backdrop-blur-sm transition-all hover:border-zinc-700 hover:bg-zinc-900/60"
          >
            <div className="flex items-start justify-between mb-2">
              <div className={`flex size-9 items-center justify-center rounded-lg ${s.bg} transition-transform group-hover:scale-110`}>
                <Icon className={`size-4 ${s.color}`} />
              </div>
              <span className={`text-[9px] font-bold rounded-md px-1.5 py-0.5 ${s.badgeColor}`}>
                {s.badge}
              </span>
            </div>
            <div>
              {isLoading ? (
                <div className="h-7 w-12 animate-pulse rounded bg-zinc-800" />
              ) : (
                <div className="text-2xl font-bold tracking-tight text-zinc-100">
                  {s.value.toLocaleString("tr-TR")}
                </div>
              )}
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mt-0.5">
                {s.label}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
