import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * anon / publishable key만 사용합니다.
 * service_role / secret key는 절대 넣지 마세요.
 */
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabasePublishableKey &&
    !supabaseUrl.includes("your-project") &&
    supabasePublishableKey !== "your-publishable-or-anon-key"
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: localStorage,
      },
    })
  : null;

/**
 * 테이블/비밀키 없이 연결만 확인하는 안전한 테스트입니다.
 * 브라우저 콘솔에서 결과를 확인하세요.
 */
export async function testSupabaseConnection() {
  if (!isSupabaseConfigured || !supabase) {
    return {
      ok: false,
      reason: "missing-env",
      message:
        ".env에 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY를 설정한 뒤 npm run dev로 다시 실행하세요.",
    };
  }

  try {
    const { error } = await supabase.auth.getSession();
    if (error) {
      return {
        ok: false,
        reason: "auth-error",
        message: error.message,
      };
    }

    return {
      ok: true,
      reason: "connected",
      message: "Supabase 클라이언트 연결 성공 (auth.getSession)",
      urlHost: new URL(supabaseUrl).host,
    };
  } catch (err) {
    return {
      ok: false,
      reason: "exception",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
