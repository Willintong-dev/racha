import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseEnabled = Boolean(supabaseUrl && supabaseKey)
export const supabase: SupabaseClient | null = supabaseEnabled ? createClient(supabaseUrl!, supabaseKey!) : null
