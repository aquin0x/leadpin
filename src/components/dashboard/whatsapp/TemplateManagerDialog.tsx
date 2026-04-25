import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  FileText,
  Plus,
  Edit3,
  Trash2,
  Loader2,
  Save,
  X,
  Check,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect?: (tpl: MessageTemplate) => void
}

interface Draft {
  id?: string
  name: string
  content: string
}

export function TemplateManagerDialog({ open, onOpenChange, onSelect }: Props) {
  const queryClient = useQueryClient()
  const confirmDialog = useConfirm()
  const { isLinkOwner } = useIsLinkOwner()
  const [editing, setEditing] = useState<Draft | null>(null)

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["messageTemplates"],
    queryFn: listMessageTemplates,
    enabled: open,
    staleTime: 15_000,
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

  const handleSelect = (t: MessageTemplate) => {
    onSelect?.(t)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-zinc-800 bg-zinc-950 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10">
              <FileText className="size-4 text-blue-400" />
            </div>
            Mesaj Şablonları
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Editör */}
          {editing ? (
            <div className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-zinc-900/40 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Edit3 className="size-4 text-blue-400" />
                <span className="text-sm font-semibold text-zinc-100">
                  {editing.id ? "Şablonu Düzenle" : "Yeni Şablon"}
                </span>
              </div>
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
                  rows={5}
                  placeholder="Merhaba {name}, ..."
                  className="mt-1 border-zinc-700 bg-zinc-950/60 resize-none"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Değişkenler: <code className="text-emerald-400">{"{name}"}</code>,{" "}
                  {isLinkOwner && (
                    <>
                      <code className="text-cyan-400">{"{link}"}</code>,{" "}
                    </>
                  )}
                  <code className="text-emerald-400">{"{phone}"}</code>,{" "}
                  <code className="text-emerald-400">{"{greeting}"}</code>
                </p>
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
            </div>
          ) : (
            <Button
              onClick={() => setEditing({ name: "", content: "" })}
              className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-900/20"
            >
              <Plus className="mr-2 size-4" />
              Yeni Şablon
            </Button>
          )}

          {/* Liste */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-zinc-500" />
            </div>
          ) : templates.length === 0 && !editing ? (
            <div className="flex flex-col items-center py-10 text-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40">
              <div className="flex size-12 items-center justify-center rounded-full bg-zinc-900 mb-3">
                <FileText className="size-5 text-zinc-600" />
              </div>
              <p className="text-sm font-medium text-zinc-300">Henüz şablon yok</p>
              <p className="text-xs text-zinc-500 mt-1">
                Yukarıdan yeni şablon oluşturun
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "group rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 transition-all hover:border-zinc-700",
                    onSelect && "cursor-pointer hover:bg-zinc-900/60"
                  )}
                  onClick={() => onSelect && handleSelect(t)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-zinc-100 truncate">
                          {t.name}
                        </h4>
                        <span className="text-[10px] text-zinc-500 shrink-0">
                          {new Date(t.created_at).toLocaleDateString("tr-TR")}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                        {t.content}
                      </p>
                    </div>
                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {onSelect && (
                        <Button
                          onClick={() => handleSelect(t)}
                          size="sm"
                          variant="ghost"
                          className="h-8 text-emerald-400 hover:bg-emerald-500/10"
                        >
                          <Check className="mr-1 size-3.5" />
                          Kullan
                        </Button>
                      )}
                      <Button
                        onClick={() =>
                          setEditing({ id: t.id, name: t.name, content: t.content })
                        }
                        size="icon"
                        variant="ghost"
                        className="size-8 text-zinc-500 hover:text-zinc-200"
                      >
                        <Edit3 className="size-3.5" />
                      </Button>
                      <Button
                        onClick={() => handleDelete(t)}
                        size="icon"
                        variant="ghost"
                        className="size-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-zinc-800">
          <Button onClick={() => onOpenChange(false)} variant="ghost" className="text-zinc-400">
            <X className="mr-1.5 size-4" />
            Kapat
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
