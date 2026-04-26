

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  FolderOpen,
  Trash2,
  ChevronRight,
  Loader2,
  Inbox,
  FileSpreadsheet,
  Send,
} from "lucide-react"
import { cn } from "@/lib/utils"
import toast from "react-hot-toast"
import { ImportListDialog } from "./ImportListDialog"
import { useConfirm } from "@/components/ui/confirm-dialog"

interface List {
  id: string
  name: string
  items_count?: [{ count: number }]
  sent_count?: number
  created_at: string
}

export function SavedLists({ onSelectList }: { onSelectList: (id: string, name: string) => void }) {
  const queryClient = useQueryClient()
  const [importOpen, setImportOpen] = useState(false)
  const confirmDialog = useConfirm()

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ["lists"],
    queryFn: () => api.get<List[]>("/api/lists"),
    staleTime: 30_000,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/lists/${id}`),
    onSuccess: () => {
      toast.success("Liste silindi")
      queryClient.invalidateQueries({ queryKey: ["lists"] })
    },
    onError: () => toast.error("Liste silinemedi"),
  })

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Liste silinsin mi?",
      description: "Bu liste kalıcı olarak silinecek. İçerdiği işletmeler silinmez ama listeden çıkarılır.",
      confirmText: "Evet, sil",
      variant: "danger",
    })
    if (!ok) return
    deleteMutation.mutate(id)
  }

  const importButton = (
    <Button
      onClick={() => setImportOpen(true)}
      className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20 font-semibold rounded-xl"
    >
      <FileSpreadsheet className="mr-2 size-4" />
      Excel'den Ekle
    </Button>
  )

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (lists.length === 0) {
    return (
      <>
        <div className="flex justify-end mb-4">{importButton}</div>
        <div className="flex h-[400px] flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/20 p-8 text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-zinc-900 shadow-inner">
            <Inbox className="size-8 text-zinc-700" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-200">Henüz listeniz yok</h3>
          <p className="mt-2 max-w-sm text-sm text-zinc-500">
            İşletmeleri tablodan seçip "Listeye Kaydet" butonuna basarak ya da üstteki
            <span className="text-emerald-400 font-medium"> Excel'den Ekle </span>
            butonuyla telefon numaralarınızdan liste oluşturabilirsiniz.
          </p>
        </div>
        <ImportListDialog open={importOpen} onOpenChange={setImportOpen} />
      </>
    )
  }

  return (
    <>
      <div className="flex justify-end">{importButton}</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
      {lists.map((list) => {
        const count = list.items_count?.[0]?.count || 0
        const sent = list.sent_count || 0
        const messaged = sent > 0
        const pct = count > 0 ? Math.min(100, Math.round((sent / count) * 100)) : 0
        return (
          <Card
            key={list.id}
            onClick={() => onSelectList(list.id, list.name)}
            className={cn(
              "group/list relative cursor-pointer transition-all overflow-hidden",
              messaged
                ? "border-emerald-500/40 bg-emerald-500/[0.04] hover:border-emerald-500/70 hover:bg-emerald-500/[0.07]"
                : "border-zinc-800 bg-zinc-900/40 hover:border-blue-500/50 hover:bg-zinc-900/60"
            )}
          >
            {messaged && (
              <span className="absolute top-0 left-0 h-full w-1 bg-gradient-to-b from-emerald-400 to-emerald-600" />
            )}
            <CardContent className="flex items-center gap-3 p-4">
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-xl shrink-0",
                  messaged
                    ? "bg-emerald-500/15 group-hover/list:bg-emerald-500/25"
                    : "bg-blue-500/10 group-hover/list:bg-blue-500/20"
                )}
              >
                <FolderOpen
                  className={cn(
                    "size-5",
                    messaged ? "text-emerald-400" : "text-blue-400"
                  )}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100 group-hover/list:text-white line-clamp-1">
                    {list.name}
                  </h3>
                  {messaged && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 shrink-0">
                      <Send className="size-2.5" />
                      {sent}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {count.toLocaleString("tr-TR")} işletme
                  {messaged && (
                    <span className="text-emerald-400/80">
                      {" · "}
                      {sent}/{count} mesaj (%{pct})
                    </span>
                  )}
                  {!messaged && (
                    <>
                      {" · "}
                      {new Date(list.created_at).toLocaleDateString("tr-TR")}
                    </>
                  )}
                </p>
                {messaged && count > 0 && (
                  <div className="mt-1.5 flex h-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/list:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(list.id)
                  }}
                  className="size-8 text-zinc-400 hover:bg-red-500/10 hover:text-red-400 rounded-lg"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <ChevronRight className="size-4 text-zinc-600 transition-transform group-hover/list:translate-x-0.5" />
            </CardContent>
          </Card>
        )
      })}
      </div>
      <ImportListDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  )
}
