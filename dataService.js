import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase가 설정되지 않았습니다.");
  }
  return supabase;
}

function mapRowToWord(row) {
  return {
    id: row.id,
    en: row.en,
    ko: row.ko,
    pos: row.pos || "",
    example: row.example || "",
    exampleKo: row.example_ko || "",
    status: row.status || "new",
  };
}

function mapWordToRow(word, userId) {
  return {
    id: word.id,
    user_id: userId,
    en: word.en,
    ko: word.ko,
    pos: word.pos || null,
    example: word.example || null,
    example_ko: word.exampleKo || null,
    status: word.status || "new",
  };
}

export async function fetchUserWords(userId) {
  const client = requireClient();
  const { data, error } = await client
    .from("words")
    .select("id, en, ko, pos, example, example_ko, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(mapRowToWord);
}

export async function fetchUserStats(userId) {
  const client = requireClient();
  const { data, error } = await client
    .from("user_stats")
    .select("streak, last_studied_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || { streak: 0, last_studied_at: null };
}

export async function insertWord(userId, word) {
  const client = requireClient();
  const { data, error } = await client
    .from("words")
    .insert(mapWordToRow(word, userId))
    .select("id, en, ko, pos, example, example_ko, status, created_at")
    .single();

  if (error) throw new Error(error.message);
  return mapRowToWord(data);
}

export async function updateWordStatus(userId, wordId, status) {
  const client = requireClient();
  const { data, error } = await client
    .from("words")
    .update({ status })
    .eq("id", wordId)
    .eq("user_id", userId)
    .select("id, en, ko, pos, example, example_ko, status")
    .single();

  if (error) throw new Error(error.message);
  return mapRowToWord(data);
}

export async function deleteWord(userId, wordId) {
  const client = requireClient();
  const { error } = await client
    .from("words")
    .delete()
    .eq("id", wordId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}

export async function upsertUserStats(userId, streak) {
  const client = requireClient();
  const { data, error } = await client
    .from("user_stats")
    .upsert(
      {
        user_id: userId,
        streak,
        last_studied_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("streak")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function insertQuizSession(userId, score, total) {
  const client = requireClient();
  const { data, error } = await client
    .from("quiz_sessions")
    .insert({
      user_id: userId,
      score,
      total,
    })
    .select("id, score, total")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** 클라우드가 비어 있을 때 localStorage 단어를 한 번에 이전 */
export async function migrateLocalWords(userId, localWords, streak) {
  const client = requireClient();
  if (!localWords?.length) {
    await upsertUserStats(userId, streak || 0);
    return [];
  }

  const rows = localWords.map((w) => mapWordToRow(w, userId));
  const { data, error } = await client
    .from("words")
    .upsert(rows, { onConflict: "id" })
    .select("id, en, ko, pos, example, example_ko, status");

  if (error) throw new Error(error.message);
  await upsertUserStats(userId, streak || 0);
  return (data || []).map(mapRowToWord);
}
