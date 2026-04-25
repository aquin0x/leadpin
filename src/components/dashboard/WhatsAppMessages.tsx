import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { listWhatsAppOutreach, type WhatsAppOutreachRow } from "@/lib/api-client"
import { Search, MousePointerClick, Filter, ExternalLink, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

const STATUS_COLOR: Record<string, string> = {
  sent: "text-emerald-400 bg-emerald-500/10",
  failed: "text-red-400 bg-red-500/10",
  skipped: "text-zinc-400 bg-zinc-500/10",
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return "az önce"
    if (mins < 60) return `${mins} dk önce`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs} sa önce`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days} gün önce`
    return formatDate(iso)
  } catch {
    return ""
  }
}

export function WhatsAppMessages() {
  const [search, setSearch] = useState("")
  const [onlyClicked, setOnlyClicked] = useState(false)
  const navigate = useNavigate()

  const { data, isLoading: loading } = useQuery({
    queryKey: ["whatsappOutreach", search],
    queryFn: () => listWhatsAppOutreach(search || undefined, 200),
    placeholderData: (prev) => prev,
  })

  const allRows: WhatsAppOutreachRow[] = data?.rows ?? []

  // Tıklama istatistikleri — unique işletme bazlı
  const stats = useMemo(() => {
    const uniq = new Map<string, { clicks: number }>()
    for (const r of allRows) {
      const b = r.business
      if (!b?.id) continue
      if (!uniq.has(b.id)) uniq.set(b.id, { clicks: b.short_id_clicks || 0 })
    }
    const totalBusiness = uniq.size
    let clickedBusiness = 0
    let totalClicks = 0
    for (const { clicks } of uniq.values()) {
      totalClicks += clicks
      if (clicks > 0) clickedBusiness += 1
    }
    const rate = totalBusiness > 0 ? (clickedBusiness / totalBusiness) * 100 : 0
    return { totalBusiness, clickedBusiness, totalClicks, rate }
  }, [allRows])

  const rows = onlyClicked
    ? allRows.filter((r) => (r.business?.short_id_clicks ?? 0) > 0)
    : allRows

  return (
    <div className="space-y-4">
      {/* Üst Özet */}
      {stats.totalBusiness > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/10">
              <MousePointerClick className="size-5 text-amber-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-100">
                {stats.totalClicks.toLocaleString("tr-TR")}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Toplam Tıklama
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <ExternalLink className="size-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-100">
                {stats.clickedBusiness}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Tıklayan İşletme
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/10 text-lg font-bold text-blue-400">
              %
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-100">
                %{stats.rate.toFixed(1)}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Dönüşüm Oranı
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Arama + Filtre */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="İşletme adı, telefon veya short_id ile ara..."
            className="pl-9"
          />
        </div>
        <Button
          onClick={() => setOnlyClicked((v) => !v)}
          variant="ghost"
          className={cn(
            "shrink-0 gap-2 border transition-colors",
            onlyClicked
              ? "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15"
              : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200"
          )}
        >
          <Filter className="size-4" />
          {onlyClicked ? "Sadece Tıklayanlar ✓" : "Sadece Tıklayanlar"}
        </Button>
      </div>

      {/* Tablo */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
            <tr>
              <th className="text-left px-4 py-3">İşletme</th>
              <th className="text-left px-4 py-3">Telefon</th>
              <th className="text-left px-4 py-3">Short ID</th>
              <th className="text-left px-4 py-3">Tıklama</th>
              <th className="text-left px-4 py-3">Son Tıklama</th>
              <th className="text-left px-4 py-3">Durum</th>
              <th className="text-left px-4 py-3">Tarih</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-zinc-500">
                  {onlyClicked
                    ? "Henüz tıklayan işletme yok."
                    : "Henüz gönderilmiş WhatsApp mesajı yok."}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const b = r.business
              const hasClicks = (b?.short_id_clicks ?? 0) > 0
              return (
                <tr
                  key={r.id}
                  className={cn(
                    "border-t border-zinc-800 transition-colors",
                    hasClicks
                      ? "bg-amber-500/[0.02] hover:bg-amber-500/5 border-l-2 border-l-amber-500/40"
                      : "hover:bg-zinc-800/30"
                  )}
                >
                  <td className="px-4 py-3 text-zinc-200">{b?.name || "—"}</td>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">
                    {b?.phone ? `+${b.phone}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-emerald-400 font-mono text-xs">
                    {b?.short_id || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {hasClicks && b ? (
                      <button
                        onClick={() => navigate(`/businesses/${b.id}`)}
                        className="group inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/50 transition-all cursor-pointer"
                        title={`${b.name} detayına git`}
                      >
                        <MousePointerClick className="size-3" />
                        {b.short_id_clicks}
                        <ExternalLink className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ) : (
                      <span className="text-zinc-600 text-xs">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">
                    {b?.short_id_last_click_at ? (
                      <span className="inline-flex items-center gap-1" title={formatDate(b.short_id_last_click_at)}>
                        <Clock className="size-3 text-amber-400" />
                        {timeAgo(b.short_id_last_click_at)}
                      </span>
                    ) : (
                      <span className="text-zinc-700">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 text-xs ${
                        STATUS_COLOR[r.status] || "text-zinc-400"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {formatDate(r.created_at)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
