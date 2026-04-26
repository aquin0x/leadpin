import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { listWhatsAppOutreachGrouped } from "@/lib/api-client"
import {
  History,
  Loader2,
  CheckCircle2,
  XCircle,
  MinusCircle,
  MousePointerClick,
  Megaphone,
  FolderOpen,
} from "lucide-react"
import { format } from "date-fns"
import { tr } from "date-fns/locale"
import { cn } from "@/lib/utils"

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "sent":
      return <CheckCircle2 className="size-3.5 text-emerald-500" />
    case "failed":
      return <XCircle className="size-3.5 text-red-500" />
    case "skipped":
      return <MinusCircle className="size-3.5 text-zinc-500" />
    default:
      return <CheckCircle2 className="size-3.5 text-zinc-500" />
  }
}

export function WhatsAppHistorySidebar() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ["whatsappOutreach", "sidebar-grouped"],
    queryFn: () => listWhatsAppOutreachGrouped(50),
    refetchInterval: 8000,
  })

  const rows = data?.rows ?? []

  if (isLoading) {
    return (
      <div className="flex w-full items-center justify-center rounded-2xl border border-zinc-800/50 bg-zinc-900/40 p-8 backdrop-blur-sm">
        <Loader2 className="size-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-4 rounded-2xl border border-zinc-800/50 bg-zinc-900/40 p-5 backdrop-blur-sm">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-300 uppercase tracking-wider">
        <History className="size-4 text-zinc-500" />
        Mesaj Geçmişi
      </h3>

      <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {rows.length === 0 ? (
          <p className="text-center text-xs text-zinc-500 py-4">
            Henüz mesaj gönderilmedi.
          </p>
        ) : (
          rows.map((row) => {
            if (row.kind === "batch") {
              const pct =
                row.total > 0 ? Math.round((row.sent / row.total) * 100) : 0
              return (
                <div
                  key={row.batch_id}
                  className="group flex flex-col gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Megaphone className="size-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate text-sm font-medium text-zinc-200">
                        Toplu Gönderim
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {row.totalClicks > 0 && (
                        <span
                          className="flex items-center gap-0.5 text-[10px] font-medium text-cyan-400"
                          title={`${row.totalClicks} tıklama`}
                        >
                          <MousePointerClick className="size-3" />
                          {row.totalClicks}
                        </span>
                      )}
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                        {row.total}
                      </span>
                    </div>
                  </div>

                  {row.list_name && (
                    <div className="flex items-center gap-1 text-[11px] text-zinc-400 truncate">
                      <FolderOpen className="size-3 shrink-0" />
                      <span className="truncate">{row.list_name}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="size-3" />
                      {row.sent}
                    </span>
                    {row.failed > 0 && (
                      <span className="flex items-center gap-1 text-red-400">
                        <XCircle className="size-3" />
                        {row.failed}
                      </span>
                    )}
                    {row.skipped > 0 && (
                      <span className="flex items-center gap-1 text-zinc-500">
                        <MinusCircle className="size-3" />
                        {row.skipped}
                      </span>
                    )}
                    <span className="ml-auto text-zinc-500">
                      {format(new Date(row.created_at), "d MMM HH:mm", {
                        locale: tr,
                      })}
                    </span>
                  </div>

                  <div className="flex h-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            }

            // Single
            const biz = row.business
            const clicks = biz?.short_id_clicks ?? 0
            return (
              <div
                key={row.id}
                onClick={() => {
                  if (biz?.id) navigate(`/businesses/${biz.id}`)
                }}
                className={cn(
                  "group flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 transition-all",
                  biz?.id
                    ? "cursor-pointer hover:border-emerald-500/50 hover:bg-zinc-900/60"
                    : "opacity-70"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-zinc-200">
                    {biz?.name ?? "—"}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {clicks > 0 && (
                      <span
                        className="flex items-center gap-0.5 text-[10px] font-medium text-cyan-400"
                        title={`${clicks} tıklama`}
                      >
                        <MousePointerClick className="size-3" />
                        {clicks}
                      </span>
                    )}
                    <StatusIcon status={row.status} />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                  <span className="font-mono truncate flex-1">
                    {biz?.phone || "—"}
                  </span>
                  <span className="shrink-0 ml-2">
                    {format(new Date(row.created_at), "d MMM HH:mm", {
                      locale: tr,
                    })}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
