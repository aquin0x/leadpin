import { useQuery } from "@tanstack/react-query"
import { auth } from "@/lib/auth-client"

/**
 * Kullanıcının `link_owner` yetkisi olup olmadığını döner. Bu bayrak users
 * tablosunda bir kolondur ve yalnızca veritabanından set edilir; kullanıcı
 * değiştiremez. Short link / {link} özelliği sadece bu yetkiye sahip
 * hesaplara gösterilir.
 */
export function useIsLinkOwner() {
  const { data, isLoading } = useQuery({
    queryKey: ["isLinkOwner"],
    queryFn: async () => {
      const user = await auth.getUser()
      return !!user?.link_owner
    },
    staleTime: Infinity,
    gcTime: Infinity,
  })
  return { isLinkOwner: !!data, isLoading }
}
