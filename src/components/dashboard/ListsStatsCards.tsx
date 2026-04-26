import { useQuery } from "@tanstack/react-query"
import { FolderOpen, Send, Building2, MousePointerClick } from "lucide-react"
import { Card } from "@/components/ui/card"
import { api, listWhatsAppOutreach, type WhatsAppOutreachRow } from "@/lib/api-client"

interface ListRow {
  id: string
  items_count?: [{ count: number }]
  sent_count?: number
}

interface StatItem {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
  badge: string
  badgeColor: string
}

export function ListsStatsCards() {
  const { data: lists = [], isLoading: listsLoading } = useQuery({
    queryKey: ["lists"],
    queryFn: () => api.get<ListRow[]>("/api/lists"),
    staleTime: 30_000,
  })

  const { data: outreach, isLoading: outreachLoading } = useQuery({
    queryKey: ["whatsappOutreach", ""],
    queryFn: () => listWhatsAppOutreach(undefined, 500),
    placeholderData: (prev) => prev,
  })

  const isLoading = listsLoading || outreachLoading

  const totalLists = lists.length
  const messagedLists = lists.filter((l) => (l.sent_count ?? 0) > 0).length
  const totalBusinessesInLists = lists.reduce(
    (sum, l) => sum + (l.items_count?.[0]?.count || 0),
    0
  )

  // Tıklama: outreach loglarındaki unique işletmelerin clicks toplamı
  const rows: WhatsAppOutreachRow[] = outreach?.rows ?? []
  const uniqueBiz = new Map<string, number>()
  let totalClicks = 0
  for (const r of rows) {
    const b = r.business
    if (!b?.id) continue
    if (!uniqueBiz.has(b.id)) {
      const c = b.short_id_clicks || 0
      uniqueBiz.set(b.id, c)
      totalClicks += c
    }
  }

  const items: StatItem[] = [
    {
      label: "Toplam Liste",
      value: totalLists,
      icon: FolderOpen,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      badge: "ALL",
      badgeColor: "bg-blue-500/20 text-blue-300",
    },
    {
      label: "Mesaj Gönderilen",
      value: messagedLists,
      icon: Send,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      badge: "WA",
      badgeColor: "bg-emerald-500/20 text-emerald-300",
    },
    {
      label: "İşletme",
      value: totalBusinessesInLists,
      icon: Building2,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      badge: "BIZ",
      badgeColor: "bg-purple-500/20 text-purple-300",
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((s) => {
        const Icon = s.icon
        return (
          <Card
            key={s.label}
            className="group border-zinc-800 bg-zinc-900/40 p-4 backdrop-blur-sm transition-all hover:border-zinc-700 hover:bg-zinc-900/60"
          >
            <div className="flex items-start justify-between mb-2">
              <div
                className={`flex size-9 items-center justify-center rounded-lg ${s.bg} transition-transform group-hover:scale-110`}
              >
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
