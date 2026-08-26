import { useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { auth } from "@/lib/auth-client"

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "auth" | "unauth">("loading")

  useEffect(() => {
    auth.getSession().then((session) => {
      setStatus(session ? "auth" : "unauth")
    })

    // Supabase'de bu `data.subscription.unsubscribe()` idi; yeni istemci
    // doğrudan iptal fonksiyonunu döner.
    const unsubscribe = auth.onAuthStateChange((session) => {
      setStatus(session ? "auth" : "unauth")
    })

    return unsubscribe
  }, [])

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-500" />
      </div>
    )
  }

  if (status === "unauth") {
    return <Navigate to="/auth" replace />
  }

  return <>{children}</>
}
