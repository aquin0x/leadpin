import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase URL ve Anon Key .env dosyasında tanımlanmalıdır")
}

export const supabase = createClient(supabaseUrl, supabaseKey)
