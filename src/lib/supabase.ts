import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** 주소에 ?demo 가 붙으면 가상 데이터로 화면만 보여준다 (실제 DB 접근 없음) */
export const IS_DEMO = new URLSearchParams(location.search).has('demo');
