import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://ontaucdcmrkyvpflxtti.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_x-zRHHlxLCq1gh28aTv-0w_kht1wDxa';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
