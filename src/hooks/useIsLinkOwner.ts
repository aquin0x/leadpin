import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

/**
 * Kullanıcının `app_metadata.link_owner = true` flag'ine sahip olup olmadığını
 * döner. Bu flag Supabase'de service role ile set edilir, kullanıcı değiştiremez.
 * Short link / {link} özelliği sadece bu flag'e sahip hesaplara gösterilir.
 */
export function useIsLinkOwner() {
  const { data, isLoading } = useQuery({
    queryKey: ["isLinkOwner"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser()
      const meta = (data.user?.app_metadata ?? {}) as Record<string, unknown>
      return !!meta.link_owner
    },
    staleTime: Infinity,
    gcTime: Infinity,
  })
  return { isLinkOwner: !!data, isLoading }
}
