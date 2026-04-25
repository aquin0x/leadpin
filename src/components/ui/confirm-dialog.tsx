import { createContext, useCallback, useContext, useState } from "react"
import { AlertTriangle, Info, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ConfirmOptions {
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: "default" | "danger" | "warning"
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

interface State extends ConfirmOptions {
  open: boolean
  resolve: ((v: boolean) => void) | null
}

const VARIANT_META = {
  default: {
    icon: Info,
    iconBg: "bg-blue-500/10",
    iconText: "text-blue-400",
    btn: "bg-blue-600 hover:bg-blue-500",
  },
  danger: {
    icon: Trash2,
    iconBg: "bg-red-500/10",
    iconText: "text-red-400",
    btn: "bg-red-600 hover:bg-red-500",
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-400",
    btn: "bg-amber-600 hover:bg-amber-500",
  },
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({
    open: false,
    resolve: null,
  })

  const confirm: ConfirmFn = useCallback((opts) => {
    return new Promise<boolean>((resolve) => {
      setState({
        open: true,
        resolve,
        title: opts.title ?? "Emin misiniz?",
        description: opts.description,
        confirmText: opts.confirmText ?? "Evet, onayla",
        cancelText: opts.cancelText ?? "İptal",
        variant: opts.variant ?? "default",
      })
    })
  }, [])

  const handleClose = (result: boolean) => {
    state.resolve?.(result)
    setState((s) => ({ ...s, open: false, resolve: null }))
  }

  const meta = VARIANT_META[state.variant ?? "default"]
  const Icon = meta.icon

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={state.open} onOpenChange={(o) => !o && handleClose(false)}>
        <DialogContent className="max-w-md border-zinc-800 bg-zinc-950">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl",
                  meta.iconBg
                )}
              >
                <Icon className={cn("size-5", meta.iconText)} />
              </div>
              <div className="flex-1 pt-0.5">
                <DialogTitle className="text-zinc-100">{state.title}</DialogTitle>
                {state.description && (
                  <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">
                    {state.description}
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              onClick={() => handleClose(false)}
              variant="ghost"
              className="text-zinc-300 hover:text-zinc-100"
            >
              {state.cancelText}
            </Button>
            <Button
              onClick={() => handleClose(true)}
              className={cn("text-white shadow-lg", meta.btn)}
              autoFocus
            >
              {state.confirmText}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider")
  return ctx
}
