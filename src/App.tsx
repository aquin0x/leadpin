import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { Toaster } from "react-hot-toast"
import { QueryProvider } from "@/providers/QueryProvider"
import { ConfirmProvider } from "@/components/ui/confirm-dialog"
import { AuthPage } from "@/pages/AuthPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { BusinessDetailPage } from "@/pages/BusinessDetailPage"
import { ProtectedRoute } from "@/components/ProtectedRoute"

export default function App() {
  return (
    <QueryProvider>
      <ConfirmProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/businesses/:id"
            element={
              <ProtectedRoute>
                <BusinessDetailPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#18181b",
            color: "#f4f4f5",
            border: "1px solid #27272a",
            fontSize: "14px",
          },
          success: {
            iconTheme: { primary: "#10b981", secondary: "#18181b" },
          },
          error: {
            iconTheme: { primary: "#ef4444", secondary: "#18181b" },
          },
        }}
      />
      </ConfirmProvider>
    </QueryProvider>
  )
}
