import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, MessageCircle, Trash2, RefreshCw, Phone, ScanLine } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  listWhatsAppLines,
  createWhatsAppLine,
  deleteWhatsAppLine,
  reconnectWhatsAppLine,
  type WhatsAppLine,
} from "@/lib/api-client"
import { useConfirm } from "@/components/ui/confirm-dialog"
import toast from "react-hot-toast"

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  ready: { text: "Bağlı", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  qr: { text: "QR bekleniyor", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  initializing: { text: "Başlatılıyor", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  authenticated: { text: "Kimliklendi", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  disconnected: { text: "Bağlı değil", color: "bg-zinc-800 text-zinc-400 border-zinc-700" },
  auth_failure: { text: "Kimlik hatası", color: "bg-red-500/10 text-red-400 border-red-500/20" },
}

export function LineManagerPanel() {
  const [lines, setLines] = useState<WhatsAppLine[]>([])
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState("")
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()
  const confirmDialog = useConfirm()

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
    const id = setInterval(tick, 2500)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const handleAdd = async () => {
    if (adding) return
    setAdding(true)
    try {
      const line = await createWhatsAppLine(newLabel || undefined)
      setLines((prev) => [...prev, line])
      setNewLabel("")
      toast.success("Hat eklendi, QR oluşturuluyor...")
      queryClient.invalidateQueries({ queryKey: ["whatsappLines"] })
    } catch {
      toast.error("Hat eklenemedi")
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Hat silinsin mi?",
      description: "WhatsApp oturumu sonlandırılır, bu cihazdaki bağlantı kopar.",
      confirmText: "Evet, sil",
      variant: "danger",
    })
    if (!ok) return
    try {
      await deleteWhatsAppLine(id)
      setLines((prev) => prev.filter((l) => l.id !== id))
      toast.success("Hat silindi")
    } catch {
      toast.error("Hat silinemedi")
    }
  }

  const handleReconnect = async (id: string) => {
    try {
      await reconnectWhatsAppLine(id)
      toast.success("Yeniden bağlantı başlatıldı")
    } catch {
      toast.error("Yeniden bağlantı başarısız")
    }
  }

  return (
    <div className="space-y-4">
      {/* Yeni Hat Ekle */}
      <Card className="border-zinc-800 bg-gradient-to-br from-emerald-500/5 to-zinc-900/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <Plus className="size-4 text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-base text-zinc-100">Yeni WhatsApp Hattı</CardTitle>
              <p className="text-[11px] text-zinc-500">
                Yeni bir WhatsApp numarası bağlayın
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Hat adı (örn. Ana Hat, Satış)"
              className="h-10 border-zinc-700 bg-zinc-950/60"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button
              onClick={handleAdd}
              disabled={adding}
              className="h-10 bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20"
            >
              {adding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="mr-1 size-4" />
              )}
              {!adding && "Ekle"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mevcut Hatlar */}
      <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10">
              <MessageCircle className="size-4 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base text-zinc-100">Bağlı Hatlar</CardTitle>
              <p className="text-[11px] text-zinc-500">
                {loading ? "Yükleniyor..." : `${lines.length} hat kayıtlı`}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-zinc-500" />
            </div>
          ) : lines.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-zinc-800/80 mb-3">
                <MessageCircle className="size-6 text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-400 font-medium mb-1">Henüz bağlı hat yok</p>
              <p className="text-xs text-zinc-500">Yukarıdan yeni bir hat ekleyerek başlayın</p>
            </div>
          ) : (
            lines.map((line) => {
              const badge = STATUS_LABEL[line.status] || STATUS_LABEL.disconnected
              return (
                <div
                  key={line.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 space-y-3 transition-colors hover:border-zinc-700"
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex size-10 items-center justify-center rounded-lg ${
                      line.status === "ready" ? "bg-emerald-500/10" : "bg-zinc-800/60"
                    }`}>
                      <MessageCircle className={`size-5 ${
                        line.status === "ready" ? "text-emerald-400" : "text-zinc-500"
                      }`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-zinc-100 truncate">{line.label}</div>
                      {line.phone ? (
                        <div className="flex items-center gap-1 text-xs text-zinc-400 mt-0.5">
                          <Phone className="size-3" />
                          <span className="font-mono">+{line.phone}</span>
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-600 mt-0.5">Numara yok</div>
                      )}
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-1 rounded-md border ${badge.color}`}>
                      {badge.text}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleReconnect(line.id)}
                      className="size-8 text-zinc-500 hover:text-zinc-200"
                      title="Yeniden bağlan"
                    >
                      <RefreshCw className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(line.id)}
                      className="size-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                      title="Hattı sil"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>

                  {line.status === "qr" && line.qr && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3 text-amber-400">
                        <ScanLine className="size-4" />
                        <span className="text-xs font-semibold">QR Kodunu Tarayın</span>
                      </div>
                      <div className="flex flex-col items-center rounded-lg bg-white p-3">
                        <img src={line.qr} alt="QR" className="size-48" />
                      </div>
                      <p className="mt-3 text-center text-[11px] text-zinc-400">
                        Telefon &gt; WhatsApp &gt; Bağlı Cihazlar &gt; Cihaz Ekle
                      </p>
                    </div>
                  )}
                  {(line.status === "initializing" || line.status === "authenticated") && !line.qr && (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="size-5 animate-spin text-emerald-400" />
                    </div>
                  )}
                  {line.lastError && (
                    <div className="text-xs text-red-400 bg-red-500/5 border border-red-500/10 rounded-md px-2 py-1.5">
                      {line.lastError}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
