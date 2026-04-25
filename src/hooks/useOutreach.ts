import { useMutation, useQueryClient } from "@tanstack/react-query"
import { sendWhatsAppSingle, type SendSingleResult } from "@/lib/api-client"
import { queryKeys } from "@/lib/query-keys"

export function useWhatsAppOutreach(businessId?: string) {
  const queryClient = useQueryClient()

  return useMutation<SendSingleResult, Error, { businessId: string; message: string }>({
    mutationFn: (vars) => sendWhatsAppSingle(vars),
    onSuccess: (res, vars) => {
      if (!res.ok) return
      // İşletme detayını (outreach_logs dahil) yenile
      queryClient.invalidateQueries({ queryKey: queryKeys.businesses.detail(vars.businessId) })
      // Dashboard'daki gönderildi listesini yenile
      queryClient.invalidateQueries({ queryKey: ["whatsappOutreach"] })
    },
  })
}
