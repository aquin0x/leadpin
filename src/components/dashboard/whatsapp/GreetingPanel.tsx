import { useMemo, useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Hand,
  Save,
  Loader2,
  Power,
  Trash2,
  Info,
  FileText,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import {
  listAutoRules,
  createAutoRule,
  updateAutoRule,
  deleteAutoRule,
} from "@/lib/api-client"
import { AutomationSettingsCard } from "./AutomationSettingsCard"
import { TemplateManagerDialog } from "./TemplateManagerDialog"
import { useConfirm } from "@/components/ui/confirm-dialog"
import toast from "react-hot-toast"

const DEFAULT_GREETING =
  "Merhaba! Bizi tercih ettiğiniz için teşekkürler. En kısa sürede size dönüş yapacağız."

export function GreetingPanel() {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState(DEFAULT_GREETING)
  const [name, setName] = useState("Karşılama Mesajı")
  const [enabled, setEnabled] = useState(true)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const confirmDialog = useConfirm()

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["autoRules"],
    queryFn: listAutoRules,
  })

  const greetingRule = useMemo(() => rules.find((r) => r.type === "greeting"), [rules])

  useEffect(() => {
    if (greetingRule) {
      setMessage(greetingRule.response)
      setName(greetingRule.name)
      setEnabled(greetingRule.enabled)
    }
  }, [greetingRule?.id])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (greetingRule) {
        return updateAutoRule(greetingRule.id, { response: message, name, enabled })
      }
      return createAutoRule({
        type: "greeting",
        name,
        response: message,
        keywords: [],
        match_type: "contains",
        enabled,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autoRules"] })
      toast.success("Karşılama mesajı kaydedildi")
    },
    onError: (e: any) => toast.error(e.message || "Kaydedilemedi"),
  })

  const toggleMutation = useMutation({
    mutationFn: (next: boolean) => {
      if (!greetingRule) throw new Error("Önce kaydedin")
      return updateAutoRule(greetingRule.id, { enabled: next })
    },
    onSuccess: (_, variables) => {
      setEnabled(variables)
      queryClient.invalidateQueries({ queryKey: ["autoRules"] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!greetingRule) throw new Error("Silinecek kural yok")
      return deleteAutoRule(greetingRule.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autoRules"] })
      setMessage(DEFAULT_GREETING)
      toast.success("Karşılama kaldırıldı")
    },
  })

  const handleToggle = (next: boolean) => {
    if (!greetingRule) {
      setEnabled(next)
      return
    }
    toggleMutation.mutate(next)
  }

  return (
    <div className="space-y-4">
      {/* Karşılama ayarları */}
      <AutomationSettingsCard feature="greeting" />

      {/* Bilgi kartı */}
      <Card className="border-blue-500/20 bg-blue-500/5 backdrop-blur-sm">
        <CardContent className="flex gap-3 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
            <Info className="size-4 text-blue-400" />
          </div>
          <div className="text-xs leading-relaxed text-zinc-300">
            <p className="font-medium text-zinc-200 mb-1">Karşılama Mesajı Nasıl Çalışır?</p>
            <p className="text-zinc-400">
              Size <span className="text-emerald-400 font-medium">ilk kez</span> mesaj yazan kişilere bu mesaj otomatik olarak gönderilir.
              Aynı kişiye bir daha gönderilmez.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Konfigürasyon */}
      <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-pink-500/10">
              <Hand className="size-4 text-pink-400" />
            </div>
            <div>
              <CardTitle className="text-base text-zinc-100">Karşılama Mesajı</CardTitle>
              <p className="text-[11px] text-zinc-500">Otomatik ilk-karşılama</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-1.5">
            <Power className={`size-3.5 ${enabled ? "text-emerald-400" : "text-zinc-600"}`} />
            <Switch checked={enabled} onCheckedChange={handleToggle} />
            <span className={`text-[11px] font-medium ${enabled ? "text-emerald-400" : "text-zinc-500"}`}>
              {enabled ? "Aktif" : "Pasif"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-zinc-500" />
            </div>
          ) : (
            <>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1.5">
                  Kural adı
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9 border-zinc-700 bg-zinc-950/60"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500">
                    Mesaj içeriği
                  </label>
                  <Button
                    onClick={() => setTemplatePickerOpen(true)}
                    size="sm"
                    variant="ghost"
                    className="h-7 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                  >
                    <FileText className="mr-1 size-3" />
                    Şablondan Yükle
                  </Button>
                </div>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  className="border-zinc-700 bg-zinc-950/60 resize-none"
                  placeholder="Karşılama mesajınızı yazın..."
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                {greetingRule && (
                  <Button
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: "Karşılama silinsin mi?",
                        description: "Karşılama mesajı kaldırılacak. Yeni gelen mesajlara otomatik cevap verilmez.",
                        confirmText: "Evet, sil",
                        variant: "danger",
                      })
                      if (ok) deleteMutation.mutate()
                    }}
                    variant="ghost"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="mr-1.5 size-4" />
                    Kaldır
                  </Button>
                )}
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !message.trim()}
                  className="ml-auto bg-pink-600 hover:bg-pink-500 text-white shadow-lg shadow-pink-900/20"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 size-4" />
                  )}
                  {greetingRule ? "Güncelle" : "Kaydet"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <TemplateManagerDialog
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        onSelect={(tpl) => {
          setMessage(tpl.content)
          toast.success(`"${tpl.name}" yüklendi`)
        }}
      />
    </div>
  )
}
