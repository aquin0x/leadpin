import { supabase } from "@/lib/supabase"
import type { BusinessFilters, PaginatedBusinesses, Business, ScrapeJob } from "@/types"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000"

class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession()

  const headers: HeadersInit = { "Content-Type": "application/json" }

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`
  } else {
    console.warn("[getAuthHeaders] Token bulunamadı!")
  }

  return headers
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders()
  const url = `${API_URL.replace(/\/$/, "")}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  })

  if (!response.ok) {
    if (response.status === 401) {
      console.warn("[fetchApi] Yetkisiz erişim!")
    }
    const errorText = await response.text().catch(() => "Okunamayan hata")
    console.error(`API Hatası [${response.status}]:`, errorText)
    throw new ApiError(`Sunucu hatası (${response.status})`, response.status)
  }

  return response.json()
}

export async function getBusinesses(filters: BusinessFilters): Promise<PaginatedBusinesses> {
  const params = new URLSearchParams()
  if (filters.city) params.set("city", filters.city)
  if (filters.district) params.set("district", filters.district)
  if (filters.neighborhood) params.set("neighborhood", filters.neighborhood)
  if (filters.category) params.set("category", filters.category)
  if (filters.hasEmail != null) params.set("hasEmail", String(filters.hasEmail))
  if (filters.hasWebsite != null) params.set("hasWebsite", String(filters.hasWebsite))
  if (filters.hasPhone != null) params.set("hasPhone", String(filters.hasPhone))
  if (filters.minRating != null) params.set("minRating", String(filters.minRating))
  if (filters.minReviews != null) params.set("minReviews", String(filters.minReviews))
  if (filters.sortBy) params.set("sortBy", filters.sortBy)
  if (filters.sortOrder) params.set("sortOrder", filters.sortOrder)
  if (filters.page != null) params.set("page", String(filters.page))
  if (filters.limit != null) params.set("limit", String(filters.limit))
  const query = params.toString()
  return fetchApi<PaginatedBusinesses>(`/api/businesses${query ? `?${query}` : ""}`)
}

export async function getBusiness(id: string): Promise<Business> {
  return fetchApi<Business>(`/api/businesses/${id}`)
}

export interface DashboardStats {
  total: number
  withWebsite: number
  withPhone: number
  thisMonth: number
}

export async function getStats(): Promise<DashboardStats> {
  return fetchApi<DashboardStats>("/api/stats")
}

export async function listScrapeJobs(): Promise<ScrapeJob[]> {
  return fetchApi<ScrapeJob[]>("/api/scrape-jobs")
}

export async function stopScrapeJob(id: string): Promise<{ message: string }> {
  return fetchApi<{ message: string }>(`/api/scrape/${id}/stop`, { method: "POST" })
}

export async function deleteScrapeJob(id: string): Promise<{ message: string }> {
  return fetchApi<{ message: string }>(`/api/scrape/${id}`, { method: "DELETE" })
}

export async function getScrapeJob(id: string): Promise<ScrapeJob> {
  return fetchApi<ScrapeJob>(`/api/scrape/${id}`)
}

export async function startScrape(data: {
  category: string
  city: string
  district?: string
  neighborhood?: string
}): Promise<{ jobId: string }> {
  return fetchApi<{ jobId: string }>("/api/scrape", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function clearAllData(): Promise<{ message: string }> {
  return fetchApi<{ message: string }>("/api/admin/clear-data", { method: "POST" })
}

export async function logWhatsApp(data: {
  businessId: string
  message: string
}): Promise<{ waLink: string; logId: string }> {
  return fetchApi<{ waLink: string; logId: string }>("/api/outreach/whatsapp-log", {
    method: "POST",
    body: JSON.stringify({ businessId: data.businessId, message_content: data.message, type: "whatsapp" }),
  })
}

export type WhatsAppSessionStatus =
  | "disconnected"
  | "initializing"
  | "qr"
  | "authenticated"
  | "ready"
  | "auth_failure"

export interface WhatsAppLine {
  id: string
  label: string
  phone?: string
  status: WhatsAppSessionStatus
  qr: string | null
  lastError?: string
  createdAt: number
}

export interface WhatsAppCampaign {
  id: string
  userId: string
  listId: string
  total: number
  processed: number
  sent: number
  failed: number
  skipped: number
  status: "running" | "paused" | "completed" | "stopped" | "failed"
  currentLead?: string
  startedAt: number
  finishedAt?: number
  lastError?: string
}

export async function listWhatsAppLines(): Promise<WhatsAppLine[]> {
  const { lines } = await fetchApi<{ lines: WhatsAppLine[] }>("/api/whatsapp/lines")
  return lines
}

export async function createWhatsAppLine(label?: string): Promise<WhatsAppLine> {
  return fetchApi<WhatsAppLine>("/api/whatsapp/lines", {
    method: "POST",
    body: JSON.stringify({ label }),
  })
}

export async function getWhatsAppLine(id: string): Promise<WhatsAppLine> {
  return fetchApi<WhatsAppLine>(`/api/whatsapp/lines/${id}`)
}

export async function deleteWhatsAppLine(id: string): Promise<{ message: string }> {
  return fetchApi<{ message: string }>(`/api/whatsapp/lines/${id}`, { method: "DELETE" })
}

export async function reconnectWhatsAppLine(id: string): Promise<{ status: string }> {
  return fetchApi<{ status: string }>(`/api/whatsapp/lines/${id}/reconnect`, { method: "POST" })
}

export interface WhatsAppMedia {
  data: string
  mimeType: string
  filename: string
}

export async function startWhatsAppCampaign(body: {
  listId: string
  lineId?: string
  messageTemplate: string
  messageTemplateNoWebsite?: string
  minDelaySec?: number
  maxDelaySec?: number
  coffeeBreakEvery?: number
  coffeeBreakMinutes?: number
  media?: WhatsAppMedia
}): Promise<WhatsAppCampaign> {
  return fetchApi<WhatsAppCampaign>("/api/whatsapp/campaign/start", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export async function stopWhatsAppCampaign(): Promise<{ message: string; campaign: WhatsAppCampaign }> {
  return fetchApi("/api/whatsapp/campaign/stop", { method: "POST" })
}

export type SendSingleResult =
  | { ok: true; lineId: string }
  | { ok: false; reason: "no_line"; hint: string }
  | { ok: false; reason: "not_ready"; lines: WhatsAppLine[] }
  | { ok: false; reason: "no_phone" | "no_whatsapp" | "send_failed"; error?: string }

export async function sendWhatsAppSingle(body: {
  businessId: string
  message: string
  lineId?: string
  media?: WhatsAppMedia
}): Promise<SendSingleResult> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL.replace(/\/$/, "")}/api/whatsapp/send-single`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, lineId: data?.lineId ?? "" }
  if (res.status === 409) return data as SendSingleResult
  return { ok: false, reason: "send_failed", error: data?.error || data?.message || "Hata" }
}

export interface WhatsAppOutreachRow {
  id: string
  status: "sent" | "failed" | "skipped"
  message_content: string
  created_at: string
  business: {
    id: string
    name: string
    phone: string | null
    short_id: string | null
    short_id_clicks: number
    short_id_last_click_at: string | null
  } | null
}

export type GroupedOutreachItem =
  | {
      kind: "single"
      id: string
      status: "sent" | "failed" | "skipped"
      message_content: string
      created_at: string
      business: WhatsAppOutreachRow["business"]
    }
  | {
      kind: "batch"
      batch_id: string
      list_id: string | null
      list_name: string | null
      created_at: string
      total: number
      sent: number
      failed: number
      skipped: number
      totalClicks: number
    }

export async function listWhatsAppOutreachGrouped(
  limit = 50
): Promise<{ rows: GroupedOutreachItem[] }> {
  const params = new URLSearchParams()
  params.set("limit", String(limit))
  return fetchApi(`/api/outreach/whatsapp/grouped?${params.toString()}`)
}

export async function listWhatsAppOutreach(
  search?: string,
  limit = 100,
  offset = 0
): Promise<{ rows: WhatsAppOutreachRow[]; total: number }> {
  const params = new URLSearchParams()
  if (search) params.set("search", search)
  params.set("limit", String(limit))
  params.set("offset", String(offset))
  return fetchApi(`/api/outreach/whatsapp?${params.toString()}`)
}

// ========= WhatsApp Automation =========

export type AutoRuleType = "greeting" | "keyword"
export type MatchType = "contains" | "exact" | "starts_with"

export interface AutoRule {
  id: string
  user_id: string
  line_id: string | null
  type: AutoRuleType
  name: string
  keywords: string[]
  match_type: MatchType
  response: string
  media_url: string | null
  enabled: boolean
  priority: number
  reply_once_per_contact: boolean
  cooldown_minutes: number
  created_at: string
}

export type AutomationFeature = "greeting" | "autoreply" | "scheduled"

export interface FeatureSettings {
  user_id: string
  feature: AutomationFeature
  enabled: boolean
  active_hours_start: string | null  // "HH:MM"
  active_hours_end: string | null
  active_days: number[]               // 0..6 (0=Pazar)
  timezone: string
  single_reply_only: boolean          // sadece autoreply için anlamlı
}

export async function getFeatureSettings(
  feature: AutomationFeature
): Promise<FeatureSettings> {
  return fetchApi<FeatureSettings>(`/api/whatsapp/automation/settings/${feature}`)
}

export async function updateFeatureSettings(
  feature: AutomationFeature,
  body: Partial<FeatureSettings>
): Promise<FeatureSettings> {
  return fetchApi<FeatureSettings>(`/api/whatsapp/automation/settings/${feature}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export async function listAutoRules(): Promise<AutoRule[]> {
  const { rules } = await fetchApi<{ rules: AutoRule[] }>("/api/whatsapp/rules")
  return rules
}

export async function createAutoRule(body: Partial<AutoRule>): Promise<AutoRule> {
  return fetchApi<AutoRule>("/api/whatsapp/rules", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export async function updateAutoRule(id: string, body: Partial<AutoRule>): Promise<AutoRule> {
  return fetchApi<AutoRule>(`/api/whatsapp/rules/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export async function deleteAutoRule(id: string): Promise<{ message: string }> {
  return fetchApi<{ message: string }>(`/api/whatsapp/rules/${id}`, { method: "DELETE" })
}

// ========= Scheduled Campaigns =========

export type ScheduledStatus = "pending" | "running" | "completed" | "cancelled" | "failed"

export interface ScheduledCampaign {
  id: string
  user_id: string
  list_id: string
  line_id: string | null
  name: string | null
  message_template: string
  message_template_no_website: string | null
  min_delay_sec: number | null
  max_delay_sec: number | null
  coffee_break_every: number | null
  coffee_break_minutes: number | null
  scheduled_at: string
  status: ScheduledStatus
  error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  lists?: { name: string } | null
}

export async function listScheduledCampaigns(): Promise<ScheduledCampaign[]> {
  const { scheduled } = await fetchApi<{ scheduled: ScheduledCampaign[] }>(
    "/api/whatsapp/scheduled"
  )
  return scheduled
}

export async function createScheduledCampaign(body: {
  list_id: string
  line_id?: string
  name?: string
  message_template: string
  message_template_no_website?: string
  media?: WhatsAppMedia
  min_delay_sec?: number
  max_delay_sec?: number
  coffee_break_every?: number
  coffee_break_minutes?: number
  scheduled_at: string
}): Promise<ScheduledCampaign> {
  return fetchApi<ScheduledCampaign>("/api/whatsapp/scheduled", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export async function cancelScheduledCampaign(id: string): Promise<ScheduledCampaign> {
  return fetchApi<ScheduledCampaign>(`/api/whatsapp/scheduled/${id}/cancel`, { method: "POST" })
}

export async function deleteScheduledCampaign(id: string): Promise<{ message: string }> {
  return fetchApi<{ message: string }>(`/api/whatsapp/scheduled/${id}`, { method: "DELETE" })
}

// ========= Message Templates =========

export interface MessageTemplate {
  id: string
  user_id: string
  name: string
  content: string
  media: WhatsAppMedia | null
  created_at: string
  updated_at: string
}

export async function listMessageTemplates(): Promise<MessageTemplate[]> {
  return fetchApi<MessageTemplate[]>("/api/whatsapp/templates")
}

export async function createMessageTemplate(body: {
  name: string
  content: string
  media?: WhatsAppMedia | null
}): Promise<MessageTemplate> {
  return fetchApi<MessageTemplate>("/api/whatsapp/templates", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export async function updateMessageTemplate(
  id: string,
  body: Partial<{ name: string; content: string; media: WhatsAppMedia | null }>
): Promise<MessageTemplate> {
  return fetchApi<MessageTemplate>(`/api/whatsapp/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export async function deleteMessageTemplate(id: string): Promise<{ message: string }> {
  return fetchApi<{ message: string }>(`/api/whatsapp/templates/${id}`, { method: "DELETE" })
}

// ========= User Settings (kendi domain, landing URL) =========

export type WhatsAppProxyType = "http" | "socks5"

export interface UserSettings {
  user_id: string
  short_link_public_url: string | null
  short_link_redirect_url: string | null
  whatsapp_proxy_host: string | null
  whatsapp_proxy_port: number | null
  whatsapp_proxy_type: WhatsAppProxyType | null
}

export type UserSettingsPatch = Partial<
  Pick<
    UserSettings,
    | "short_link_public_url"
    | "short_link_redirect_url"
    | "whatsapp_proxy_host"
    | "whatsapp_proxy_port"
    | "whatsapp_proxy_type"
  >
>

export async function getUserSettings(): Promise<UserSettings> {
  return fetchApi<UserSettings>("/api/user-settings")
}

export async function updateUserSettings(
  body: UserSettingsPatch
): Promise<UserSettings> {
  return fetchApi<UserSettings>("/api/user-settings", {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export interface ProxyTestResult {
  ok: boolean
  latencyMs?: number
  message?: string
}

export async function testWhatsAppProxy(body: {
  host: string
  port: number
  type: WhatsAppProxyType
}): Promise<ProxyTestResult> {
  return fetchApi<ProxyTestResult>("/api/user-settings/proxy/test", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export { API_URL, ApiError, fetchApi }

export const api = {
  get: <T>(url: string) => fetchApi<T>(url, { method: "GET" }),
  post: <T>(url: string, body?: unknown) =>
    fetchApi<T>(url, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(url: string, body?: unknown) =>
    fetchApi<T>(url, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(url: string) => fetchApi<T>(url, { method: "DELETE" }),
}

// ──────────────────────────────────────────────────────────────────────
// Plan / Abonelik
// ──────────────────────────────────────────────────────────────────────

export interface PlanCatalogItem {
  id: string
  name: string
  price_usd: number
  scrape_limit: number
  message_limit: number
  lead_storage: number
  display_order: number
}

export interface SubscriptionStatus {
  plan_id: string
  plan_name: string
  scrape_limit: number
  message_limit: number
  lead_storage: number
  scrape_used: number
  message_used: number
  current_period_start: string
  current_period_end: string
  is_admin: boolean
  lead_count: number
}

export const getSubscriptionStatus = () =>
  api.get<SubscriptionStatus>("/api/subscription/status")

export const listPlans = () => api.get<PlanCatalogItem[]>("/api/subscription/plans")

export const redeemSubscriptionToken = (token: string) =>
  api.post<SubscriptionStatus & { ok: boolean }>("/api/subscription/redeem", { token })

export interface ExpiringLead {
  id: string
  name: string
  created_at: string
  expires_at: string
}

export const listExpiringLeads = () =>
  api.get<{ rows: ExpiringLead[]; total: number }>("/api/subscription/expiring-leads")

// ──────────────────────────────────────────────────────────────────────
// Medya yükleme (whatsapp-media bucket)
// ──────────────────────────────────────────────────────────────────────

export interface UploadedMedia {
  url: string
  path: string
  mimeType: string
  filename: string | null
  size: number
}

/**
 * Bir File objesini whatsapp-media bucket'a yükler ve URL döner.
 * Şablon / scheduled kampanya feature'ları base64 yerine bunu kullanır.
 */
export async function uploadMediaFile(file: File): Promise<UploadedMedia> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // "data:image/png;base64,XXXX" → "XXXX"
      const base64 = result.split(",")[1] || ""
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

  return api.post<UploadedMedia>("/api/storage/upload", {
    data,
    mimeType: file.type || "application/octet-stream",
    filename: file.name,
  })
}

export async function deleteUploadedMedia(path: string): Promise<{ ok: boolean }> {
  const headers = await getAuthHeaders()
  const r = await fetch(`${API_URL.replace(/\/$/, "")}/api/storage/media`, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ path }),
  })
  if (!r.ok) throw new ApiError(`Silme başarısız: ${r.status}`, r.status)
  return r.json()
}
