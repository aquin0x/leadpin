import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

if (process.env.ENV_FILE_PATH) {
  dotenv.config({ path: process.env.ENV_FILE_PATH });
} else {
  dotenv.config();
}

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service role client has admin privileges, used for backend operations
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});
