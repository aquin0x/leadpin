import { useEffect, useState } from "react"
import { MessageCircle, Phone, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { listWhatsAppLines, type WhatsAppLine } from "@/lib/api-client"

const STATUS_META: Record<string, { text: string; dot: string; pulse: boolean }> = {
  ready: { text: "Bağlandı", dot: "bg-emerald-400", pulse: true },
  qr: { text: "QR bekleniyor", dot: "bg-amber-400", pulse: true },
  initializing: { text: "Başlatılıyor", dot: "bg-blue-400", pulse: true },
  authenticated: { text: "Kimliklendi", dot: "bg-blue-400", pulse: true },
  disconnected: { text: "Bağlı değil", dot: "bg-zinc-500", pulse: false },
  auth_failure: { text: "Kimlik hatası", dot: "bg-red-400", pulse: false },
}

export function LineStatusCard({ onManage }: { onManage?: () => void }) {
  const [lines, setLines] = useState<WhatsAppLine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const data = await listWhatsAppLines()
        if (!cancelled) {
          setLines(data)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    tick()
    const id = setInterval(tick, 3000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const primary = lines.find((l) => l.status === "ready") || lines[0]
  const readyCount = lines.filter((l) => l.status === "ready").length

  if (loading) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-sm">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-5 animate-spin text-emerald-400" />
        </div>
      </Card>
    )
  }

  if (!primary) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="size-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-zinc-200">WhatsApp Bağlantısı</h3>
        </div>
        <div className="flex flex-col items-center py-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-zinc-800/80 mb-3">
            <AlertCircle className="size-6 text-zinc-500" />
          </div>
          <p className="text-xs text-zinc-500 text-center mb-3">
            Henüz bağlı WhatsApp hattı yok
          </p>
          {onManage && (
            <button
              onClick={onManage}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Hat Ekle →
            </button>
          )}
        </div>
      </Card>
    )
  }

  const meta = STATUS_META[primary.status] || STATUS_META.disconnected
  const isReady = primary.status === "ready"

  return (
    <Card className="relative overflow-hidden border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-sm">
      {isReady && (
        <div className="absolute -top-10 -right-10 size-32 rounded-full bg-emerald-500/10 blur-2xl" />
      )}
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="size-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-200">WhatsApp Bağlantısı</h3>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-zinc-800/60 px-2 py-0.5">
            <span className="relative flex size-1.5">
              {meta.pulse && (
                <span className={`absolute inset-0 animate-ping rounded-full ${meta.dot} opacity-75`} />
              )}
              <span className={`relative size-1.5 rounded-full ${meta.dot}`} />
            </span>
            <span className="text-[10px] font-medium text-zinc-300">{meta.text}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className={`flex size-12 items-center justify-center rounded-xl ${
            isReady ? "bg-emerald-500/10" : "bg-zinc-800"
          }`}>
            <CheckCircle2 className={`size-6 ${isReady ? "text-emerald-400" : "text-zinc-600"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-zinc-100 truncate">{primary.label}</div>
            {primary.phone ? (
              <div className="flex items-center gap-1 text-xs text-zinc-400 mt-0.5">
                <Phone className="size-3" />
                <span className="font-mono">+{primary.phone}</span>
              </div>
            ) : (
              <div className="text-xs text-zinc-500 mt-0.5">Numara yok</div>
            )}
          </div>
        </div>

        {lines.length > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-zinc-800/60">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              {readyCount} / {lines.length} Aktif
            </span>
            {onManage && (
              <button
                onClick={onManage}
                className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Yönet →
              </button>
            )}
          </div>
        )}

        {lines.length === 1 && onManage && (
          <button
            onClick={onManage}
            className="w-full mt-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors text-center"
          >
            Hat Yönetimi →
          </button>
        )}
      </div>
    </Card>
  )
}
