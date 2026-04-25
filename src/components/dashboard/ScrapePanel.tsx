import { useEffect, useState } from "react"
import { Loader2, Target, CheckCircle2, AlertCircle, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "./StatusBadge"
import { startScrape } from "@/lib/api-client"
import { useScrapeJob } from "@/hooks/useScrapeJob"
import toast from "react-hot-toast"

const trCollator = new Intl.Collator("tr", { numeric: true, sensitivity: "base" })
const sortByName = <T extends { name?: string }>(arr: T[]): T[] =>
  [...arr].sort((a, b) => trCollator.compare(a.name || "", b.name || ""))

interface ScrapePanelProps {
  onComplete?: () => void
}

export function ScrapePanel({ onComplete }: ScrapePanelProps) {
  const [provinces, setProvinces] = useState<any[]>([])
  const [districts, setDistricts] = useState<any[]>([])
  const [neighborhoods, setNeighborhoods] = useState<any[]>([])

  const [loadingProvinces, setLoadingProvinces] = useState(false)
  const [loadingDistricts, setLoadingDistricts] = useState(false)
  const [loadingNeighborhoods, setLoadingNeighborhoods] = useState(false)

  const [category, setCategory] = useState("")
  const [city, setCity] = useState("")
  const [district, setDistrict] = useState("")
  const [neighborhood, setNeighborhood] = useState("")
  const [jobId, setJobId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { job } = useScrapeJob(jobId)

  useEffect(() => {
    setLoadingProvinces(true)
    fetch("https://turkiyeapi.dev/api/v1/provinces")
      .then((res) => res.json())
      .then((res) => setProvinces(sortByName(res.data || [])))
      .catch(() => toast.error("Şehirler yüklenemedi"))
      .finally(() => setLoadingProvinces(false))
  }, [])

  const handleCityChange = (val: string | null) => {
    if (!val) return
    setCity(val)
    setDistrict("")
    setNeighborhood("")
    setDistricts([])
    setNeighborhoods([])
    const p = provinces.find((x) => x.name === val)
    if (p) {
      setLoadingDistricts(true)
      fetch(`https://turkiyeapi.dev/api/v1/provinces/${p.id}`)
        .then((r) => r.json())
        .then((r) => setDistricts(sortByName(r.data.districts || [])))
        .finally(() => setLoadingDistricts(false))
    }
  }

  const handleDistrictChange = (val: string | null) => {
    if (!val) return
    setDistrict(val)
    setNeighborhood("")
    setNeighborhoods([])
    const d = districts.find((x) => x.name === val)
    if (d) {
      setLoadingNeighborhoods(true)
      fetch(`https://turkiyeapi.dev/api/v1/districts/${d.id}`)
        .then((r) => r.json())
        .then((r) => setNeighborhoods(sortByName(r.data.neighborhoods || [])))
        .finally(() => setLoadingNeighborhoods(false))
    }
  }

  const handleSubmit = async () => {
    if (!category.trim() || !city) {
      toast.error("Kategori ve şehir zorunlu")
      return
    }
    setSubmitting(true)
    try {
      const r = await startScrape({
        category: category.trim(),
        city,
        district: district || undefined,
        neighborhood: neighborhood || undefined,
      })
      setJobId(r.jobId)
      toast.success("Tarama başlatıldı")
    } catch {
      toast.error("Başlatılamadı")
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setJobId(null)
    setCategory("")
    setCity("")
    setDistrict("")
    setNeighborhood("")
    onComplete?.()
  }

  const isRunning =
    jobId !== null &&
    job?.status !== "completed" &&
    job?.status !== "failed" &&
    job?.status !== "stopped"
  const isDone = job?.status === "completed"
  const isFailed = job?.status === "failed" || job?.status === "stopped"

  // ============ PROGRESS STATE ============
  if (jobId) {
    return (
      <section className="flex w-full flex-col gap-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-zinc-900/40 p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Target className="size-4 text-emerald-400" />
            {isDone ? "Tarama Tamamlandı" : isFailed ? "Tarama Durdu" : "Tarama Çalışıyor"}
          </h3>
          {(isDone || isFailed) && (
            <button
              onClick={handleClose}
              className="text-zinc-500 hover:text-zinc-200 transition-colors"
              title="Kapat"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="flex flex-col items-center gap-3 py-2">
          {isRunning && (
            <div className="relative">
              <Loader2 className="size-10 animate-spin text-emerald-400" />
              <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400/10" />
            </div>
          )}
          {isDone && <CheckCircle2 className="size-10 text-emerald-400" />}
          {isFailed && <AlertCircle className="size-10 text-red-400" />}

          <div className="text-center">
            <p className="text-sm font-semibold text-zinc-200">
              {isDone
                ? `${job?.total_leads ?? job?.current_lead ?? 0} işletme eklendi`
                : isFailed
                  ? "Tarama başarısız oldu"
                  : `${job?.current_lead ?? 0} bulundu`}
            </p>
            {job && <StatusBadge status={job.status} className="mt-1" />}
          </div>
        </div>

        {job && job.total_leads && !isDone && !isFailed && (
          <div className="space-y-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                style={{
                  width: `${Math.min((job.current_lead / job.total_leads) * 100, 100)}%`,
                }}
              />
            </div>
            <p className="text-center text-[11px] text-zinc-500">
              {job.current_lead} / {job.total_leads}
            </p>
          </div>
        )}

        {isFailed && job?.error_message && (
          <p className="rounded-lg bg-red-500/10 p-2 text-center text-xs text-red-400">
            {job.error_message}
          </p>
        )}

        {isDone && (
          <Button
            onClick={handleClose}
            className="w-full bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20"
          >
            Listeyi Göster
          </Button>
        )}
      </section>
    )
  }

  // ============ FORM STATE ============
  return (
    <section className="flex w-full flex-col gap-4 rounded-2xl border border-zinc-800/50 bg-zinc-900/40 p-5 backdrop-blur-sm">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-300 uppercase tracking-wider">
        <Target className="size-4 text-emerald-400" />
        Yeni Tarama
      </h3>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="scrape-category" className="text-xs text-zinc-500 font-bold uppercase">
            Sektör *
          </Label>
          <Input
            id="scrape-category"
            placeholder="Kafe, Kahveci..."
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 border-zinc-700 bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="scrape-city" className="text-xs text-zinc-500 font-bold uppercase">
            Şehir *
          </Label>
          <Select value={city} onValueChange={handleCityChange}>
            <SelectTrigger
              id="scrape-city"
              className="w-full h-9 border-zinc-700 bg-zinc-800/50 text-zinc-200"
            >
              <SelectValue
                placeholder={loadingProvinces ? "Yükleniyor..." : "Şehir seçin"}
              />
            </SelectTrigger>
            <SelectContent className="max-h-60 border-zinc-700 bg-zinc-900">
              {provinces.map((p) => (
                <SelectItem key={p.id} value={p.name}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="scrape-district" className="text-xs text-zinc-500 font-bold uppercase">
            İlçe
          </Label>
          <Select
            value={district}
            onValueChange={handleDistrictChange}
            disabled={!city || loadingDistricts}
          >
            <SelectTrigger
              id="scrape-district"
              className="w-full h-9 border-zinc-700 bg-zinc-800/50 text-zinc-200"
            >
              <SelectValue
                placeholder={loadingDistricts ? "Yükleniyor..." : "İlçe seçin"}
              />
            </SelectTrigger>
            <SelectContent className="max-h-60 border-zinc-700 bg-zinc-900">
              {districts.map((d) => (
                <SelectItem key={d.id} value={d.name}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="scrape-hood" className="text-xs text-zinc-500 font-bold uppercase">
            Mahalle
          </Label>
          <Select
            value={neighborhood}
            onValueChange={(val) => setNeighborhood(val || "")}
            disabled={!district || loadingNeighborhoods}
          >
            <SelectTrigger
              id="scrape-hood"
              className="w-full h-9 border-zinc-700 bg-zinc-800/50 text-zinc-200"
            >
              <SelectValue
                placeholder={loadingNeighborhoods ? "Yükleniyor..." : "Mahalle seçin"}
              />
            </SelectTrigger>
            <SelectContent className="max-h-60 border-zinc-700 bg-zinc-900">
              {neighborhoods.map((m) => (
                <SelectItem key={m.id} value={m.name}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full h-10 bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 font-semibold rounded-xl transition-all active:scale-[0.98]"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Başlatılıyor...
          </>
        ) : (
          <>
            <Target className="mr-2 size-4" />
            Taramayı Başlat
          </>
        )}
      </Button>
    </section>
  )
}
