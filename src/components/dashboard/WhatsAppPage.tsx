import { useState } from "react"
import { MessageCircle, Send, History, Radio, Hand, Bot, Clock, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { LineStatusCard } from "./whatsapp/LineStatusCard"
import { WhatsAppStatsCards } from "./whatsapp/WhatsAppStatsCards"
import { BulkSendPanel } from "./whatsapp/BulkSendPanel"
import { LineManagerPanel } from "./whatsapp/LineManagerPanel"
import { GreetingPanel } from "./whatsapp/GreetingPanel"
import { AutoReplyPanel } from "./whatsapp/AutoReplyPanel"
import { ScheduledPanel } from "./whatsapp/ScheduledPanel"
import { TemplatesPanel } from "./whatsapp/TemplatesPanel"
import { WhatsAppMessages } from "./WhatsAppMessages"

type TabKey = "bulk" | "autoreply" | "templates" | "greeting" | "scheduled" | "history" | "lines"

interface TabDef {
  key: TabKey
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  underline: string
}

const TABS: TabDef[] = [
  { key: "bulk", label: "Toplu Mesaj", icon: Send, color: "text-emerald-400", underline: "bg-emerald-400" },
  { key: "autoreply", label: "Oto-Cevap", icon: Bot, color: "text-purple-400", underline: "bg-purple-400" },
  { key: "templates", label: "Şablonlar", icon: FileText, color: "text-indigo-400", underline: "bg-indigo-400" },
  { key: "greeting", label: "Karşılama", icon: Hand, color: "text-pink-400", underline: "bg-pink-400" },
  { key: "scheduled", label: "Zamanlı", icon: Clock, color: "text-amber-400", underline: "bg-amber-400" },
  { key: "history", label: "Geçmiş", icon: History, color: "text-blue-400", underline: "bg-blue-400" },
  { key: "lines", label: "Hatlar", icon: Radio, color: "text-zinc-400", underline: "bg-zinc-400" },
]

export function WhatsAppPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("bulk")

  return (
    <div className="space-y-5">
      {/* Sayfa Başlığı */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 shadow-lg shadow-emerald-500/5">
            <MessageCircle className="size-6 text-emerald-400" />
            <span className="absolute -top-1 -right-1 size-3 rounded-full bg-emerald-400 animate-pulse border-2 border-zinc-950" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-zinc-100">WhatsApp Merkezi</h2>
            <p className="text-xs text-zinc-500">
              Toplu mesaj, otomasyon, zamanlama ve hat yönetimi
            </p>
          </div>
        </div>
      </div>

      {/* Üst Panel: Durum + İstatistikler */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <LineStatusCard onManage={() => setActiveTab("lines")} />
        </div>
        <div className="lg:col-span-8">
          <WhatsAppStatsCards />
        </div>
      </div>

      {/* Tab Navigasyonu */}
      <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/40 p-1.5 backdrop-blur-sm">
        <div className="grid grid-cols-3 gap-1 md:grid-cols-7">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "group relative flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs md:text-sm font-medium transition-all",
                  isActive
                    ? "bg-zinc-800/80 text-zinc-100 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
                )}
              >
                <Icon
                  className={cn(
                    "size-4 transition-colors shrink-0",
                    isActive ? tab.color : "text-zinc-500 group-hover:text-zinc-300"
                  )}
                />
                <span className="truncate">{tab.label}</span>
                {isActive && (
                  <span
                    className={cn(
                      "absolute -bottom-1.5 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full",
                      tab.underline
                    )}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab İçeriği */}
      <div>
        {activeTab === "bulk" && <BulkSendPanel />}
        {activeTab === "autoreply" && <AutoReplyPanel />}
        {activeTab === "templates" && <TemplatesPanel />}
        {activeTab === "greeting" && <GreetingPanel />}
        {activeTab === "scheduled" && <ScheduledPanel />}
        {activeTab === "history" && <WhatsAppMessages />}
        {activeTab === "lines" && <LineManagerPanel />}
      </div>
    </div>
  )
}
