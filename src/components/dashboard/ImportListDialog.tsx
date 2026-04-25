import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import * as XLSX from "xlsx"
import {
  Loader2,
  Upload,
  FileSpreadsheet,
  Info,
  Check,
  AlertCircle,
  Clipboard,
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
import { api } from "@/lib/api-client"
import toast from "react-hot-toast"

interface ImportListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Mode = "paste" | "excel"

export function ImportListDialog({ open, onOpenChange }: ImportListDialogProps) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>("paste")
  const [listName, setListName] = useState("")
  const [pasted, setPasted] = useState("")
  const [parsedPhones, setParsedPhones] = useState<string[]>([])
  const [fileName, setFileName] = useState("")

  // Pasted metinden numara çıkarma — satır, virgül, boşluk bölücü
  const phonesFromPaste = pasted
    .split(/[\s,;\n\r\t]+/)
    .map((p) => p.trim())
    .filter(Boolean)

  const effectivePhones = mode === "paste" ? phonesFromPaste : parsedPhones

  const importMutation = useMutation({
    mutationFn: () =>
      api.post<{ imported: number; newBusinesses: number; existingBusinesses: number }>(
        "/api/lists/import",
        { name: listName.trim(), phones: effectivePhones, source: mode === "excel" ? "excel" : "manual" }
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["lists"] })
      toast.success(
        `✓ ${res.imported} numara eklendi` +
          (res.newBusinesses > 0 ? ` (${res.newBusinesses} yeni)` : "")
      )
      handleClose()
    },
    onError: (e: any) => toast.error(e.message || "İçe aktarılamadı"),
  })

  const handleClose = () => {
    setListName("")
    setPasted("")
    setParsedPhones([])
    setFileName("")
    setMode("paste")
    onOpenChange(false)
  }

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" })

      const phones: string[] = []
      for (const row of rows) {
        for (const v of Object.values(row)) {
          const digits = String(v).replace(/\D/g, "")
          if (digits.length >= 10 && digits.length <= 15) {
            phones.push(String(v))
          }
        }
      }

      const uniq = Array.from(new Set(phones))
      setParsedPhones(uniq)
      if (uniq.length === 0) {
        toast.error("Excel dosyasında geçerli numara bulunamadı")
      } else {
        toast.success(`${uniq.length} numara bulundu`)
      }
    } catch (err) {
      console.error(err)
      toast.error("Excel dosyası okunamadı")
      setFileName("")
    }
  }

  const handleSubmit = () => {
    if (!listName.trim()) return toast.error("Liste adı zorunlu")
    if (effectivePhones.length === 0)
      return toast.error("En az bir numara ekleyin")
    importMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl border-zinc-800 bg-zinc-950 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10">
              <FileSpreadsheet className="size-4 text-blue-400" />
            </div>
            Excel'den Liste İçe Aktar
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Format bilgisi */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                <Info className="size-4 text-amber-400" />
              </div>
              <div className="text-xs leading-relaxed text-zinc-300 space-y-2">
                <p className="font-semibold text-amber-300">
                  Telefon Numarası Formatı
                </p>
                <p className="text-zinc-400">
                  Numaralar aşağıdaki formatlardan <span className="text-emerald-400">birini</span> kullanmalı:
                </p>
                <div className="grid grid-cols-1 gap-1.5 mt-2">
                  {[
                    { fmt: "905XXXXXXXXX", ex: "905551234567", note: "Uluslararası (önerilen)" },
                    { fmt: "+905XXXXXXXXX", ex: "+905551234567", note: "+ işaretli" },
                    { fmt: "05XXXXXXXXX", ex: "05551234567", note: "Yerel (0 ile başlayan)" },
                    { fmt: "5XXXXXXXXX", ex: "5551234567", note: "10 haneli" },
                  ].map((f) => (
                    <div
                      key={f.fmt}
                      className="flex items-center justify-between gap-2 rounded-md bg-zinc-900/60 px-2 py-1.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Check className="size-3 shrink-0 text-emerald-400" />
                        <code className="text-[11px] font-mono text-emerald-300">{f.fmt}</code>
                        <span className="text-[10px] text-zinc-500 font-mono truncate">
                          (örn: {f.ex})
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 shrink-0">{f.note}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-start gap-1.5 mt-2 text-zinc-500">
                  <AlertCircle className="size-3 shrink-0 mt-0.5" />
                  <p>
                    Boşluk, tire veya parantez sorun değil — sadece rakamlar alınır.
                    Sistem otomatik olarak formatı düzeltir.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Liste adı */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400 font-bold uppercase">Liste Adı *</Label>
            <Input
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="Örn. WhatsApp Kampanya - Pazartesi"
              className="h-10 border-zinc-700 bg-zinc-900/60"
            />
          </div>

          {/* Mod Seçici */}
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-1.5">
            <button
              onClick={() => setMode("paste")}
              className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all ${
                mode === "paste"
                  ? "bg-blue-500/10 text-blue-400 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Clipboard className="size-4" />
              Yapıştır
            </button>
            <button
              onClick={() => setMode("excel")}
              className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all ${
                mode === "excel"
                  ? "bg-emerald-500/10 text-emerald-400 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <FileSpreadsheet className="size-4" />
              Excel Yükle
            </button>
          </div>

          {/* Mod İçerikleri */}
          {mode === "paste" ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400 font-bold uppercase">
                Numaralar (her satıra bir tane veya virgülle)
              </Label>
              <Textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={8}
                className="font-mono text-xs border-zinc-700 bg-zinc-900/60"
                placeholder={"905551234567\n905551234568\n+905551234569"}
              />
              {phonesFromPaste.length > 0 && (
                <p className="text-[11px] text-emerald-400">
                  ✓ {phonesFromPaste.length} satır algılandı
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400 font-bold uppercase">Excel Dosyası</Label>
              {fileName ? (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <FileSpreadsheet className="size-5 text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{fileName}</div>
                    <div className="text-[11px] text-emerald-400">
                      {parsedPhones.length} numara bulundu
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setFileName("")
                      setParsedPhones([])
                    }}
                    className="text-zinc-500 hover:text-red-400"
                  >
                    Değiştir
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 px-4 py-8 cursor-pointer transition-colors hover:border-zinc-600 hover:bg-zinc-900/60">
                  <Upload className="size-6 text-zinc-500 mb-2" />
                  <span className="text-sm text-zinc-300 font-medium">
                    Excel dosyası seçin
                  </span>
                  <span className="text-[11px] text-zinc-500 mt-1">
                    .xlsx, .xls, .csv — telefon numaralarını otomatik algılar
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleExcelUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          )}

          {/* Özet + Buton */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
            <div className="text-xs text-zinc-400">
              {effectivePhones.length > 0 ? (
                <>
                  <span className="text-emerald-400 font-semibold">
                    {effectivePhones.length}
                  </span>{" "}
                  numara aktarılacak
                </>
              ) : (
                "Henüz numara eklenmedi"
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleClose} variant="ghost" className="text-zinc-400">
                İptal
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  importMutation.isPending ||
                  !listName.trim() ||
                  effectivePhones.length === 0
                }
                className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
              >
                {importMutation.isPending ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 size-4" />
                )}
                Listeyi Oluştur
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
