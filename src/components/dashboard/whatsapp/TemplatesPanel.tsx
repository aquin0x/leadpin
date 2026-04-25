import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  FileText,
  Plus,
  Edit3,
  Trash2,
  Loader2,
  Save,
  Info,
  Copy,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  listMessageTemplates,
  createMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
  type MessageTemplate,
} from "@/lib/api-client"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useIsLinkOwner } from "@/hooks/useIsLinkOwner"
import toast from "react-hot-toast"

interface Draft {
  id?: string
  name: string
  content: string
}

export function TemplatesPanel() {
  const queryClient = useQueryClient()
  const confirmDialog = useConfirm()
  const { isLinkOwner } = useIsLinkOwner()
  const [editing, setEditing] = useState<Draft | null>(null)

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["messageTemplates"],
    queryFn: listMessageTemplates,
    staleTime: 30_000,
  })

  const saveMutation = useMutation({
    mutationFn: async (d: Draft) => {
      if (d.id) return updateMessageTemplate(d.id, { name: d.name, content: d.content })
      return createMessageTemplate({ name: d.name, content: d.content })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messageTemplates"] })
      setEditing(null)
      toast.success("Şablon kaydedildi")
    },
    onError: (e: any) => toast.error(e.message || "Kaydedilemedi"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMessageTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messageTemplates"] })
      toast.success("Şablon silindi")
    },
    onError: (e: any) => toast.error(e.message || "Silinemedi"),
  })

  const handleDelete = async (t: MessageTemplate) => {
    const ok = await confirmDialog({
      title: "Şablon silinsin mi?",
      description: `"${t.name}" şablonu kalıcı olarak silinecek.`,
      confirmText: "Evet, sil",
      variant: "danger",
    })
    if (!ok) return
    deleteMutation.mutate(t.id)
  }

  const handleDuplicate = (t: MessageTemplate) => {
    setEditing({ name: `${t.name} (kopya)`, content: t.content })
  }

  return (
    <div className="space-y-4">
      {/* Bilgi */}
      <Card className="border-blue-500/20 bg-blue-500/5 backdrop-blur-sm">
        <CardContent className="flex gap-3 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
            <Info className="size-4 text-blue-400" />
          </div>
          <div className="text-xs leading-relaxed text-zinc-300">
            <p className="font-medium text-zinc-200 mb-1">Mesaj Şablonları</p>
            <p className="text-zinc-400">
              Toplu Mesaj, Oto-Cevap ve Karşılama kısımlarında kullanabileceğiniz mesaj şablonları.
              Değişkenler:{" "}
              <code className="text-emerald-400">{"{name}"}</code>,{" "}
              {isLinkOwner && (
                <>
                  <code className="text-cyan-400">{"{link}"}</code>,{" "}
                </>
              )}
              <code className="text-emerald-400">{"{phone}"}</code>,{" "}
              <code className="text-emerald-400">{"{greeting}"}</code>
              {isLinkOwner && (
                <>
                  <br />
                  <span className="text-[10px]">
                    <code className="text-cyan-400">{"{link}"}</code>, her işletmeye özel kısa link oluşturur (tıklamalar takip edilir).
                  </span>
                </>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Editör */}
      {editing ? (
        <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-zinc-900/40 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10">
                <Edit3 className="size-4 text-blue-400" />
              </div>
              <CardTitle className="text-base text-zinc-100">
                {editing.id ? "Şablonu Düzenle" : "Yeni Şablon"}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                Şablon Adı
              </Label>
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Örn. Kahveciler Hoşgeldin"
                className="mt-1 h-10 border-zinc-700 bg-zinc-950/60"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                Mesaj İçeriği
              </Label>
              <Textarea
                value={editing.content}
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                rows={6}
                placeholder="Merhaba {name}, ..."
                className="mt-1 border-zinc-700 bg-zinc-950/60 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEditing(null)} variant="ghost" className="text-zinc-400">
                İptal
              </Button>
              <Button
                onClick={() => saveMutation.mutate(editing)}
                disabled={
                  saveMutation.isPending ||
                  !editing.name.trim() ||
                  !editing.content.trim()
                }
                className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 size-4" />
                )}
                {editing.id ? "Güncelle" : "Kaydet"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          onClick={() => setEditing({ name: "", content: "" })}
          className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-900/20"
        >
          <Plus className="mr-2 size-5" />
          Yeni Şablon Oluştur
        </Button>
      )}

      {/* Liste */}
      <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/10">
              <FileText className="size-4 text-indigo-400" />
            </div>
            <div>
              <CardTitle className="text-base text-zinc-100">Kayıtlı Şablonlar</CardTitle>
              <p className="text-[11px] text-zinc-500">
                {isLoading ? "Yükleniyor..." : `${templates.length} şablon kayıtlı`}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-zinc-500" />
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-zinc-800/80 mb-3">
                <FileText className="size-6 text-zinc-600" />
              </div>
              <p className="text-sm font-medium text-zinc-300 mb-1">Henüz şablon yok</p>
              <p className="text-xs text-zinc-500">
                Yukarıdan "Yeni Şablon Oluştur" ile başlayın
              </p>
            </div>
          ) : (
            templates.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 transition-all hover:border-zinc-700"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h4 className="text-sm font-semibold text-zinc-100 truncate">
                        {t.name}
                      </h4>
                      <span className="text-[10px] text-zinc-500 shrink-0">
                        {new Date(t.created_at).toLocaleDateString("tr-TR")}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                      {t.content}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1">
                      <Button
                        onClick={() => handleDuplicate(t)}
                        size="icon"
                        variant="ghost"
                        className="size-8 text-zinc-500 hover:text-zinc-200"
                        title="Kopyala"
                      >
                        <Copy className="size-3.5" />
                      </Button>
                      <Button
                        onClick={() =>
                          setEditing({ id: t.id, name: t.name, content: t.content })
                        }
                        size="icon"
                        variant="ghost"
                        className="size-8 text-zinc-500 hover:text-zinc-200"
                        title="Düzenle"
                      >
                        <Edit3 className="size-3.5" />
                      </Button>
                      <Button
                        onClick={() => handleDelete(t)}
                        size="icon"
                        variant="ghost"
                        className="size-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                        title="Sil"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
