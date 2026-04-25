import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Users,
  FolderOpen,
  Plus,
  X,
  Paperclip,
  MessageCircle,
  Loader2,
  Square,
  Send,
  Settings,
  Hash,
  Trash,
  FileText,
  Save,
  Clock,
  CalendarClock,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  api,
  listWhatsAppLines,
  startWhatsAppCampaign,
  stopWhatsAppCampaign,
  createScheduledCampaign,
  createMessageTemplate,
  listMessageTemplates,
  type WhatsAppLine,
  type WhatsAppCampaign,
  type MessageTemplate,
} from "@/lib/api-client"
import { TemplateManagerDialog } from "./TemplateManagerDialog"
import { useIsLinkOwner } from "@/hooks/useIsLinkOwner"
import toast from "react-hot-toast"

interface ListItem {
  id: string
  name: string
  items_count?: [{ count: number }]
}

interface ListWithBusinesses {
  id: string
  name: string
  businesses: { id: string; name: string; phone?: string }[]
}

const DEFAULT_TEMPLATE =
  "Merhaba {name}, Google Haritalar'da işletmenizi inceledim. Dijital varlığınızı güçlendirmek için kısa bir görüşme ayarlayabilir miyiz?"

const BASE_VARIABLES = [
  { key: "{name}", label: "isim", color: "text-purple-300 bg-purple-500/10 border-purple-500/20" },
  { key: "{phone}", label: "telefon", color: "text-blue-300 bg-blue-500/10 border-blue-500/20" },
  { key: "{greeting}", label: "selamlama", color: "text-pink-300 bg-pink-500/10 border-pink-500/20" },
]
const LINK_VARIABLE = {
  key: "{link}",
  label: "özel link",
  color: "text-cyan-300 bg-cyan-500/10 border-cyan-500/20",
}

const MAX_MEDIA_BYTES = 20 * 1024 * 1024

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

type RecipientSource = "list" | "manual"

function normalizeManualPhone(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "")
  if (digits.length < 10 || digits.length > 15) return null
  if (digits.length === 10 && digits.startsWith("5")) return "90" + digits
  if (digits.length === 11 && digits.startsWith("05")) return "90" + digits.slice(1)
  return digits
}

export function BulkSendPanel() {
  const { isLinkOwner } = useIsLinkOwner()
  const VARIABLES = isLinkOwner ? [BASE_VARIABLES[0], LINK_VARIABLE, ...BASE_VARIABLES.slice(1)] : BASE_VARIABLES
  const [source, setSource] = useState<RecipientSource>("list")
  const [selectedListId, setSelectedListId] = useState<string>("")
  const [manualPhones, setManualPhones] = useState<string[]>([])
  const [manualInput, setManualInput] = useState("")
  const [lines, setLines] = useState<WhatsAppLine[]>([])
  const [selectedLineId, setSelectedLineId] = useState<string>("")
  const [campaign, setCampaign] = useState<WhatsAppCampaign | null>(null)

  const [template, setTemplate] = useState(DEFAULT_TEMPLATE)
  const [mediaFile, setMediaFile] = useState<File | null>(null)

  // Templates
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false)
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)

  // Scheduling
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now")
  const [scheduledAt, setScheduledAt] = useState("")
  const [scheduleName, setScheduleName] = useState("")

  // Advanced settings
  const [showSettings, setShowSettings] = useState(false)
  const [minDelay, setMinDelay] = useState(60)
  const [maxDelay, setMaxDelay] = useState(120)
  const [coffeeEvery, setCoffeeEvery] = useState(20)
  const [coffeeMin, setCoffeeMin] = useState(15)

  const [starting, setStarting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Şablon listesi
  const { data: templates = [] } = useQuery({
    queryKey: ["messageTemplates"],
    queryFn: listMessageTemplates,
    staleTime: 30_000,
  })

  // Listeleri çek
  const { data: allLists = [] } = useQuery({
    queryKey: ["lists"],
    queryFn: () => api.get<ListItem[]>("/api/lists"),
    staleTime: 30_000,
  })

  // Seçilen listenin içeriğini çek
  const { data: listDetail } = useQuery({
    queryKey: ["listDetail", selectedListId],
    queryFn: () => api.get<ListWithBusinesses>(`/api/lists/${selectedListId}`),
    enabled: !!selectedListId,
  })

  const listRecipients = useMemo(() => {
    if (!listDetail?.businesses) return []
    return listDetail.businesses.filter((b) => b.phone)
  }, [listDetail])

  const recipientCount = source === "manual" ? manualPhones.length : listRecipients.length

  const addManualPhone = (raw: string) => {
    const parts = raw.split(/[\s,;\n\r\t]+/).map((x) => x.trim()).filter(Boolean)
    if (parts.length === 0) return
    const added: string[] = []
    const skipped: string[] = []
    for (const p of parts) {
      const n = normalizeManualPhone(p)
      if (!n) {
        skipped.push(p)
        continue
      }
      if (!manualPhones.includes(n) && !added.includes(n)) added.push(n)
    }
    if (added.length > 0) setManualPhones((prev) => [...prev, ...added])
    if (skipped.length > 0 && parts.length === 1) {
      toast.error("Geçersiz format. Örn: 905551234567")
    } else if (added.length > 0) {
      toast.success(`${added.length} numara eklendi`)
    }
    setManualInput("")
  }

  const removeManualPhone = (p: string) => {
    setManualPhones((prev) => prev.filter((x) => x !== p))
  }

  // Hatları polling ile çek
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const [ls, camp] = await Promise.all([
          listWhatsAppLines(),
          api
            .get<{ campaign: WhatsAppCampaign | null }>("/api/whatsapp/campaign")
            .catch(() => ({ campaign: null })),
        ])
        if (cancelled) return
        setLines(ls)
        setCampaign(camp.campaign ?? null)
        setSelectedLineId((prev) => {
          if (prev && ls.some((l) => l.id === prev)) return prev
          return ls.find((l) => l.status === "ready")?.id ?? ""
        })
      } catch {}
    }
    tick()
    const id = setInterval(tick, 3000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const mediaPreview = useMemo(() => {
    if (!mediaFile || !mediaFile.type.startsWith("image/")) return null
    return URL.createObjectURL(mediaFile)
  }, [mediaFile])

  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview)
    }
  }, [mediaPreview])

  const insertVariable = (v: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const next = template.slice(0, start) + v + template.slice(end)
    setTemplate(next)
    // cursor'u sonraki karaktere taşı
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = start + v.length
    })
  }

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const ok =
      f.type.startsWith("image/") ||
      f.type === "application/pdf" ||
      /\.(png|jpe?g|gif|webp|pdf)$/i.test(f.name)
    if (!ok) {
      toast.error("Sadece görsel veya PDF ekleyebilirsiniz")
      return
    }
    if (f.size > MAX_MEDIA_BYTES) {
      toast.error("Dosya 20MB'dan büyük olamaz")
      return
    }
    setMediaFile(f)
  }

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (!f) return
    handleMediaSelect({ target: { files: [f] } } as unknown as React.ChangeEvent<HTMLInputElement>)
  }

  const readyLines = lines.filter((l) => l.status === "ready")
  const isRunning = campaign?.status === "running"
  const progress = campaign && campaign.total > 0
    ? Math.round((campaign.processed / campaign.total) * 100)
    : 0

  const handleStart = async () => {
    if (source === "list" && !selectedListId) {
      toast.error("Bir liste seçin")
      return
    }
    if (source === "list" && listRecipients.length === 0) {
      toast.error("Listede WhatsApp numarası olan lead yok")
      return
    }
    if (source === "manual" && manualPhones.length === 0) {
      toast.error("En az bir numara ekleyin")
      return
    }
    if (!template.trim()) {
      toast.error("Mesaj boş olamaz")
      return
    }
    if (!selectedLineId) {
      toast.error("Hazır bir WhatsApp hattı seçin")
      return
    }
    if (sendMode === "schedule") {
      if (!scheduledAt) {
        toast.error("Gönderim zamanını seçin")
        return
      }
      const when = new Date(scheduledAt)
      if (isNaN(when.getTime())) {
        toast.error("Geçersiz tarih")
        return
      }
      if (when.getTime() < Date.now() - 60_000) {
        toast.error("Zaman geçmişte olamaz")
        return
      }
    }

    setStarting(true)
    try {
      let media: { data: string; mimeType: string; filename: string } | undefined
      if (mediaFile) {
        const data = await fileToBase64(mediaFile)
        media = {
          data,
          mimeType: mediaFile.type || "application/octet-stream",
          filename: mediaFile.name,
        }
      }

      // Manuel mod: önce geçici liste oluştur, sonra kampanya başlat
      let listIdToUse = selectedListId
      if (source === "manual") {
        const now = new Date()
        const tempName = `Manuel ${now.toLocaleDateString("tr-TR")} ${now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`
        const imported = await api.post<{ list: { id: string }; imported: number }>(
          "/api/lists/import",
          { name: tempName, phones: manualPhones, source: "manual" }
        )
        listIdToUse = imported.list.id
      }

      if (sendMode === "schedule") {
        await createScheduledCampaign({
          list_id: listIdToUse,
          line_id: selectedLineId,
          name: scheduleName.trim() || undefined,
          message_template: template,
          media,
          min_delay_sec: minDelay,
          max_delay_sec: maxDelay,
          coffee_break_every: coffeeEvery,
          coffee_break_minutes: coffeeMin,
          scheduled_at: new Date(scheduledAt).toISOString(),
        })
        toast.success(
          `Kampanya ${new Date(scheduledAt).toLocaleString("tr-TR")} için zamanlandı`
        )
        setScheduledAt("")
        setScheduleName("")
        setSendMode("now")
      } else {
        await startWhatsAppCampaign({
          listId: listIdToUse,
          lineId: selectedLineId,
          messageTemplate: template,
          minDelaySec: minDelay,
          maxDelaySec: maxDelay,
          coffeeBreakEvery: coffeeEvery,
          coffeeBreakMinutes: coffeeMin,
          media,
        })
        toast.success(`Kampanya başlatıldı — ${recipientCount} alıcı`)
      }

      if (source === "manual") setManualPhones([])
    } catch (e: any) {
      toast.error(e.message || "Başlatılamadı")
    } finally {
      setStarting(false)
    }
  }

  const handleSelectTemplate = (tpl: MessageTemplate) => {
    setTemplate(tpl.content)
    setActiveTemplateId(tpl.id)
    toast.success(`"${tpl.name}" şablonu yüklendi`)
  }

  const handleQuickSaveTemplate = async () => {
    const name = window.prompt("Şablon adı:")
    if (!name?.trim()) return
    if (!template.trim()) {
      toast.error("Boş mesaj kaydedilemez")
      return
    }
    try {
      await createMessageTemplate({ name: name.trim(), content: template })
      toast.success("Şablon kaydedildi")
    } catch (e: any) {
      toast.error(e.message || "Kaydedilemedi")
    }
  }

  const handleStop = async () => {
    try {
      await stopWhatsAppCampaign()
      toast.success("Durdurma isteği gönderildi")
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      {/* Aktif Kampanya Banner */}
      {campaign && isRunning && (
        <Card className="border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-zinc-900/40 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="size-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Send className="size-5 text-emerald-400" />
                </div>
                <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-emerald-400 animate-pulse border-2 border-zinc-950" />
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-100">Kampanya aktif</div>
                <div className="text-xs text-zinc-400">
                  {campaign.processed}/{campaign.total} · ✓ {campaign.sent} · ✗ {campaign.failed}
                </div>
              </div>
            </div>
            <Button
              onClick={handleStop}
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <Square className="mr-1.5 size-3.5" /> Durdur
            </Button>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          {campaign.currentLead && (
            <div className="text-[11px] text-zinc-500 mt-2">
              <span className="text-zinc-600">Şu an:</span> {campaign.currentLead}
            </div>
          )}
        </Card>
      )}

      {/* Alıcı Listesi */}
      <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10">
              <Users className="size-4 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base text-zinc-100">Alıcı Listesi</CardTitle>
              <p className="text-[11px] text-zinc-500">
                {source === "list" ? "Kayıtlı listeden hedef kitle" : "Numaraları doğrudan ekle"}
              </p>
            </div>
          </div>
          {recipientCount > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20">
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative size-2 rounded-full bg-emerald-400" />
              </span>
              {recipientCount} alıcı hazır
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Source Toggle */}
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/40 p-1.5">
            <button
              onClick={() => setSource("list")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-all",
                source === "list"
                  ? "bg-blue-500/10 text-blue-400 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <FolderOpen className="size-3.5" />
              Kayıtlı Liste
            </button>
            <button
              onClick={() => setSource("manual")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-all",
                source === "manual"
                  ? "bg-purple-500/10 text-purple-400 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Hash className="size-3.5" />
              Manuel Numara
            </button>
          </div>

          {source === "list" ? (
            <>
              <Select value={selectedListId} onValueChange={(v) => setSelectedListId(v ?? "")}>
                <SelectTrigger className="h-11 border-zinc-700 bg-zinc-900/60">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="size-4 text-zinc-500" />
                    <SelectValue placeholder="Liste seçin..." />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {allLists.length === 0 && (
                    <div className="px-2 py-6 text-center text-xs text-zinc-500">
                      Henüz kayıtlı liste yok
                    </div>
                  )}
                  {allLists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      <div className="flex items-center gap-2">
                        <span>{l.name}</span>
                        <span className="text-[10px] text-zinc-500">
                          {l.items_count?.[0]?.count ?? 0} işletme
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedListId && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                  {listRecipients.length === 0 ? (
                    <div className="flex flex-col items-center py-6 text-center">
                      <div className="flex size-10 items-center justify-center rounded-full bg-zinc-900 mb-2">
                        <X className="size-5 text-zinc-600" />
                      </div>
                      <p className="text-xs text-zinc-500">
                        Bu listede WhatsApp numarası olan lead yok
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                        {listRecipients.slice(0, 50).map((b) => (
                          <span
                            key={b.id}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[11px] font-mono text-emerald-300"
                            title={b.name}
                          >
                            {b.phone}
                          </span>
                        ))}
                        {listRecipients.length > 50 && (
                          <span className="inline-flex items-center rounded-md bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-400">
                            +{listRecipients.length - 50} daha
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800/60">
                        <span className="text-[11px] text-zinc-500">
                          <span className="text-zinc-300 font-semibold">{listRecipients.length}</span> numara hazır
                        </span>
                        <span className="text-[10px] text-zinc-600">
                          {listDetail?.businesses.length ?? 0} toplam · {(listDetail?.businesses.length ?? 0) - listRecipients.length} telefonsuz
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            /* MANUEL MOD */
            <>
              <div className="flex gap-2">
                <Input
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault()
                      addManualPhone(manualInput)
                    }
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text")
                    if (/[\s,;\n]/.test(pasted)) {
                      e.preventDefault()
                      addManualPhone(pasted)
                    }
                  }}
                  placeholder="905551234567 (ülke koduyla)"
                  className="h-11 border-zinc-700 bg-zinc-900/60 font-mono text-sm"
                />
                <Button
                  onClick={() => addManualPhone(manualInput)}
                  disabled={!manualInput.trim()}
                  className="h-11 px-5 bg-purple-600 hover:bg-purple-500 text-white font-semibold shadow-lg shadow-purple-900/20"
                >
                  <Plus className="mr-1 size-4" />
                  Ekle
                </Button>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 min-h-[80px]">
                {manualPhones.length === 0 ? (
                  <div className="flex flex-col items-center py-4 text-center">
                    <p className="text-xs text-zinc-500">
                      Numara yazıp <kbd className="mx-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px]">Enter</kbd>
                      ya da virgülle ekleyin
                    </p>
                    <p className="text-[10px] text-zinc-600 mt-1">
                      Birden çok numarayı aynı anda yapıştırabilirsiniz
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                      {manualPhones.map((p) => (
                        <span
                          key={p}
                          className="inline-flex items-center gap-1 rounded-md border border-purple-500/20 bg-purple-500/5 px-2 py-1 text-[11px] font-mono text-purple-300"
                        >
                          +{p}
                          <button
                            onClick={() => removeManualPhone(p)}
                            className="text-purple-400 hover:text-red-400 transition-colors"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800/60">
                      <span className="text-[11px] text-zinc-500">
                        <span className="text-zinc-300 font-semibold">{manualPhones.length}</span> numara
                      </span>
                      <button
                        onClick={() => setManualPhones([])}
                        className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-red-400 transition-colors"
                      >
                        <Trash className="size-3" />
                        Temizle
                      </button>
                    </div>
                  </>
                )}
              </div>

              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Manuel eklediğiniz numaralar otomatik olarak geçici bir liste olarak kaydedilir.
                Formatlar: <code className="text-emerald-400">905XXXXXXXXX</code>,{" "}
                <code className="text-emerald-400">+905XXXXXXXXX</code>,{" "}
                <code className="text-emerald-400">05XXXXXXXXX</code>,{" "}
                <code className="text-emerald-400">5XXXXXXXXX</code>
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Mesaj İçeriği */}
      <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10">
                <MessageCircle className="size-4 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-base text-zinc-100">Mesaj İçeriği</CardTitle>
                <p className="text-[11px] text-zinc-500">
                  Şablon kullanın veya manuel yazın
                </p>
              </div>
            </div>
            <Button
              onClick={() => setTemplateManagerOpen(true)}
              size="sm"
              variant="ghost"
              className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
            >
              <FileText className="mr-1.5 size-3.5" />
              Şablonları Yönet
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Şablon seçici */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1.5 block">
              Kaydedilmiş Şablonlar
            </Label>
            {templates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 px-3 py-2 text-[11px] text-zinc-500">
                Henüz şablon yok.{" "}
                <button
                  onClick={() => setTemplateManagerOpen(true)}
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  İlk şablonunu oluştur
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => {
                    setTemplate("")
                    setActiveTemplateId(null)
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] transition-all",
                    activeTemplateId === null
                      ? "border-zinc-600 bg-zinc-800 text-zinc-200"
                      : "border-zinc-800 bg-zinc-950/40 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                  )}
                >
                  <Plus className="size-3" />
                  Manuel
                </button>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTemplate(t)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] transition-all max-w-[180px]",
                      activeTemplateId === t.id
                        ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                        : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                    )}
                    title={t.content}
                  >
                    <FileText className="size-3 shrink-0" />
                    <span className="truncate">{t.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Textarea
            ref={textareaRef}
            value={template}
            onChange={(e) => {
              setTemplate(e.target.value)
              if (activeTemplateId) setActiveTemplateId(null)
            }}
            rows={5}
            className="border-zinc-700 bg-zinc-950/60 text-sm resize-none"
            placeholder="Mesajınızı yazın veya yukarıdan bir şablon seçin..."
          />

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-zinc-500 mr-1">Değişken ekle:</span>
              {VARIABLES.map((v) => (
                <button
                  key={v.key}
                  onClick={() => insertVariable(v.key)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-mono transition-all hover:scale-105",
                    v.color
                  )}
                >
                  <Plus className="size-2.5" />
                  {v.key}
                </button>
              ))}
            </div>
            <Button
              onClick={handleQuickSaveTemplate}
              disabled={!template.trim()}
              size="sm"
              variant="ghost"
              className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-8"
            >
              <Save className="mr-1.5 size-3.5" />
              Şablon Olarak Kaydet
            </Button>
          </div>

          {/* Medya Ekle */}
          <div>
            <Label className="text-[11px] text-zinc-500 flex items-center gap-1 mb-1.5">
              <Paperclip className="size-3" />
              Medya Ekle (isteğe bağlı)
            </Label>
            {mediaFile ? (
              <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
                {mediaPreview ? (
                  <img src={mediaPreview} alt="" className="size-12 rounded object-cover" />
                ) : (
                  <div className="size-12 rounded bg-zinc-800 flex items-center justify-center text-[10px] font-semibold text-zinc-400">
                    PDF
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-zinc-200 truncate">{mediaFile.name}</div>
                  <div className="text-[10px] text-zinc-500">
                    {(mediaFile.size / 1024).toFixed(0)} KB
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setMediaFile(null)}
                  className="size-8 text-zinc-500 hover:text-red-400"
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-5 cursor-pointer transition-colors hover:border-zinc-600 hover:bg-zinc-900/40"
              >
                <Paperclip className="size-5 text-zinc-500 mb-1.5" />
                <span className="text-xs text-zinc-400 font-medium">
                  Görsel veya PDF eklemek için tıklayın
                </span>
                <span className="text-[10px] text-zinc-600 mt-0.5">
                  JPG · PNG · WEBP · PDF · max 20MB
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleMediaSelect}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Gelişmiş Ayarlar */}
      <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm">
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="flex w-full items-center justify-between p-4 hover:bg-zinc-900/40 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2">
            <Settings className="size-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-200">Gecikme & Mola Ayarları</span>
          </div>
          <span className="text-[11px] text-zinc-500">
            {minDelay}-{maxDelay}sn · Her {coffeeEvery}'de {coffeeMin}dk mola
          </span>
        </button>
        {showSettings && (
          <CardContent className="pt-0 pb-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Min Gecikme (sn)
                </Label>
                <Input
                  type="number"
                  value={minDelay}
                  onChange={(e) => setMinDelay(Number(e.target.value))}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Max Gecikme (sn)
                </Label>
                <Input
                  type="number"
                  value={maxDelay}
                  onChange={(e) => setMaxDelay(Number(e.target.value))}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Her X Mesajda
                </Label>
                <Input
                  type="number"
                  value={coffeeEvery}
                  onChange={(e) => setCoffeeEvery(Number(e.target.value))}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Mola Süresi (dk)
                </Label>
                <Input
                  type="number"
                  value={coffeeMin}
                  onChange={(e) => setCoffeeMin(Number(e.target.value))}
                  className="mt-1 h-9"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Hat Seçimi + Gönderim Modu + Başlat */}
      <Card className="border-zinc-800 bg-gradient-to-br from-zinc-900/60 to-zinc-900/30 backdrop-blur-sm">
        <CardContent className="p-4 space-y-3">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block">
              Gönderim Hattı
            </Label>
            <Select value={selectedLineId} onValueChange={(v) => setSelectedLineId(v ?? "")}>
              <SelectTrigger className="h-10 border-zinc-700 bg-zinc-950/60">
                <SelectValue placeholder={readyLines.length === 0 ? "Hazır hat yok" : "Hat seçin..."} />
              </SelectTrigger>
              <SelectContent>
                {readyLines.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    <div className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-emerald-400" />
                      <span>{l.label}</span>
                      {l.phone && <span className="text-[10px] text-zinc-500 font-mono">+{l.phone}</span>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Gönderim Modu */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block">
              Gönderim Zamanı
            </Label>
            <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/40 p-1.5">
              <button
                onClick={() => setSendMode("now")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-medium transition-all",
                  sendMode === "now"
                    ? "bg-emerald-500/10 text-emerald-400 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Send className="size-3.5" />
                Hemen Gönder
              </button>
              <button
                onClick={() => setSendMode("schedule")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-medium transition-all",
                  sendMode === "schedule"
                    ? "bg-amber-500/10 text-amber-400 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Clock className="size-3.5" />
                Zamanla
              </button>
            </div>
          </div>

          {sendMode === "schedule" && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-300">Zamanlı Gönderim</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">
                    Tarih ve Saat *
                  </Label>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                      .toISOString()
                      .slice(0, 16)}
                    className="h-10 border-zinc-700 bg-zinc-950/60"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">
                    İsim (ops.)
                  </Label>
                  <Input
                    value={scheduleName}
                    onChange={(e) => setScheduleName(e.target.value)}
                    placeholder="Hafta sonu kampanyası"
                    className="h-10 border-zinc-700 bg-zinc-950/60"
                  />
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Kampanya seçilen zamanda otomatik başlar. "Zamanlı" sekmesinden yönetebilirsin.
              </p>
            </div>
          )}

          <Button
            onClick={handleStart}
            disabled={
              starting ||
              isRunning ||
              !selectedLineId ||
              recipientCount === 0 ||
              (source === "list" && !selectedListId) ||
              (sendMode === "schedule" && !scheduledAt)
            }
            className={cn(
              "w-full h-12 text-white font-semibold shadow-lg transition-all active:scale-[0.98]",
              sendMode === "schedule"
                ? "bg-amber-600 hover:bg-amber-500 shadow-amber-900/20"
                : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20"
            )}
          >
            {starting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : sendMode === "schedule" ? (
              <CalendarClock className="mr-2 size-4" />
            ) : (
              <Send className="mr-2 size-4" />
            )}
            {isRunning
              ? "Kampanya çalışıyor"
              : sendMode === "schedule"
                ? recipientCount > 0
                  ? `${recipientCount} Alıcı için Zamanla`
                  : "Zamanla"
                : recipientCount > 0
                  ? `${recipientCount} Alıcıya Gönder`
                  : "Kampanyayı Başlat"}
          </Button>
        </CardContent>
      </Card>

      <TemplateManagerDialog
        open={templateManagerOpen}
        onOpenChange={setTemplateManagerOpen}
        onSelect={handleSelectTemplate}
      />
    </div>
  )
}
