import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

function mapAuthError(message = "") {
  const text = message.toLowerCase();
  if (text.includes("invalid api key")) {
    return "Supabase API 키가 올바르지 않습니다. .env의 VITE_SUPABASE_PUBLISHABLE_KEY를 Dashboard의 anon/publishable 키로 다시 넣어 주세요. (service_role 키는 사용하지 마세요)";
  }
  if (text.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }
  if (text.includes("user already registered")) {
    return "이미 가입된 이메일입니다. 로그인해 주세요.";
  }
  if (text.includes("email not confirmed")) {
    return "이메일 인증이 완료되지 않았습니다. 메일함의 인증 링크를 확인해 주세요.";
  }
  if (text.includes("password should be at least")) {
    return "비밀번호는 최소 6자 이상이어야 합니다.";
  }
  if (text.includes("unable to validate email")) {
    return "이메일 형식이 올바르지 않습니다.";
  }
  if (text.includes("signup is disabled")) {
    return "현재 회원가입이 비활성화되어 있습니다. Supabase 설정을 확인해 주세요.";
  }
  return message || "요청을 처리하지 못했습니다.";
}

export function assertAuthReady() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      "Supabase가 설정되지 않았습니다. .env의 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY를 확인하세요."
    );
  }
}

/** 비밀번호는 Supabase Auth로만 전달하며, 앱/로컬에 저장하지 않습니다. */
export async function signUpWithEmail(email, password) {
  assertAuthReady();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    throw new Error(mapAuthError(error.message));
  }
  return data;
}

export async function signInWithEmail(email, password) {
  assertAuthReady();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    throw new Error(mapAuthError(error.message));
  }
  return data;
}

export async function signOut() {
  assertAuthReady();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(mapAuthError(error.message));
  }
}

export async function getCurrentSession() {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("[WordNest] getSession:", error.message);
    return null;
  }
  return data.session;
}

export function onAuthChange(callback) {
  if (!isSupabaseConfigured || !supabase) {
    callback(null);
    return { data: { subscription: { unsubscribe() {} } } };
  }
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
