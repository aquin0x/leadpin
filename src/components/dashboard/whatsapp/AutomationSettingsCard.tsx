import { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Power,
  Clock,
  Calendar,
  Loader2,
  Save,
  Settings as SettingsIcon,
  Hand,
  Bot,
  Clock as ClockIcon,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  getFeatureSettings,
  updateFeatureSettings,
  type FeatureSettings,
  type AutomationFeature,
} from "@/lib/api-client"
import toast from "react-hot-toast"

const DAYS = [
  { value: 1, label: "Pzt" },
  { value: 2, label: "Sal" },
  { value: 3, label: "Çar" },
  { value: 4, label: "Per" },
  { value: 5, label: "Cum" },
  { value: 6, label: "Cmt" },
  { value: 0, label: "Paz" },
]

const FEATURE_META: Record<
  AutomationFeature,
  { label: string; desc: string; icon: React.ComponentType<{ className?: string }>; activeColor: string; iconBg: string; iconText: string }
> = {
  greeting: {
    label: "Karşılama",
    desc: "İlk mesaj gönderen kişilere otomatik hoşgeldin",
    icon: Hand,
    activeColor: "bg-pink-500/5",
    iconBg: "bg-pink-500/10",
    iconText: "text-pink-400",
  },
  autoreply: {
    label: "Oto-Cevap",
    desc: "Anahtar kelimelere göre otomatik cevap",
    icon: Bot,
    activeColor: "bg-purple-500/5",
    iconBg: "bg-purple-500/10",
    iconText: "text-purple-400",
  },
  scheduled: {
    label: "Zamanlı Gönderim",
    desc: "Planlanmış kampanyalar için saat penceresi",
    icon: ClockIcon,
    activeColor: "bg-amber-500/5",
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-400",
  },
}

interface Props {
  feature: AutomationFeature
}

export function AutomationSettingsCard({ feature }: Props) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<FeatureSettings | null>(null)
  const [dirty, setDirty] = useState(false)
  const [hoursMode, setHoursMode] = useState<"always" | "range">("always")

  const { data: settings, isLoading } = useQuery({
    queryKey: ["featureSettings", feature],
    queryFn: () => getFeatureSettings(feature),
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!settings) return
    setDraft(settings)
    setHoursMode(settings.active_hours_start && settings.active_hours_end ? "range" : "always")
    setDirty(false)
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: (body: Partial<FeatureSettings>) => updateFeatureSettings(feature, body),
    onSuccess: (data) => {
      queryClient.setQueryData(["featureSettings", feature], data)
      toast.success("Ayarlar kaydedildi")
      setDirty(false)
    },
    onError: (e: any) => toast.error(e.message || "Kaydedilemedi"),
  })

  const updateDraft = <K extends keyof FeatureSettings>(
    key: K,
    value: FeatureSettings[K]
  ) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
    setDirty(true)
  }

  const toggleDay = (d: number) => {
    if (!draft) return
    const has = draft.active_days.includes(d)
    const next = has
      ? draft.active_days.filter((x) => x !== d)
      : [...draft.active_days, d].sort()
    updateDraft("active_days", next)
  }

  const handleHoursModeChange = (mode: "always" | "range") => {
    setHoursMode(mode)
    if (mode === "always") {
      setDraft((p) =>
        p ? { ...p, active_hours_start: null, active_hours_end: null } : p
      )
    } else if (draft && (!draft.active_hours_start || !draft.active_hours_end)) {
      setDraft((p) =>
        p ? { ...p, active_hours_start: "09:00", active_hours_end: "18:00" } : p
      )
    }
    setDirty(true)
  }

  const handleSave = () => {
    if (!draft) return
    saveMutation.mutate({
      enabled: draft.enabled,
      active_hours_start: hoursMode === "range" ? draft.active_hours_start : null,
      active_hours_end: hoursMode === "range" ? draft.active_hours_end : null,
      active_days: draft.active_days,
      timezone: draft.timezone,
      single_reply_only: draft.single_reply_only,
    })
  }

  if (isLoading || !draft) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-sm">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-5 animate-spin text-zinc-400" />
        </div>
      </Card>
    )
  }

  const meta = FEATURE_META[feature]
  const FeatureIcon = meta.icon
  const isEnabled = draft.enabled

  return (
    <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm overflow-hidden">
      {/* Master Switch */}
      <div
        className={cn(
          "relative flex items-center justify-between gap-4 p-4 border-b border-zinc-800/50 transition-colors",
          isEnabled ? meta.activeColor : "bg-zinc-950/40"
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-xl transition-all",
              isEnabled ? `${meta.iconBg} shadow-lg` : "bg-zinc-800/60"
            )}
          >
            <FeatureIcon className={cn("size-5", isEnabled ? meta.iconText : "text-zinc-500")} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-100">{meta.label} Ayarları</span>
              <span
                className={cn(
                  "text-[10px] font-bold uppercase rounded-md px-1.5 py-0.5 border",
                  isEnabled
                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                    : "text-zinc-500 bg-zinc-800 border-zinc-700"
                )}
              >
                {isEnabled ? "Aktif" : "Kapalı"}
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              {isEnabled ? meta.desc : `${meta.label} devre dışı`}
            </p>
          </div>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={(v: boolean) => updateDraft("enabled", v)}
        />
      </div>

      {/* Zamanlı için: sadece master switch + bilgi — saat/gün gereksiz */}
      {feature === "scheduled" ? (
        <CardContent className="p-4">
          <div className="flex items-start gap-2 rounded-lg bg-zinc-950/40 border border-zinc-800/60 p-3">
            <SettingsIcon className="size-3.5 shrink-0 mt-0.5 text-zinc-500" />
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Zamanlı kampanyalar <span className="text-zinc-200">oluştururken seçtiğin tarih ve saatte</span> gönderilir.
              Bu ayar sadece tüm zamanlı kampanyaların <span className="text-zinc-200">çalışmasını durdurmak/devam ettirmek</span> için var.
              Master switch kapalıyken hiçbir zamanlı kampanya tetiklenmez, silinmez — tekrar açınca zamanı geçmişse hemen, geçmemişse tarihinde çalışır.
            </p>
          </div>
        </CardContent>
      ) : (
      <CardContent className="space-y-4 p-4">
        {/* Saat Aralığı */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
            <Clock className="size-3" />
            Çalışma Saatleri
          </Label>
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/40 p-1.5">
            <button
              onClick={() => handleHoursModeChange("always")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-all",
                hoursMode === "always"
                  ? "bg-blue-500/10 text-blue-400 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              24 Saat
            </button>
            <button
              onClick={() => handleHoursModeChange("range")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-all",
                hoursMode === "range"
                  ? "bg-amber-500/10 text-amber-400 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Saat Aralığı
            </button>
          </div>
          {hoursMode === "range" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-zinc-500 mb-1 block">Başlangıç</Label>
                <Input
                  type="time"
                  value={draft.active_hours_start ?? "09:00"}
                  onChange={(e) => updateDraft("active_hours_start", e.target.value)}
                  className="h-9 border-zinc-700 bg-zinc-950/60"
                />
              </div>
              <div>
                <Label className="text-[10px] text-zinc-500 mb-1 block">Bitiş</Label>
                <Input
                  type="time"
                  value={draft.active_hours_end ?? "18:00"}
                  onChange={(e) => updateDraft("active_hours_end", e.target.value)}
                  className="h-9 border-zinc-700 bg-zinc-950/60"
                />
              </div>
            </div>
          )}
        </div>

        {/* Aktif Günler */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
            <Calendar className="size-3" />
            Aktif Günler
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => {
              const active = draft.active_days.includes(d.value)
              return (
                <button
                  key={d.value}
                  onClick={() => toggleDay(d.value)}
                  className={cn(
                    "flex-1 min-w-[48px] rounded-lg border py-2 text-xs font-semibold transition-all",
                    active
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-zinc-800 bg-zinc-950/40 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                  )}
                >
                  {d.label}
                </button>
              )
            })}
          </div>
          <div className="flex gap-2 text-[10px]">
            <button
              onClick={() => updateDraft("active_days", [1, 2, 3, 4, 5])}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Hafta içi
            </button>
            <span className="text-zinc-700">·</span>
            <button
              onClick={() => updateDraft("active_days", [0, 1, 2, 3, 4, 5, 6])}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Tümü
            </button>
            <span className="text-zinc-700">·</span>
            <button
              onClick={() => updateDraft("active_days", [0, 6])}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Hafta sonu
            </button>
          </div>
        </div>

        {/* Sadece autoreply'e özel: tüm kurallardan 1 cevap kilidi */}
        {feature === "autoreply" && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-zinc-200">
                    Kişi başına 1 oto-cevap
                  </div>
                  <span className="text-[9px] font-bold rounded px-1.5 py-0.5 bg-pink-500/10 text-pink-300 border border-pink-500/20">
                    GLOBAL
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                  Aktifse, aynı kişiye <span className="text-zinc-300">hangi kural olursa olsun</span> toplamda sadece 1 cevap gönderilir.
                  Kural bazlı ayarların üstünde çalışır.
                </p>
              </div>
              <Switch
                checked={draft.single_reply_only ?? false}
                onCheckedChange={(v: boolean) => updateDraft("single_reply_only", v)}
              />
            </div>
          </div>
        )}

        {/* Kaydet */}
        {dirty && (
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="w-full bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20"
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 size-4" />
            )}
            Ayarları Kaydet
          </Button>
        )}

        <div className="flex items-start gap-2 rounded-lg bg-zinc-950/40 border border-zinc-800/60 p-2.5">
          <SettingsIcon className="size-3.5 shrink-0 mt-0.5 text-zinc-500" />
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Bu ayarlar <span className="text-zinc-300">sadece {meta.label.toLowerCase()}</span> için
            geçerlidir. Saat aralığı dışında veya pasif günlerde otomasyon devreye girmez.
          </p>
        </div>
      </CardContent>
      )}
    </Card>
  )
}
