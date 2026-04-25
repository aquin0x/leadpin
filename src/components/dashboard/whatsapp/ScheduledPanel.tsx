import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Clock,
  Calendar,
  Plus,
  X,
  Save,
  Loader2,
  Trash2,
  FolderOpen,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PlayCircle,
  Info,
  FileText,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  api,
  listScheduledCampaigns,
  createScheduledCampaign,
  cancelScheduledCampaign,
  deleteScheduledCampaign,
  listWhatsAppLines,
  type ScheduledCampaign,
  type WhatsAppLine,
  type ScheduledStatus,
} from "@/lib/api-client"
import { AutomationSettingsCard } from "./AutomationSettingsCard"
import { useConfirm } from "@/components/ui/confirm-dialog"
import toast from "react-hot-toast"

interface ListItem {
  id: string
  name: string
  items_count?: [{ count: number }]
}

const STATUS_META: Record<ScheduledStatus, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string; border: string }> = {
  pending: { label: "Bekliyor", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  running: { label: "Çalışıyor", icon: PlayCircle, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  completed: { label: "Tamamlandı", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  cancelled: { label: "İptal Edildi", icon: XCircle, color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/20" },
  failed: { label: "Başarısız", icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

function toLocalDatetimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function ScheduleForm({
  onClose,
  lists,
  lines,
}: {
  onClose: () => void
  lists: ListItem[]
  lines: WhatsAppLine[]
}) {
  const queryClient = useQueryClient()
  const defaultTime = useMemo(() => {
    const d = new Date()
    d.setHours(d.getHours() + 1)
    d.setMinutes(0)
    return toLocalDatetimeInput(d)
  }, [])

  const [listId, setListId] = useState("")
  const [lineId, setLineId] = useState("")
  const [name, setName] = useState("")
  const [message, setMessage] = useState(
    "Merhaba {name}, işletmeniz için özel bir önerimiz var. Görüşme ayarlayabilir miyiz?"
  )
  const [scheduledAt, setScheduledAt] = useState(defaultTime)

  const readyLines = lines.filter((l) => l.status === "ready")

  const createMutation = useMutation({
    mutationFn: () =>
      createScheduledCampaign({
        list_id: listId,
        line_id: lineId || undefined,
        name: name.trim() || undefined,
        message_template: message,
        scheduled_at: new Date(scheduledAt).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled"] })
      toast.success("Kampanya zamanlandı")
      onClose()
    },
    onError: (e: any) => toast.error(e.message || "Zamanlanamadı"),
  })

  const handleSubmit = () => {
    if (!listId) return toast.error("Liste seçin")
    if (!message.trim()) return toast.error("Mesaj boş olamaz")
    if (!scheduledAt) return toast.error("Zaman seçin")
    const when = new Date(scheduledAt)
    if (when.getTime() < Date.now() - 60_000)
      return toast.error("Geçmiş bir zaman seçemezsiniz")
    createMutation.mutate()
  }

  return (
    <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-zinc-900/40 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10">
            <Calendar className="size-4 text-amber-400" />
          </div>
          <CardTitle className="text-base text-zinc-100">Yeni Zamanlı Kampanya</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1.5">
            Kampanya Adı (opsiyonel)
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Pazartesi kahvecileri"
            className="h-9 border-zinc-700 bg-zinc-950/60"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1.5">
              Liste
            </label>
            <Select value={listId} onValueChange={(v) => setListId(v ?? "")}>
              <SelectTrigger className="h-9 border-zinc-700 bg-zinc-950/60">
                <div className="flex items-center gap-2">
                  <FolderOpen className="size-3.5 text-zinc-500" />
                  <SelectValue placeholder="Liste seçin..." />
                </div>
              </SelectTrigger>
              <SelectContent>
                {lists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                    <span className="ml-2 text-[10px] text-zinc-500">
                      {l.items_count?.[0]?.count ?? 0} işletme
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1.5">
              Hat (opsiyonel)
            </label>
            <Select value={lineId} onValueChange={(v) => setLineId(v ?? "")}>
              <SelectTrigger className="h-9 border-zinc-700 bg-zinc-950/60">
                <SelectValue placeholder="Otomatik seç..." />
              </SelectTrigger>
              <SelectContent>
                {readyLines.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    <div className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-emerald-400" />
                      {l.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1.5">
            Gönderim Tarihi & Saati
          </label>
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="h-9 border-zinc-700 bg-zinc-950/60"
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1.5">
            Mesaj Şablonu
          </label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="border-zinc-700 bg-zinc-950/60 resize-none"
            placeholder="Mesajınızı yazın... {name} gibi değişkenler kullanılabilir"
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button onClick={onClose} variant="ghost" className="text-zinc-400">
            İptal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/20"
          >
            {createMutation.isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 size-4" />
            )}
            Zamanla
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CampaignCard({
  item,
  onCancel,
  onDelete,
}: {
  item: ScheduledCampaign
  onCancel: () => void
  onDelete: () => void
}) {
  const meta = STATUS_META[item.status]
  const Icon = meta.icon
  const isPending = item.status === "pending"
  const isFinished = ["completed", "cancelled", "failed"].includes(item.status)

  const countdown = useMemo(() => {
    if (!isPending) return null
    const diff = new Date(item.scheduled_at).getTime() - Date.now()
    if (diff <= 0) return "Yakında..."
    const days = Math.floor(diff / 86_400_000)
    const hours = Math.floor((diff % 86_400_000) / 3_600_000)
    const mins = Math.floor((diff % 3_600_000) / 60_000)
    if (days > 0) return `${days}g ${hours}s kaldı`
    if (hours > 0) return `${hours}s ${mins}dk kaldı`
    return `${mins} dakika kaldı`
  }, [item.scheduled_at, isPending])

  return (
    <Card className={cn("border backdrop-blur-sm transition-all", meta.border, "bg-zinc-900/40")}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", meta.bg)}>
              <Icon className={cn("size-5", meta.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-sm font-semibold text-zinc-100 truncate">
                  {item.name || item.lists?.name || "Zamanlı Kampanya"}
                </h3>
                <span
                  className={cn(
                    "text-[10px] font-semibold rounded px-1.5 py-0.5 border",
                    meta.bg,
                    meta.color,
                    meta.border
                  )}
                >
                  {meta.label}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Calendar className="size-3" />
                <span>{formatDateTime(item.scheduled_at)}</span>
                {countdown && (
                  <span className="text-amber-400 font-medium">· {countdown}</span>
                )}
              </div>
              {item.lists?.name && (
                <div className="flex items-center gap-1 mt-1 text-[11px] text-zinc-500">
                  <FolderOpen className="size-3" />
                  {item.lists.name}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isPending && (
              <Button
                onClick={onCancel}
                size="sm"
                variant="ghost"
                className="text-amber-400 hover:text-red-400 hover:bg-red-500/10"
              >
                <X className="mr-1 size-3.5" />
                İptal
              </Button>
            )}
            {isFinished && (
              <Button
                onClick={onDelete}
                size="icon"
                variant="ghost"
                className="size-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950/60 border border-zinc-800/60 p-2">
          <div className="flex items-start gap-2">
            <FileText className="size-3 text-zinc-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-zinc-400 line-clamp-2">{item.message_template}</p>
          </div>
        </div>

        {item.error && (
          <div className="text-[11px] text-red-400 bg-red-500/5 border border-red-500/10 rounded-md px-2 py-1.5">
            {item.error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ScheduledPanel() {
  const queryClient = useQueryClient()
  const confirmDialog = useConfirm()

  const { data: scheduled = [], isLoading } = useQuery({
    queryKey: ["scheduled"],
    queryFn: listScheduledCampaigns,
    refetchInterval: 10_000,
  })

  const { data: lists = [] } = useQuery({
    queryKey: ["lists"],
    queryFn: () => api.get<ListItem[]>("/api/lists"),
    staleTime: 30_000,
  })

  const { data: lines = [] } = useQuery({
    queryKey: ["whatsappLines"],
    queryFn: listWhatsAppLines,
    refetchInterval: 5_000,
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelScheduledCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled"] })
      toast.success("Kampanya iptal edildi")
    },
    onError: (e: any) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteScheduledCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled"] })
      toast.success("Silindi")
    },
  })

  const pending = scheduled.filter((s) => s.status === "pending")
  const finished = scheduled.filter((s) => s.status !== "pending")

  return (
    <div className="space-y-4">
      {/* Zamanlı gönderim ayarları */}
      <AutomationSettingsCard feature="scheduled" />

      <Card className="border-blue-500/20 bg-blue-500/5 backdrop-blur-sm">
        <CardContent className="flex gap-3 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
            <Info className="size-4 text-blue-400" />
          </div>
          <div className="text-xs leading-relaxed text-zinc-300">
            <p className="font-medium text-zinc-200 mb-1">Zamanlı Kampanyalar</p>
            <p className="text-zinc-400">
              Yeni bir zamanlı kampanya oluşturmak için{" "}
              <span className="text-emerald-400 font-medium">Toplu Mesaj</span> sekmesine gidin ve gönderim zamanı olarak{" "}
              <span className="text-amber-400 font-medium">"Zamanla"</span> seçeneğini kullanın.
              Bu sekme mevcut zamanlı kampanyaların yönetimi içindir.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bekleyen */}
      <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10">
              <Clock className="size-4 text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-base text-zinc-100">Bekleyen Kampanyalar</CardTitle>
              <p className="text-[11px] text-zinc-500">
                {isLoading ? "Yükleniyor..." : `${pending.length} kampanya kuyrukta`}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-zinc-500" />
            </div>
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-zinc-800/80 mb-3">
                <Calendar className="size-6 text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-400 font-medium">Bekleyen kampanya yok</p>
              <p className="text-xs text-zinc-500">Yukarıdan yeni bir kampanya zamanlayın</p>
            </div>
          ) : (
            pending.map((item) => (
              <CampaignCard
                key={item.id}
                item={item}
                onCancel={async () => {
                  const ok = await confirmDialog({
                    title: "Kampanya iptal edilsin mi?",
                    description: "Zamanlı kampanya tetiklenmeyecek. Kayıt silinmez, isterseniz yeniden oluşturabilirsiniz.",
                    confirmText: "Evet, iptal et",
                    variant: "warning",
                  })
                  if (ok) cancelMutation.mutate(item.id)
                }}
                onDelete={async () => {
                  const ok = await confirmDialog({
                    title: "Kayıt silinsin mi?",
                    description: "Bu kampanya kaydı kalıcı olarak silinecek.",
                    confirmText: "Evet, sil",
                    variant: "danger",
                  })
                  if (ok) deleteMutation.mutate(item.id)
                }}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Geçmiş */}
      {finished.length > 0 && (
        <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-zinc-800/60">
                <CheckCircle2 className="size-4 text-zinc-500" />
              </div>
              <div>
                <CardTitle className="text-base text-zinc-100">Geçmiş</CardTitle>
                <p className="text-[11px] text-zinc-500">
                  Tamamlanan veya iptal edilen kampanyalar
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {finished.map((item) => (
              <CampaignCard
                key={item.id}
                item={item}
                onCancel={() => {}}
                onDelete={() => deleteMutation.mutate(item.id)}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
