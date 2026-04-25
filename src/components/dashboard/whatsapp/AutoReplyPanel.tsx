import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Bot,
  Plus,
  X,
  Save,
  Loader2,
  Trash2,
  Zap,
  Tags,
  MessageSquare,
  Info,
  Edit3,
  Check,
  FileText,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  listAutoRules,
  createAutoRule,
  updateAutoRule,
  deleteAutoRule,
  type AutoRule,
  type MatchType,
} from "@/lib/api-client"
import { AutomationSettingsCard } from "./AutomationSettingsCard"
import { TemplateManagerDialog } from "./TemplateManagerDialog"
import { useConfirm } from "@/components/ui/confirm-dialog"
import toast from "react-hot-toast"

const MATCH_OPTIONS: { value: MatchType; label: string; help: string }[] = [
  { value: "contains", label: "İçerir", help: "Mesajda kelime geçerse" },
  { value: "exact", label: "Tam eşleşme", help: "Mesaj sadece bu kelimeyse" },
  { value: "starts_with", label: "Başlarsa", help: "Mesaj bu kelimeyle başlıyorsa" },
]

interface RuleDraft {
  id?: string
  name: string
  keywords: string[]
  match_type: MatchType
  response: string
  enabled: boolean
  priority: number
  reply_once_per_contact: boolean
  cooldown_minutes: number
}

const EMPTY_DRAFT: RuleDraft = {
  name: "",
  keywords: [],
  match_type: "contains",
  response: "",
  enabled: true,
  priority: 0,
  reply_once_per_contact: false,
  cooldown_minutes: 0,
}

function RuleEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  draft: RuleDraft
  onChange: (next: RuleDraft) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const [keywordInput, setKeywordInput] = useState("")
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)

  const addKeyword = () => {
    const v = keywordInput.trim()
    if (!v) return
    if (draft.keywords.includes(v)) {
      toast.error("Bu kelime zaten var")
      return
    }
    onChange({ ...draft, keywords: [...draft.keywords, v] })
    setKeywordInput("")
  }

  const removeKeyword = (k: string) => {
    onChange({ ...draft, keywords: draft.keywords.filter((x) => x !== k) })
  }

  return (
    <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-zinc-900/40 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-purple-500/10">
            <Edit3 className="size-4 text-purple-400" />
          </div>
          <CardTitle className="text-base text-zinc-100">
            {draft.id ? "Kuralı Düzenle" : "Yeni Oto-Cevap Kuralı"}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1.5">
            Kural Adı
          </label>
          <Input
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="Örn. Fiyat soruları"
            className="h-9 border-zinc-700 bg-zinc-950/60"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1.5">
              Eşleşme Tipi
            </label>
            <Select
              value={draft.match_type}
              onValueChange={(v) =>
                onChange({ ...draft, match_type: (v as MatchType) || "contains" })
              }
            >
              <SelectTrigger className="h-9 border-zinc-700 bg-zinc-950/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATCH_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <div>
                      <div className="font-medium">{o.label}</div>
                      <div className="text-[10px] text-zinc-500">{o.help}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1.5">
              Öncelik (Yüksek = Önce)
            </label>
            <Input
              type="number"
              value={draft.priority}
              onChange={(e) => onChange({ ...draft, priority: Number(e.target.value) })}
              className="h-9 border-zinc-700 bg-zinc-950/60"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1.5">
            Anahtar Kelimeler
          </label>
          <div className="flex gap-2 mb-2">
            <Input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addKeyword()
                }
              }}
              placeholder="Kelime yazıp Enter'a basın..."
              className="h-9 border-zinc-700 bg-zinc-950/60"
            />
            <Button
              onClick={addKeyword}
              size="sm"
              variant="ghost"
              className="h-9 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
            >
              <Plus className="size-4" />
            </Button>
          </div>
          {draft.keywords.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
              {draft.keywords.map((k) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 rounded-md border border-purple-500/20 bg-purple-500/5 px-2 py-1 text-[11px] text-purple-300"
                >
                  {k}
                  <button
                    onClick={() => removeKeyword(k)}
                    className="text-purple-400 hover:text-red-400 transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500">
              En az bir kelime ekleyin (örn: "fiyat", "merhaba", "bilgi")
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500">
              Otomatik Cevap
            </label>
            <Button
              onClick={() => setTemplatePickerOpen(true)}
              size="sm"
              variant="ghost"
              className="h-7 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
              type="button"
            >
              <FileText className="mr-1 size-3" />
              Şablondan Yükle
            </Button>
          </div>
          <Textarea
            value={draft.response}
            onChange={(e) => onChange({ ...draft, response: e.target.value })}
            rows={3}
            className="border-zinc-700 bg-zinc-950/60 resize-none"
            placeholder="Bu kelime gelince gönderilecek cevap..."
          />
        </div>

        <TemplateManagerDialog
          open={templatePickerOpen}
          onOpenChange={setTemplatePickerOpen}
          onSelect={(tpl) => {
            onChange({ ...draft, response: tpl.content })
            toast.success(`"${tpl.name}" yüklendi`)
          }}
        />

        {/* Gönderim Davranışı */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 space-y-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
            Gönderim Davranışı
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="text-sm font-medium text-zinc-200">Sadece 1 kez gönder</div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Aynı kişiye aynı kuraldan sadece bir kez cevap verilir
              </p>
            </div>
            <Switch
              checked={draft.reply_once_per_contact}
              onCheckedChange={(v: boolean) =>
                onChange({ ...draft, reply_once_per_contact: v })
              }
            />
          </div>
          {!draft.reply_once_per_contact && (
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">
                Bekleme süresi (dakika)
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={draft.cooldown_minutes}
                  onChange={(e) =>
                    onChange({ ...draft, cooldown_minutes: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="h-9 border-zinc-700 bg-zinc-900/60 max-w-[100px]"
                />
                <p className="text-[11px] text-zinc-500">
                  {draft.cooldown_minutes === 0
                    ? "Her mesaja cevap verilir (sınırsız)"
                    : `Son cevaptan sonra ${draft.cooldown_minutes} dk cevap yok`}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button onClick={onCancel} variant="ghost" className="text-zinc-400">
            İptal
          </Button>
          <Button
            onClick={onSave}
            disabled={
              saving ||
              !draft.name.trim() ||
              !draft.response.trim() ||
              draft.keywords.length === 0
            }
            className="bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/20"
          >
            {saving ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 size-4" />
            )}
            {draft.id ? "Güncelle" : "Kaydet"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function RuleCard({
  rule,
  onEdit,
  onToggle,
  onDelete,
}: {
  rule: AutoRule
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <Card
      className={cn(
        "border backdrop-blur-sm transition-all hover:border-zinc-700",
        rule.enabled
          ? "border-zinc-800 bg-zinc-900/40"
          : "border-zinc-800/50 bg-zinc-900/20 opacity-60"
      )}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={cn(
                "flex size-9 items-center justify-center rounded-lg shrink-0",
                rule.enabled ? "bg-purple-500/10" : "bg-zinc-800/60"
              )}
            >
              <Zap
                className={cn(
                  "size-4",
                  rule.enabled ? "text-purple-400" : "text-zinc-600"
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-sm font-semibold text-zinc-100 truncate">{rule.name}</h3>
                {rule.priority > 0 && (
                  <span className="text-[9px] font-bold rounded px-1.5 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/20">
                    P{rule.priority}
                  </span>
                )}
                {rule.reply_once_per_contact && (
                  <span
                    title="Aynı kişiye sadece 1 kez"
                    className="text-[9px] font-bold rounded px-1.5 py-0.5 bg-pink-500/10 text-pink-300 border border-pink-500/20"
                  >
                    TEK
                  </span>
                )}
                {!rule.reply_once_per_contact && rule.cooldown_minutes > 0 && (
                  <span
                    title={`${rule.cooldown_minutes} dk bekleme`}
                    className="text-[9px] font-bold rounded px-1.5 py-0.5 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                  >
                    {rule.cooldown_minutes}DK
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 line-clamp-2">{rule.response}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Switch checked={rule.enabled} onCheckedChange={onToggle} />
            <Button
              onClick={onEdit}
              size="icon"
              variant="ghost"
              className="size-8 text-zinc-500 hover:text-zinc-200"
            >
              <Edit3 className="size-3.5" />
            </Button>
            <Button
              onClick={onDelete}
              size="icon"
              variant="ghost"
              className="size-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-3 border-t border-zinc-800/60">
          <Tags className="size-3 text-zinc-500" />
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            {MATCH_OPTIONS.find((o) => o.value === rule.match_type)?.label}:
          </span>
          <div className="flex flex-wrap gap-1">
            {rule.keywords.map((k) => (
              <span
                key={k}
                className="inline-flex items-center rounded bg-zinc-800/60 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300"
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function AutoReplyPanel() {
  const queryClient = useQueryClient()
  const confirmDialog = useConfirm()
  const [editing, setEditing] = useState<RuleDraft | null>(null)

  const { data: allRules = [], isLoading } = useQuery({
    queryKey: ["autoRules"],
    queryFn: listAutoRules,
  })

  const keywordRules = useMemo(
    () => allRules.filter((r) => r.type === "keyword"),
    [allRules]
  )

  const saveMutation = useMutation({
    mutationFn: async (draft: RuleDraft) => {
      if (draft.id) {
        return updateAutoRule(draft.id, {
          name: draft.name,
          keywords: draft.keywords,
          match_type: draft.match_type,
          response: draft.response,
          enabled: draft.enabled,
          priority: draft.priority,
          reply_once_per_contact: draft.reply_once_per_contact,
          cooldown_minutes: draft.cooldown_minutes,
        })
      }
      return createAutoRule({
        type: "keyword",
        name: draft.name,
        keywords: draft.keywords,
        match_type: draft.match_type,
        response: draft.response,
        enabled: draft.enabled,
        priority: draft.priority,
        reply_once_per_contact: draft.reply_once_per_contact,
        cooldown_minutes: draft.cooldown_minutes,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autoRules"] })
      setEditing(null)
      toast.success("Kural kaydedildi")
    },
    onError: (e: any) => toast.error(e.message || "Kaydedilemedi"),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateAutoRule(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["autoRules"] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAutoRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autoRules"] })
      toast.success("Kural silindi")
    },
  })

  return (
    <div className="space-y-4">
      {/* Oto-cevap ayarları */}
      <AutomationSettingsCard feature="autoreply" />

      {/* Bilgi */}
      <Card className="border-blue-500/20 bg-blue-500/5 backdrop-blur-sm">
        <CardContent className="flex gap-3 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
            <Info className="size-4 text-blue-400" />
          </div>
          <div className="text-xs leading-relaxed text-zinc-300">
            <p className="font-medium text-zinc-200 mb-1">Oto-Cevap Nasıl Çalışır?</p>
            <p className="text-zinc-400">
              Birisi size mesaj gönderdiğinde, mesajda geçen anahtar kelimelere göre otomatik cevap verilir.
              Birden fazla kural eşleşirse <span className="text-amber-400 font-medium">öncelik</span> yüksek olan kazanır.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Yeni / Düzenleme Editörü */}
      {editing ? (
        <RuleEditor
          draft={editing}
          onChange={setEditing}
          onSave={() => saveMutation.mutate(editing)}
          onCancel={() => setEditing(null)}
          saving={saveMutation.isPending}
        />
      ) : (
        <Button
          onClick={() => setEditing({ ...EMPTY_DRAFT })}
          className="w-full h-12 bg-purple-600 hover:bg-purple-500 text-white font-semibold shadow-lg shadow-purple-900/20"
        >
          <Plus className="mr-2 size-5" />
          Yeni Oto-Cevap Kuralı Ekle
        </Button>
      )}

      {/* Kurallar Listesi */}
      <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-purple-500/10">
              <Bot className="size-4 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-base text-zinc-100">Aktif Kurallar</CardTitle>
              <p className="text-[11px] text-zinc-500">
                {isLoading ? "Yükleniyor..." : `${keywordRules.length} kural tanımlı`}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-zinc-500" />
            </div>
          ) : keywordRules.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-zinc-800/80 mb-3">
                <MessageSquare className="size-6 text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-400 font-medium mb-1">Henüz kural yok</p>
              <p className="text-xs text-zinc-500">
                Yukarıdan yeni bir oto-cevap kuralı ekleyin
              </p>
            </div>
          ) : (
            keywordRules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onEdit={() =>
                  setEditing({
                    id: rule.id,
                    name: rule.name,
                    keywords: rule.keywords,
                    match_type: rule.match_type,
                    response: rule.response,
                    enabled: rule.enabled,
                    priority: rule.priority,
                    reply_once_per_contact: rule.reply_once_per_contact ?? false,
                    cooldown_minutes: rule.cooldown_minutes ?? 0,
                  })
                }
                onToggle={() =>
                  toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled })
                }
                onDelete={async () => {
                  const ok = await confirmDialog({
                    title: "Kural silinsin mi?",
                    description: `"${rule.name}" kuralı kalıcı olarak silinecek.`,
                    confirmText: "Evet, sil",
                    variant: "danger",
                  })
                  if (ok) deleteMutation.mutate(rule.id)
                }}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
