

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Plus, MessageCircle, Trash2, RefreshCw, Phone, Mail, KeyRound, Eye, EyeOff, Check, Link as LinkIcon, Save, Wifi, X, Sparkles, Zap, Crown, ShieldCheck } from "lucide-react"
import {
  listWhatsAppLines,
  createWhatsAppLine,
  deleteWhatsAppLine,
  reconnectWhatsAppLine,
  clearAllData,
  getUserSettings,
  updateUserSettings,
  testWhatsAppProxy,
  getSubscriptionStatus,
  redeemSubscriptionToken,
  type WhatsAppLine,
  type WhatsAppProxyType,
} from "@/lib/api-client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useIsLinkOwner } from "@/hooks/useIsLinkOwner"
import { useConfirm } from "@/components/ui/confirm-dialog"
import toast from "react-hot-toast"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  ready: { text: "Bağlı", color: "bg-emerald-500/10 text-emerald-400" },
  qr: { text: "QR bekleniyor", color: "bg-amber-500/10 text-amber-400" },
  initializing: { text: "Başlatılıyor", color: "bg-blue-500/10 text-blue-400" },
  authenticated: { text: "Kimliklendirildi", color: "bg-blue-500/10 text-blue-400" },
  disconnected: { text: "Bağlı değil", color: "bg-zinc-800 text-zinc-400" },
  auth_failure: { text: "Kimlik hatası", color: "bg-red-500/10 text-red-400" },
}

function ProfileSection() {
  const [email, setEmail] = useState<string | null>(null)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Password form
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Email form
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [emailPassword, setEmailPassword] = useState("")
  const [showEmailPw, setShowEmailPw] = useState(false)
  const [emailSubmitting, setEmailSubmitting] = useState(false)

  const loadUser = () => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
      // Supabase'de onaylanmamış yeni email new_email alanında tutulur
      const nextEmail = (data.user as any)?.new_email ?? null
      setPendingEmail(nextEmail)
      setLoading(false)
    })
  }

  useEffect(() => {
    loadUser()
  }, [])

  const resetForm = () => {
    setOldPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setShowPw(false)
  }

  const resetEmailForm = () => {
    setNewEmail("")
    setEmailPassword("")
    setShowEmailPw(false)
  }

  const handleChangeEmail = async () => {
    if (!email) return toast.error("Mevcut e-posta bulunamadı")
    const trimmed = newEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return toast.error("Geçerli bir e-posta girin")
    }
    if (trimmed === email.toLowerCase()) {
      return toast.error("Yeni e-posta mevcut ile aynı")
    }
    if (!emailPassword) return toast.error("Mevcut şifreyi girin")

    setEmailSubmitting(true)
    try {
      // 1) Mevcut şifreyi doğrula
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: emailPassword,
      })
      if (signInErr) {
        toast.error("Mevcut şifre yanlış")
        return
      }

      // 2) E-posta değiştir — Supabase yeni adrese doğrulama maili gönderir
      const { error: updErr } = await supabase.auth.updateUser({
        email: trimmed,
      })
      if (updErr) {
        toast.error(updErr.message || "E-posta güncellenemedi")
        return
      }

      toast.success(`Doğrulama e-postası ${trimmed} adresine gönderildi`, { duration: 5000 })
      resetEmailForm()
      setShowEmailForm(false)
      loadUser()
    } catch (e: any) {
      toast.error(e.message || "Bir hata oluştu")
    } finally {
      setEmailSubmitting(false)
    }
  }

  const handleChangePassword = async () => {
    if (!email) return toast.error("E-posta bulunamadı")
    if (!oldPassword) return toast.error("Mevcut şifreyi girin")
    if (newPassword.length < 6) return toast.error("Yeni şifre en az 6 karakter olmalı")
    if (newPassword !== confirmPassword) return toast.error("Şifreler eşleşmiyor")
    if (newPassword === oldPassword) return toast.error("Yeni şifre eskisiyle aynı olamaz")

    setSubmitting(true)
    try {
      // 1) Mevcut şifreyi doğrula
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: oldPassword,
      })
      if (signInErr) {
        toast.error("Mevcut şifre yanlış")
        return
      }

      // 2) Yeni şifreyi ayarla
      const { error: updErr } = await supabase.auth.updateUser({
        password: newPassword,
      })
      if (updErr) {
        toast.error(updErr.message || "Şifre güncellenemedi")
        return
      }

      toast.success("Şifre güncellendi")
      resetForm()
      setShowPasswordForm(false)
    } catch (e: any) {
      toast.error(e.message || "Bir hata oluştu")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="size-5 text-blue-400" />
        <span className="font-semibold text-zinc-100">Hesap Bilgileri</span>
      </div>

      {/* E-posta */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-200">E-posta</span>
          </div>
          {!showEmailForm && (
            <Button
              onClick={() => setShowEmailForm(true)}
              size="sm"
              variant="ghost"
              className="h-8 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
            >
              Değiştir
            </Button>
          )}
        </div>

        {loading ? (
          <div className="h-5 w-40 animate-pulse rounded bg-zinc-800" />
        ) : !showEmailForm ? (
          <div className="space-y-1.5">
            <div className="text-sm text-zinc-200 font-mono break-all">{email}</div>
            {pendingEmail && pendingEmail !== email && (
              <div className="flex items-start gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-300">
                <Mail className="size-3 shrink-0 mt-0.5" />
                <span>
                  <span className="text-zinc-300">{pendingEmail}</span> için doğrulama bekleniyor — gelen kutunuzu kontrol edin.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2.5 pt-1">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1 block">
                Yeni E-posta
              </label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="yeni@ornek.com"
                className="h-9 border-zinc-700 bg-zinc-900/60"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1 block">
                Mevcut Şifre
              </label>
              <div className="relative">
                <Input
                  type={showEmailPw ? "text" : "password"}
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-9 pr-9 border-zinc-700 bg-zinc-900/60"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowEmailPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showEmailPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Güvenlik için mevcut şifreniz doğrulanır. Yeni adrese bir doğrulama e-postası gönderilir; linke tıkladıktan sonra değişiklik aktif olur.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                onClick={() => {
                  resetEmailForm()
                  setShowEmailForm(false)
                }}
                variant="ghost"
                size="sm"
                className="text-zinc-400"
                disabled={emailSubmitting}
              >
                İptal
              </Button>
              <Button
                onClick={handleChangeEmail}
                disabled={emailSubmitting || !newEmail.trim() || !emailPassword}
                size="sm"
                className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
              >
                {emailSubmitting ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Mail className="mr-1.5 size-3.5" />
                )}
                Doğrulama Gönder
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Şifre bölümü */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-200">Şifre</span>
          </div>
          {!showPasswordForm && (
            <Button
              onClick={() => setShowPasswordForm(true)}
              size="sm"
              variant="ghost"
              className="h-8 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
            >
              Şifre Değiştir
            </Button>
          )}
        </div>

        {!showPasswordForm ? (
          <p className="text-[11px] text-zinc-500">
            Hesabınızın güvenliği için şifrenizi düzenli olarak değiştirin.
          </p>
        ) : (
          <div className="space-y-2.5 pt-1">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1 block">
                Mevcut Şifre
              </label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-9 pr-9 border-zinc-700 bg-zinc-900/60"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1 block">
                Yeni Şifre
              </label>
              <Input
                type={showPw ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="En az 6 karakter"
                className="h-9 border-zinc-700 bg-zinc-900/60"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1 block">
                Yeni Şifre (Tekrar)
              </label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Yeni şifreyi tekrar girin"
                  className="h-9 pr-9 border-zinc-700 bg-zinc-900/60"
                  autoComplete="new-password"
                />
                {confirmPassword && newPassword && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2">
                    {confirmPassword === newPassword ? (
                      <Check className="size-3.5 text-emerald-400" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-red-400 inline-block" />
                    )}
                  </span>
                )}
              </div>
              {confirmPassword && newPassword && confirmPassword !== newPassword && (
                <p className="text-[10px] text-red-400 mt-1">Şifreler eşleşmiyor</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                onClick={() => {
                  resetForm()
                  setShowPasswordForm(false)
                }}
                variant="ghost"
                size="sm"
                className="text-zinc-400"
                disabled={submitting}
              >
                İptal
              </Button>
              <Button
                onClick={handleChangePassword}
                disabled={
                  submitting ||
                  !oldPassword ||
                  !newPassword ||
                  !confirmPassword ||
                  newPassword !== confirmPassword ||
                  newPassword.length < 6
                }
                size="sm"
                className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
              >
                {submitting ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <KeyRound className="mr-1.5 size-3.5" />
                )}
                Şifreyi Güncelle
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function ShortLinkSettingsSection() {
  const queryClient = useQueryClient()
  const [publicUrl, setPublicUrl] = useState("")
  const [redirectUrl, setRedirectUrl] = useState("")
  const [dirty, setDirty] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["userSettings"],
    queryFn: getUserSettings,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!data) return
    setPublicUrl(data.short_link_public_url ?? "")
    setRedirectUrl(data.short_link_redirect_url ?? "")
    setDirty(false)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () =>
      updateUserSettings({
        short_link_public_url: publicUrl.trim() || null,
        short_link_redirect_url: redirectUrl.trim() || null,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(["userSettings"], next)
      toast.success("Kısa link ayarları kaydedildi")
      setDirty(false)
    },
    onError: (e: any) => toast.error(e.message || "Kaydedilemedi"),
  })

  const exampleLink = publicUrl.trim()
    ? `${publicUrl.trim().replace(/\/$/, "")}/r/abc123`
    : "—"

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <LinkIcon className="size-5 text-cyan-400" />
        <span className="font-semibold text-zinc-100">Kısa Link Ayarları</span>
      </div>

      <p className="text-[11px] text-zinc-500 leading-relaxed">
        WhatsApp mesajlarındaki <code className="text-cyan-400">{"{link}"}</code> değişkeni için
        kendi domain'inizi girin. Bu ayarlar hesabınıza bağlıdır, farklı bilgisayarlardan da
        giriş yaptığınızda aynı kalır.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-4 animate-spin text-zinc-500" />
        </div>
      ) : (
        <>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1 block">
              Link Domain'i (mesajda görünen)
            </label>
            <Input
              value={publicUrl}
              onChange={(e) => {
                setPublicUrl(e.target.value)
                setDirty(true)
              }}
              placeholder="https://sizinsiteniz.com"
              className="h-9 border-zinc-700 bg-zinc-950/40"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              Önizleme: <code className="text-cyan-400 break-all">{exampleLink}</code>
            </p>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1 block">
              Landing URL (tıklayınca yönlenecek)
            </label>
            <Input
              value={redirectUrl}
              onChange={(e) => {
                setRedirectUrl(e.target.value)
                setDirty(true)
              }}
              placeholder="https://sizinsiteniz.com/kampanya"
              className="h-9 border-zinc-700 bg-zinc-950/40"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              Müşteri linke tıkladığında bu sayfaya yönlendirilir (tıklama otomatik sayılır).
            </p>
          </div>

          {dirty && (
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/20"
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 size-4" />
              )}
              Kaydet
            </Button>
          )}

          {!publicUrl && !redirectUrl && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-amber-300">
              Bu alanlar boşken <code>{"{link}"}</code> değişkeni mesajda boş çıkar.
            </div>
          )}
        </>
      )}
    </section>
  )
}

function WhatsAppProxySection() {
  const queryClient = useQueryClient()
  const [host, setHost] = useState("")
  const [port, setPort] = useState("")
  const [type, setType] = useState<WhatsAppProxyType>("http")
  const [dirty, setDirty] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["userSettings"],
    queryFn: getUserSettings,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!data) return
    setHost(data.whatsapp_proxy_host ?? "")
    setPort(data.whatsapp_proxy_port != null ? String(data.whatsapp_proxy_port) : "")
    setType((data.whatsapp_proxy_type as WhatsAppProxyType) ?? "http")
    setDirty(false)
    setTestResult(null)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () => {
      const trimmedHost = host.trim()
      const portNum = port.trim() ? Number(port.trim()) : null
      return updateUserSettings({
        whatsapp_proxy_host: trimmedHost || null,
        whatsapp_proxy_port: portNum,
        whatsapp_proxy_type: trimmedHost ? type : null,
      })
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["userSettings"], next)
      toast.success(
        host.trim()
          ? "Proxy kaydedildi — hatlar yeni proxy ile yeniden bağlanıyor"
          : "Proxy kapatıldı — hatlar doğrudan bağlanıyor",
        { duration: 4500 }
      )
      setDirty(false)
    },
    onError: (e: any) => toast.error(e.message || "Kaydedilemedi"),
  })

  const handleTest = async () => {
    const trimmedHost = host.trim()
    const portNum = Number(port.trim())
    if (!trimmedHost) return toast.error("Host girin")
    if (!Number.isFinite(portNum) || portNum <= 0 || portNum > 65535)
      return toast.error("Geçerli bir port girin")
    setTesting(true)
    setTestResult(null)
    try {
      const r = await testWhatsAppProxy({ host: trimmedHost, port: portNum, type })
      if (r.ok) {
        setTestResult({ ok: true, text: `Bağlantı başarılı (${r.latencyMs ?? "?"} ms)` })
      } else {
        setTestResult({ ok: false, text: r.message || "Başarısız" })
      }
    } catch (e: any) {
      setTestResult({ ok: false, text: e?.message || "Test başarısız" })
    } finally {
      setTesting(false)
    }
  }

  const portNumValid =
    !port.trim() ||
    (Number.isFinite(Number(port.trim())) &&
      Number(port.trim()) > 0 &&
      Number(port.trim()) <= 65535)

  const proxyActive = !!data?.whatsapp_proxy_host && !!data?.whatsapp_proxy_port

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Wifi className="size-5 text-purple-400" />
        <span className="font-semibold text-zinc-100">WhatsApp Proxy</span>
        {proxyActive && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
            Aktif
          </span>
        )}
      </div>

      <p className="text-[11px] text-zinc-500 leading-relaxed">
        Telefon internetinizi Termux gibi bir proxy ile paylaşıyorsanız buraya host ve
        port girin. Boş bırakırsanız bilgisayarın internet bağlantısı kullanılır.
        Değişiklikten sonra <strong>WhatsApp hatlarınız otomatik olarak</strong> yeni
        proxy ile yeniden bağlanır — QR taramanız gerekmez.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-4 animate-spin text-zinc-500" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_88px_96px] gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1 block">
                Host
              </label>
              <Input
                value={host}
                onChange={(e) => {
                  setHost(e.target.value)
                  setDirty(true)
                  setTestResult(null)
                }}
                placeholder="192.168.43.1"
                className="h-10 border-zinc-700 bg-zinc-950/40 font-mono text-base tracking-tight"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1 block">
                Port
              </label>
              <Input
                value={port}
                onChange={(e) => {
                  setPort(e.target.value.replace(/\D/g, ""))
                  setDirty(true)
                  setTestResult(null)
                }}
                placeholder="8080"
                className="h-10 border-zinc-700 bg-zinc-950/40 font-mono text-xs px-2"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1 block">
                Tip
              </label>
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as WhatsAppProxyType)
                  setDirty(true)
                  setTestResult(null)
                }}
                className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950/40 px-1.5 text-xs text-zinc-200"
              >
                <option value="http">HTTP</option>
                <option value="socks5">SOCKS5</option>
              </select>
            </div>
          </div>

          {!portNumValid && (
            <p className="text-[10px] text-red-400">Port 1-65535 arası olmalı</p>
          )}

          {testResult && (
            <div
              className={`flex items-start gap-1.5 rounded-md px-2 py-1.5 text-[11px] ${
                testResult.ok
                  ? "border border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
                  : "border border-red-500/20 bg-red-500/5 text-red-300"
              }`}
            >
              {testResult.ok ? (
                <Check className="size-3 shrink-0 mt-0.5" />
              ) : (
                <X className="size-3 shrink-0 mt-0.5" />
              )}
              <span className="break-all">{testResult.text}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleTest}
              disabled={testing || !host.trim() || !port.trim() || !portNumValid}
              variant="ghost"
              className="flex-1 border border-zinc-700 text-zinc-200 hover:bg-zinc-800/60"
            >
              {testing ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Wifi className="mr-1.5 size-4" />
              )}
              Bağlantıyı Test Et
            </Button>
            {dirty && (
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !portNumValid}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/20"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 size-4" />
                )}
                Kaydet
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function PlanSection() {
  const queryClient = useQueryClient()
  const [tokenInput, setTokenInput] = useState("")

  const { data: status, isLoading } = useQuery({
    queryKey: ["subscription", "status"],
    queryFn: getSubscriptionStatus,
    refetchInterval: 30_000,
  })

  const redeemMutation = useMutation({
    mutationFn: (token: string) => redeemSubscriptionToken(token),
    onSuccess: (res) => {
      toast.success(`Plan güncellendi: ${res.plan_name}`)
      setTokenInput("")
      queryClient.invalidateQueries({ queryKey: ["subscription"] })
    },
    onError: (err: any) => toast.error(err.message || "Token kullanılamadı"),
  })

  if (isLoading || !status) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-5 animate-spin text-zinc-500" />
        </div>
      </section>
    )
  }

  const planMeta: Record<string, { icon: any; color: string; bg: string }> = {
    admin:     { icon: ShieldCheck, color: "text-amber-300",  bg: "bg-amber-500/15"  },
    free:      { icon: Sparkles,    color: "text-zinc-300",   bg: "bg-zinc-700/30"   },
    pro:       { icon: Zap,         color: "text-emerald-400", bg: "bg-emerald-500/15"},
    unlimited: { icon: Crown,       color: "text-fuchsia-400", bg: "bg-fuchsia-500/15"},
  }
  const meta = planMeta[status.plan_id] || planMeta.free
  const Icon = meta.icon

  const periodEnd = new Date(status.current_period_end)
  const daysLeft = Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / (24 * 3600 * 1000)))

  const usageBar = (used: number, limit: number, color: string) => {
    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
    const danger = pct >= 90
    return (
      <div className="space-y-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full transition-all ${danger ? "bg-red-500" : color}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex size-9 items-center justify-center rounded-lg ${meta.bg}`}>
            <Icon className={`size-5 ${meta.color}`} />
          </div>
          <div>
            <div className="font-semibold text-zinc-100">{status.plan_name} Plan</div>
            {!status.is_admin && (
              <div className="text-xs text-zinc-500">
                {daysLeft > 0 ? `${daysLeft} gün kaldı` : "Süresi doldu"}
              </div>
            )}
          </div>
        </div>
        {!status.is_admin && status.plan_id === "free" && (
          <a
            href="https://leadpin.com.tr/plans"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
          >
            Yükselt →
          </a>
        )}
      </div>

      {!status.is_admin && (
        <>
          <div className="grid gap-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-400">Tarama</span>
                <span className="font-mono text-zinc-300">
                  {status.scrape_used.toLocaleString("tr-TR")} / {status.scrape_limit.toLocaleString("tr-TR")}
                </span>
              </div>
              {usageBar(status.scrape_used, status.scrape_limit, "bg-blue-500")}
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-400">Mesaj (manuel/toplu)</span>
                <span className="font-mono text-zinc-300">
                  {status.message_used.toLocaleString("tr-TR")} / {status.message_limit.toLocaleString("tr-TR")}
                </span>
              </div>
              {usageBar(status.message_used, status.message_limit, "bg-emerald-500")}
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-400">Saklı Lead</span>
                <span className="font-mono text-zinc-300">
                  {status.lead_count.toLocaleString("tr-TR")} / {status.lead_storage.toLocaleString("tr-TR")}
                </span>
              </div>
              {usageBar(status.lead_count, status.lead_storage, "bg-purple-500")}
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <KeyRound className="size-3.5" />
              <span>Plan Aktivasyon Kodu</span>
            </div>
            <div className="flex gap-2">
              <Input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                placeholder="LP-PRO-XXXXXXXXXXXX"
                className="h-9 border-zinc-700 bg-zinc-950/40 font-mono text-sm tracking-wider"
                disabled={redeemMutation.isPending}
              />
              <Button
                onClick={() => tokenInput.trim() && redeemMutation.mutate(tokenInput.trim())}
                disabled={!tokenInput.trim() || redeemMutation.isPending}
                className="h-9 bg-emerald-600 hover:bg-emerald-500 text-white shrink-0"
              >
                {redeemMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Kullan"}
              </Button>
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Siteden satın aldığınız aktivasyon kodunu yapıştırın. Plan ve dönem hemen aktifleşir,
              mevcut kullanım sayaçlarınız sıfırlanır.
            </p>
          </div>
        </>
      )}

      {status.is_admin && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Admin hesabı — tüm limitler bypass.
        </div>
      )}
    </section>
  )
}

export function AccountDialog({ open, onOpenChange }: Props) {
  const [lines, setLines] = useState<WhatsAppLine[]>([])
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState("")
  const [clearing, setClearing] = useState(false)
  const queryClient = useQueryClient()
  const confirmDialog = useConfirm()
  const { isLinkOwner } = useIsLinkOwner()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const tick = async () => {
      try {
        const data = await listWhatsAppLines()
        if (!cancelled) setLines(data)
      } catch {}
    }
    tick()
    const id = setInterval(tick, 2500)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [open])

  const handleAdd = async () => {
    setAdding(true)
    try {
      const line = await createWhatsAppLine(newLabel || undefined)
      setLines((prev) => [...prev, line])
      setNewLabel("")
      toast.success("Hat eklendi, QR oluşturuluyor...")
    } catch {
      toast.error("Hat eklenemedi")
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Hat silinsin mi?",
      description: "Bu WhatsApp hattını silmek istediğinize emin misiniz? Oturum kaybedilecek.",
      confirmText: "Evet, sil",
      variant: "danger",
    })
    if (!ok) return
    try {
      await deleteWhatsAppLine(id)
      setLines((prev) => prev.filter((l) => l.id !== id))
      toast.success("Hat silindi")
    } catch {
      toast.error("Hat silinemedi")
    }
  }

  const handleReconnect = async (id: string) => {
    try {
      await reconnectWhatsAppLine(id)
      toast.success("Yeniden bağlantı başlatıldı")
    } catch {
      toast.error("Yeniden bağlantı başarısız")
    }
  }

  const handleClearData = async () => {
    const ok = await confirmDialog({
      title: "Tüm veriler silinsin mi?",
      description: "Tüm tarama verileri, işletmeler ve outreach logları silinecek. Bu işlem geri alınamaz.",
      confirmText: "Evet, tümünü sil",
      variant: "danger",
    })
    if (!ok) return
    setClearing(true)
    try {
      await clearAllData()
      toast.success("Tüm veriler silindi")
      queryClient.invalidateQueries()
      onOpenChange(false)
    } catch {
      toast.error("Veriler silinirken bir hata oluştu")
    } finally {
      setClearing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-zinc-800 bg-zinc-950 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Ayarlar</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Plan & Aktivasyon */}
          <PlanSection />

          {/* Hesap Bilgileri */}
          <ProfileSection />

          {/* Kısa Link Ayarları — sadece link_owner */}
          {isLinkOwner && <ShortLinkSettingsSection />}

          {/* WhatsApp Proxy — herkese açık */}
          <WhatsAppProxySection />

          {/* WhatsApp Hatları */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="size-5 text-emerald-400" />
              <span className="font-semibold text-zinc-100">WhatsApp Hatları</span>
            </div>

            <div className="space-y-2">
              {lines.length === 0 && (
                <p className="text-xs text-zinc-500">Henüz eklenmiş hat yok. Aşağıdan ekleyin.</p>
              )}
              {lines.map((line) => {
                const badge = STATUS_LABEL[line.status] || STATUS_LABEL.disconnected
                return (
                  <div
                    key={line.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-zinc-100 truncate">{line.label}</div>
                        {line.phone && (
                          <div className="flex items-center gap-1 text-xs text-zinc-500">
                            <Phone className="size-3" />
                            {line.phone}
                          </div>
                        )}
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${badge.color}`}>
                        {badge.text}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleReconnect(line.id)}
                        className="size-7 text-zinc-500 hover:text-zinc-200"
                        title="Yeniden bağlan"
                      >
                        <RefreshCw className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(line.id)}
                        className="size-7 text-zinc-500 hover:text-red-400"
                        title="Hattı sil"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    {line.status === "qr" && line.qr && (
                      <div className="flex flex-col items-center rounded-lg border border-zinc-800 bg-white p-3">
                        <img src={line.qr} alt="QR" className="size-48" />
                        <p className="mt-2 text-center text-[10px] text-zinc-600">
                          Telefon &gt; WhatsApp &gt; Bağlı Cihazlar &gt; Cihaz Ekle
                        </p>
                      </div>
                    )}
                    {(line.status === "initializing" || line.status === "authenticated") && !line.qr && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="size-5 animate-spin text-emerald-400" />
                      </div>
                    )}
                    {line.lastError && (
                      <div className="text-xs text-red-400">{line.lastError}</div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2 pt-2 border-t border-zinc-800">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Hat adı (örn. Ana Hat, Satış)"
                className="flex-1 h-9"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <Button
                onClick={handleAdd}
                disabled={adding}
                className="bg-emerald-600 hover:bg-emerald-500"
              >
                {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Numara Ekle
              </Button>
            </div>
          </section>

          {/* Veri Bölümü */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Trash2 className="size-5 text-red-400" />
              <span className="font-semibold text-zinc-100">Veriler</span>
            </div>
            <p className="text-xs text-zinc-500">
              Tüm işletmeleri, listeleri, tarama geçmişini ve outreach loglarını siler. Geri alınamaz.
            </p>
            <Button
              onClick={handleClearData}
              disabled={clearing}
              variant="ghost"
              className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              {clearing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
              Tüm Verileri Sil
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
