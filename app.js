import { testSupabaseConnection } from "./supabaseClient.js";
import {
  getCurrentSession,
  onAuthChange,
  signInWithEmail,
  signOut,
  signUpWithEmail,
} from "./auth.js";
import {
  deleteWord as deleteWordRemote,
  fetchUserStats,
  fetchUserWords,
  insertQuizSession,
  insertWord,
  migrateLocalWords,
  updateWordStatus,
  upsertUserStats,
} from "./dataService.js";

const STORAGE_KEY = "wordnest-v1";

const DEFAULT_WORDS = [
  { en: "abandon", ko: "포기하다, 버리다", pos: "verb", example: "Don't abandon your goals.", exampleKo: "목표를 포기하지 마세요." },
  { en: "benefit", ko: "이익, 혜택", pos: "noun", example: "Exercise has many benefits.", exampleKo: "운동에는 많은 이점이 있습니다." },
  { en: "curious", ko: "호기심 많은", pos: "adj", example: "She is curious about science.", exampleKo: "그녀는 과학에 호기심이 많습니다." },
  { en: "diligent", ko: "부지런한", pos: "adj", example: "He is a diligent student.", exampleKo: "그는 부지런한 학생입니다." },
  { en: "enormous", ko: "거대한", pos: "adj", example: "They live in an enormous house.", exampleKo: "그들은 거대한 집에 삽니다." },
  { en: "fragile", ko: "깨지기 쉬운", pos: "adj", example: "Handle the fragile box carefully.", exampleKo: "깨지기 쉬운 상자를 조심히 다루세요." },
  { en: "grateful", ko: "감사하는", pos: "adj", example: "I am grateful for your help.", exampleKo: "도움에 감사드립니다." },
  { en: "hesitate", ko: "망설이다", pos: "verb", example: "Don't hesitate to ask questions.", exampleKo: "질문하는 것을 망설이지 마세요." },
  { en: "improve", ko: "향상시키다", pos: "verb", example: "Reading helps improve vocabulary.", exampleKo: "독서는 어휘력을 향상시킵니다." },
  { en: "journey", ko: "여행, 여정", pos: "noun", example: "Learning is a long journey.", exampleKo: "배움은 긴 여정입니다." },
  { en: "knowledge", ko: "지식", pos: "noun", example: "Knowledge is power.", exampleKo: "지식은 힘이다." },
  { en: "loyal", ko: "충성스러운", pos: "adj", example: "Dogs are loyal companions.", exampleKo: "개는 충성스러운 동반자입니다." },
  { en: "modest", ko: "겸손한", pos: "adj", example: "She gave a modest reply.", exampleKo: "그녀는 겸손하게 대답했습니다." },
  { en: "necessary", ko: "필요한", pos: "adj", example: "Sleep is necessary for health.", exampleKo: "수면은 건강에 필요합니다." },
  { en: "observe", ko: "관찰하다", pos: "verb", example: "Scientists observe carefully.", exampleKo: "과학자들은 주의 깊게 관찰합니다." },
  { en: "patient", ko: "참을성 있는 / 환자", pos: "adj/noun", example: "Please be patient.", exampleKo: "조금만 참아 주세요." },
  { en: "reliable", ko: "믿을 수 있는", pos: "adj", example: "He is a reliable friend.", exampleKo: "그는 믿을 수 있는 친구입니다." },
  { en: "survive", ko: "살아남다", pos: "verb", example: "Plants need water to survive.", exampleKo: "식물은 살아남기 위해 물이 필요합니다." },
  { en: "tremendous", ko: "엄청난", pos: "adj", example: "She made tremendous progress.", exampleKo: "그녀는 엄청난 발전을 이루었습니다." },
  { en: "unique", ko: "독특한", pos: "adj", example: "Everyone has a unique voice.", exampleKo: "누구나 독특한 목소리를 가지고 있습니다." },
];

const state = {
  words: [],
  flashIndex: 0,
  flipped: false,
  streak: 0,
  userId: null,
  cloudMode: false,
  isBusy: false,
  quiz: {
    queue: [],
    index: 0,
    score: 0,
    answered: false,
  },
};

function readLocalSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { words: [], streak: 0 };
    const data = JSON.parse(raw);
    return {
      words: Array.isArray(data.words) ? data.words : [],
      streak: data.streak || 0,
    };
  } catch {
    return { words: [], streak: 0 };
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state.words = DEFAULT_WORDS.map((w) => ({
        ...w,
        id: crypto.randomUUID(),
        status: "new",
      }));
      state.streak = 0;
      saveState();
      return;
    }
    const data = JSON.parse(raw);
    state.words = data.words?.length
      ? data.words
      : DEFAULT_WORDS.map((w) => ({ ...w, id: crypto.randomUUID(), status: "new" }));
    state.streak = data.streak || 0;
  } catch {
    state.words = DEFAULT_WORDS.map((w) => ({
      ...w,
      id: crypto.randomUUID(),
      status: "new",
    }));
    state.streak = 0;
  }
}

/**
 * 게스트(비로그인) 로컬 저장만 갱신합니다.
 * 로그인(cloud) 모드에서는 게스트 데이터를 덮어쓰지 않아
 * 로그아웃 시 이전 로컬 학습 기록을 복구할 수 있습니다.
 */
function saveState() {
  if (state.cloudMode) return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ words: state.words, streak: state.streak })
  );
}

function setSyncStatus(text, isError = false, isBusy = false) {
  const el = document.getElementById("syncStatus");
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("is-error", "is-busy");
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle("is-error", isError);
  el.classList.toggle("is-busy", isBusy && !isError);
}

function setBusy(busy) {
  state.isBusy = busy;
  document.body.classList.toggle("is-syncing", busy);
  const addBtn = document.querySelector("#addForm button[type='submit']");
  if (addBtn) addBtn.disabled = busy;
  document.getElementById("btnKnow").disabled = busy;
  document.getElementById("btnAgain").disabled = busy;
}

async function withBusy(task, busyMessage) {
  if (state.isBusy) return null;
  setBusy(true);
  if (busyMessage) setSyncStatus(busyMessage, false, true);
  try {
    return await task();
  } finally {
    setBusy(false);
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function updateStats() {
  const known = state.words.filter((w) => w.status === "known").length;
  const learning = state.words.filter((w) => w.status === "learning").length;
  document.getElementById("statKnown").textContent = known;
  document.getElementById("statLearning").textContent = learning;
  document.getElementById("statStreak").textContent = state.streak;
}

function resetQuizState() {
  state.quiz = {
    queue: [],
    index: 0,
    score: 0,
    answered: false,
  };
}

/** 플래시·단어장·통계를 항상 함께 갱신 */
function refreshViews() {
  updateStats();
  renderFlash();
  renderList();
}

/** 로그아웃: 클라우드 사용자 데이터를 화면에서 제거하고 게스트 로컬로 복귀 */
function resetToGuestData() {
  state.userId = null;
  state.cloudMode = false;
  state.flashIndex = 0;
  resetQuizState();
  loadState();
  refreshViews();
  setSyncStatus("로그아웃되어 클라우드 데이터를 초기화했습니다. 로컬 모드입니다.");
}

/**
 * 로그인한 사용자 단어/통계를 Supabase에서 다시 조회 (최신순).
 * 저장 직후·새로고침·로그인 시 공통으로 사용합니다.
 */
async function reloadCloudWords({ message } = {}) {
  if (!state.userId) {
    throw new Error("로그인이 필요합니다.");
  }

  const words = await fetchUserWords(state.userId);
  const stats = await fetchUserStats(state.userId);

  state.cloudMode = true;
  state.words = words;
  state.streak = stats.streak || 0;
  if (state.flashIndex >= state.words.length) {
    state.flashIndex = Math.max(0, state.words.length - 1);
  }

  refreshViews();

  if (message) {
    setSyncStatus(message);
  } else if (!words.length) {
    setSyncStatus("저장된 단어가 없습니다. 단어장에서 새 단어를 추가해 보세요.");
  } else {
    setSyncStatus(`내 단어 ${words.length}개를 불러왔습니다. (최신순)`);
  }

  console.info("[WordNest] Cloud reload OK", {
    userId: state.userId,
    words: state.words.length,
    streak: state.streak,
  });

  return words;
}

let sessionSyncLock = false;

/**
 * 로그인 사용자 데이터 로드.
 * 클라우드가 비어 있으면 localStorage를 이전(유실 방지) 후 사용.
 */
async function applySessionData(session) {
  if (sessionSyncLock) return;
  sessionSyncLock = true;

  try {
    if (!session?.user) {
      resetToGuestData();
      return;
    }

    state.userId = session.user.id;

    await withBusy(async () => {
      try {
        setSyncStatus("클라우드 데이터를 불러오는 중…", false, true);
        let words = await fetchUserWords(state.userId);

        if (!words.length) {
          const local = readLocalSnapshot();
          const sourceWords = local.words.length
            ? local.words
            : DEFAULT_WORDS.map((w) => ({
                ...w,
                id: crypto.randomUUID(),
                status: "new",
              }));
          const sourceStreak = local.words.length ? local.streak || 0 : 0;

          setSyncStatus(
            local.words.length
              ? "로컬 단어를 클라우드로 이전하는 중… (게스트 로컬 데이터는 유지됩니다)"
              : "기본 단어를 클라우드에 저장하는 중…",
            false,
            true
          );

          await migrateLocalWords(state.userId, sourceWords, sourceStreak);
          words = await reloadCloudWords({
            message: local.words.length
              ? `로컬 단어 ${sourceWords.length}개를 클라우드에 저장·불러왔습니다.`
              : `기본 단어 ${sourceWords.length}개를 클라우드에 저장·불러왔습니다.`,
          });
        } else {
          state.flashIndex = 0;
          await reloadCloudWords();
        }
      } catch (err) {
        state.cloudMode = false;
        state.words = [];
        state.streak = 0;
        state.flashIndex = 0;
        resetQuizState();
        refreshViews();
        setSyncStatus(`불러오기 실패: ${err.message}`, true);
        console.error("[WordNest] Cloud sync failed", err);
      }
    });
  } finally {
    sessionSyncLock = false;
  }
}

/** 클라우드 모드면 원격 저장 성공 후에만 로컬 state 반영 */
async function persistWordStatus(word, nextStatus, nextStreak) {
  if (!state.cloudMode || !state.userId) {
    word.status = nextStatus;
    state.streak = nextStreak;
    saveState();
    updateStats();
    return true;
  }

  return withBusy(async () => {
    try {
      setSyncStatus("저장 중…", false, true);
      const saved = await updateWordStatus(state.userId, word.id, nextStatus);
      await upsertUserStats(state.userId, nextStreak);
      word.status = saved.status;
      state.streak = nextStreak;
      refreshViews();
      setSyncStatus("클라우드에 저장했습니다.");
      console.info("[WordNest] Saved word status", saved);
      return true;
    } catch (err) {
      setSyncStatus(`저장 실패: ${err.message}`, true);
      console.error("[WordNest] Save word status failed", err);
      return false;
    }
  });
}

/* ---------- Tabs ---------- */
function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.mode;
      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", active);
      });
      document.querySelectorAll(".panel").forEach((panel) => {
        const match = panel.id === `panel-${mode}`;
        panel.classList.toggle("is-active", match);
        panel.hidden = !match;
      });
      if (mode === "flash") renderFlash();
      if (mode === "quiz") startQuiz();
      if (mode === "list") renderList();
    });
  });
}

/* ---------- Flashcards ---------- */
function currentWord() {
  return state.words[state.flashIndex];
}

function renderFlash() {
  if (!state.words.length) {
    document.getElementById("flashPos").textContent = "";
    document.getElementById("flashPosBack").textContent = "";
    document.getElementById("flashWord").textContent = "단어 없음";
    document.getElementById("flashMeaning").textContent = state.cloudMode
      ? "아직 저장된 단어가 없습니다"
      : "단어를 추가해 주세요";
    document.getElementById("flashExample").textContent = "";
    document.getElementById("flashExampleKo").textContent = "";
    document.getElementById("flashCount").textContent = "0 / 0";
    document.getElementById("flashHint").textContent = state.cloudMode
      ? "단어장에서 단어를 추가하면 여기에 표시됩니다"
      : "카드를 클릭하면 뜻이 보입니다";
    document.getElementById("flashProgress").style.width = "0%";
    return;
  }
  if (state.flashIndex >= state.words.length) state.flashIndex = 0;

  const word = currentWord();
  const card = document.getElementById("flashcard");
  state.flipped = false;
  card.classList.remove("is-flipped");

  document.getElementById("flashPos").textContent = word.pos || "";
  document.getElementById("flashPosBack").textContent = word.pos || "";
  document.getElementById("flashWord").textContent = word.en;
  document.getElementById("flashMeaning").textContent = word.ko;
  document.getElementById("flashExample").textContent = word.example || "";
  document.getElementById("flashExampleKo").textContent = word.exampleKo || "";
  document.getElementById("flashCount").textContent = `${state.flashIndex + 1} / ${state.words.length}`;
  document.getElementById("flashHint").textContent = "카드를 클릭하면 뜻이 보입니다";

  const known = state.words.filter((w) => w.status === "known").length;
  const pct = state.words.length ? (known / state.words.length) * 100 : 0;
  document.getElementById("flashProgress").style.width = `${pct}%`;
}

function setupFlash() {
  const card = document.getElementById("flashcard");
  card.addEventListener("click", () => {
    state.flipped = !state.flipped;
    card.classList.toggle("is-flipped", state.flipped);
    document.getElementById("flashHint").textContent = state.flipped
      ? "다시 클릭하면 영어로 돌아갑니다"
      : "카드를 클릭하면 뜻이 보입니다";
  });

  document.getElementById("btnPrev").addEventListener("click", () => {
    if (!state.words.length) return;
    state.flashIndex = (state.flashIndex - 1 + state.words.length) % state.words.length;
    renderFlash();
  });

  document.getElementById("btnNext").addEventListener("click", () => {
    if (!state.words.length) return;
    state.flashIndex = (state.flashIndex + 1) % state.words.length;
    renderFlash();
  });

  document.getElementById("btnKnow").addEventListener("click", async () => {
    if (state.isBusy || !state.words.length) return;
    const word = currentWord();
    const ok = await persistWordStatus(word, "known", state.streak + 1);
    if (!ok) return;
    state.flashIndex = (state.flashIndex + 1) % state.words.length;
    renderFlash();
  });

  document.getElementById("btnAgain").addEventListener("click", async () => {
    if (state.isBusy || !state.words.length) return;
    const word = currentWord();
    const ok = await persistWordStatus(word, "learning", 0);
    if (!ok) return;
    state.flashIndex = (state.flashIndex + 1) % state.words.length;
    renderFlash();
  });
}

/* ---------- Quiz ---------- */
function startQuiz() {
  if (state.words.length < 4) {
    document.getElementById("quizWord").textContent = "단어가 부족해요";
    document.getElementById("quizExample").textContent = "퀴즈를 위해 단어 4개 이상이 필요합니다.";
    document.getElementById("quizChoices").innerHTML = "";
    document.getElementById("quizFeedback").hidden = true;
    document.getElementById("btnQuizNext").hidden = true;
    document.getElementById("btnQuizRestart").hidden = false;
    return;
  }

  const count = Math.min(10, state.words.length);
  state.quiz.queue = shuffle(state.words).slice(0, count);
  state.quiz.index = 0;
  state.quiz.score = 0;
  state.quiz.answered = false;
  document.getElementById("btnQuizRestart").hidden = true;
  document.getElementById("btnQuizNext").hidden = true;
  renderQuiz();
}

function renderQuiz() {
  const { queue, index, score } = state.quiz;
  if (index >= queue.length) {
    showQuizResult();
    return;
  }

  const word = queue[index];
  state.quiz.answered = false;

  document.getElementById("quizProgress").textContent = `문제 ${index + 1} / ${queue.length}`;
  document.getElementById("quizScore").textContent = `점수 ${score}`;
  document.getElementById("quizWord").textContent = word.en;
  document.getElementById("quizExample").textContent = word.example || "";
  document.getElementById("quizFeedback").hidden = true;
  document.getElementById("btnQuizNext").hidden = true;
  document.getElementById("btnQuizRestart").hidden = true;

  const wrongs = shuffle(state.words.filter((w) => w.id !== word.id)).slice(0, 3);
  const choices = shuffle([word, ...wrongs]);

  const box = document.getElementById("quizChoices");
  box.innerHTML = "";
  choices.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice";
    btn.textContent = c.ko;
    btn.addEventListener("click", () => answerQuiz(c.id === word.id, btn, word.id));
    box.appendChild(btn);
  });
}

async function answerQuiz(correct, clickedBtn, correctId) {
  if (state.quiz.answered || state.isBusy) return;
  state.quiz.answered = true;

  const buttons = [...document.querySelectorAll(".choice")];
  buttons.forEach((btn) => {
    btn.disabled = true;
    if (btn.textContent === state.words.find((w) => w.id === correctId)?.ko) {
      btn.classList.add("is-correct");
    }
  });

  const feedback = document.getElementById("quizFeedback");
  feedback.hidden = false;

  const word = state.words.find((w) => w.id === correctId);
  const nextStatus =
    correct && word?.status === "known"
      ? "known"
      : "learning";
  const nextStreak = correct ? state.streak + 1 : 0;
  const nextScore = correct ? state.quiz.score + 1 : state.quiz.score;

  if (correct) {
    feedback.textContent = "정답이에요!";
    feedback.className = "quiz-feedback is-correct";
  } else {
    clickedBtn.classList.add("is-wrong");
    feedback.textContent = "아쉬워요. 다시 한번 외워봐요!";
    feedback.className = "quiz-feedback is-wrong";
  }

  if (word) {
    const ok = await persistWordStatus(word, nextStatus, nextStreak);
    if (!ok) {
      feedback.textContent = correct
        ? "정답이지만 저장에 실패했습니다. 다시 시도해 주세요."
        : "저장에 실패했습니다. 다시 시도해 주세요.";
      feedback.className = "quiz-feedback is-wrong";
      state.quiz.answered = false;
      buttons.forEach((btn) => {
        btn.disabled = false;
        btn.classList.remove("is-correct", "is-wrong");
      });
      return;
    }
  }

  state.quiz.score = nextScore;
  document.getElementById("quizScore").textContent = `점수 ${state.quiz.score}`;

  const isLast = state.quiz.index >= state.quiz.queue.length - 1;
  const nextBtn = document.getElementById("btnQuizNext");
  nextBtn.hidden = false;
  nextBtn.textContent = isLast ? "결과 보기" : "다음 문제";
}

async function showQuizResult() {
  const { score, queue } = state.quiz;
  document.getElementById("quizProgress").textContent = "완료!";
  document.getElementById("quizScore").textContent = `점수 ${score}`;
  document.getElementById("quizWord").textContent = `${score} / ${queue.length}`;
  document.getElementById("quizExample").textContent =
    score === queue.length
      ? "완벽해요! 오늘도 한 걸음 성장했습니다."
      : "잘했어요. 틀린 단어는 플래시카드로 복습해 보세요.";
  document.getElementById("quizChoices").innerHTML = "";
  document.getElementById("quizFeedback").hidden = true;
  document.getElementById("btnQuizNext").hidden = true;
  document.getElementById("btnQuizRestart").hidden = false;

  if (state.cloudMode && state.userId) {
    await withBusy(async () => {
      try {
        setSyncStatus("퀴즈 결과 저장 중…", false, true);
        const saved = await insertQuizSession(state.userId, score, queue.length);
        setSyncStatus(`퀴즈 결과를 클라우드에 저장했습니다. (${saved.score}/${saved.total})`);
        console.info("[WordNest] Quiz session saved", saved);
      } catch (err) {
        setSyncStatus(`퀴즈 결과 저장 실패: ${err.message}`, true);
        console.error("[WordNest] Quiz session save failed", err);
      }
    });
  }
}

function setupQuiz() {
  document.getElementById("btnQuizNext").addEventListener("click", () => {
    if (state.isBusy) return;
    state.quiz.index += 1;
    renderQuiz();
  });
  document.getElementById("btnQuizRestart").addEventListener("click", () => {
    if (state.isBusy) return;
    startQuiz();
  });
}

/* ---------- Word list ---------- */
function statusLabel(status) {
  if (status === "known") return { text: "외움", cls: "badge--known" };
  if (status === "learning") return { text: "학습중", cls: "badge--learning" };
  return { text: "새 단어", cls: "badge--new" };
}

function renderList() {
  const q = document.getElementById("searchWords").value.trim().toLowerCase();
  const filter = document.getElementById("filterStatus").value;

  const list = document.getElementById("wordList");
  const filtered = state.words.filter((w) => {
    const matchQ =
      !q ||
      w.en.toLowerCase().includes(q) ||
      w.ko.toLowerCase().includes(q);
    const matchF = filter === "all" || w.status === filter;
    return matchQ && matchF;
  });

  if (!state.words.length) {
    list.innerHTML = `<li class="empty">${
      state.cloudMode
        ? "클라우드에 저장된 단어가 없습니다. 위에서 새 단어를 추가해 보세요."
        : "아직 단어가 없습니다. 새 단어를 추가해 보세요."
    }</li>`;
    return;
  }

  if (!filtered.length) {
    list.innerHTML = `<li class="empty">조건에 맞는 단어가 없습니다.</li>`;
    return;
  }

  list.innerHTML = filtered
    .map((w) => {
      const badge = statusLabel(w.status);
      return `
        <li class="word-item" data-id="${w.id}">
          <div>
            <div class="word-item__en">${escapeHtml(w.en)}</div>
            <div class="word-item__ko">${escapeHtml(w.ko)}</div>
          </div>
          <div class="word-item__actions">
            <button type="button" class="btn btn--danger" data-action="delete">삭제</button>
          </div>
          <div class="word-item__meta">
            <span class="badge ${badge.cls}">${badge.text}</span>
            ${w.pos ? `<span class="badge badge--new">${escapeHtml(w.pos)}</span>` : ""}
          </div>
        </li>
      `;
    })
    .join("");
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setupList() {
  document.getElementById("addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (state.isBusy) return;

    const en = document.getElementById("inputEn").value.trim();
    const ko = document.getElementById("inputKo").value.trim();
    const pos = document.getElementById("inputPos").value.trim();
    if (!en || !ko) return;

    const draft = {
      id: crypto.randomUUID(),
      en,
      ko,
      pos,
      example: "",
      exampleKo: "",
      status: "new",
    };

    if (!state.cloudMode || !state.userId) {
      state.words.unshift(draft);
      saveState();
      updateStats();
      e.target.reset();
      renderList();
      renderFlash();
      return;
    }

    await withBusy(async () => {
      try {
        setSyncStatus("단어 저장 중…", false, true);
        const saved = await insertWord(state.userId, draft);
        // 저장 성공 후에만 화면 반영 + DB 최신순 재조회
        e.target.reset();
        state.flashIndex = 0;
        await reloadCloudWords({
          message: `「${saved.en}」을(를) 저장했고 목록을 갱신했습니다.`,
        });
        console.info("[WordNest] Word inserted", saved);
      } catch (err) {
        setSyncStatus(`단어 저장 실패: ${err.message}`, true);
        console.error("[WordNest] Word insert failed", err);
      }
    });
  });

  document.getElementById("searchWords").addEventListener("input", renderList);
  document.getElementById("filterStatus").addEventListener("change", renderList);

  document.getElementById("wordList").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action='delete']");
    if (!btn || state.isBusy) return;
    const item = btn.closest(".word-item");
    const id = item.dataset.id;

    if (!state.cloudMode || !state.userId) {
      state.words = state.words.filter((w) => w.id !== id);
      if (state.flashIndex >= state.words.length) state.flashIndex = 0;
      saveState();
      updateStats();
      renderList();
      renderFlash();
      return;
    }

    await withBusy(async () => {
      try {
        setSyncStatus("삭제 중…", false, true);
        await deleteWordRemote(state.userId, id);
        // 삭제 성공 후에만 재조회로 화면 갱신
        await reloadCloudWords({
          message: "단어를 삭제했고 목록을 갱신했습니다.",
        });
        console.info("[WordNest] Word deleted", id);
      } catch (err) {
        setSyncStatus(`삭제 실패: ${err.message}`, true);
        console.error("[WordNest] Word delete failed", err);
      }
    });
  });
}

/* ---------- Auth ---------- */
let authMode = "login";

function setAuthMessage(text, isError = false) {
  const el = document.getElementById("authMessage");
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("is-error");
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle("is-error", isError);
}

function setAuthFormError(text) {
  const el = document.getElementById("authFormError");
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = text;
}

function openAuthModal(mode = "login") {
  authMode = mode;
  document.querySelectorAll(".auth-mode-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.authMode === mode);
  });
  document.getElementById("authSubmit").textContent =
    mode === "signup" ? "회원가입" : "로그인";
  document.getElementById("authPassword").autocomplete =
    mode === "signup" ? "new-password" : "current-password";
  document.getElementById("authVerifyHint").hidden = true;
  setAuthFormError("");
  document.getElementById("authModal").hidden = false;
}

function closeAuthModal() {
  document.getElementById("authModal").hidden = true;
  document.getElementById("authForm").reset();
  setAuthFormError("");
}

function renderAuthUser(session) {
  const guest = document.getElementById("authGuest");
  const userBox = document.getElementById("authUser");
  const emailEl = document.getElementById("authUserEmail");
  const metaEl = document.getElementById("authUserMeta");

  if (!session?.user) {
    guest.hidden = false;
    userBox.hidden = true;
    emailEl.textContent = "";
    metaEl.textContent = "";
    return;
  }

  const user = session.user;
  guest.hidden = true;
  userBox.hidden = false;
  emailEl.textContent = user.email || "(이메일 없음)";

  const verified = Boolean(user.email_confirmed_at);
  const created = user.created_at
    ? new Date(user.created_at).toLocaleDateString("ko-KR")
    : "";
  metaEl.textContent = verified
    ? `이메일 인증 완료${created ? ` · 가입일 ${created}` : ""}`
    : `이메일 미인증${created ? ` · 가입일 ${created}` : ""}`;
}

function setupAuth() {
  document.getElementById("btnOpenAuth").addEventListener("click", () => {
    openAuthModal("login");
  });
  document.getElementById("btnCloseAuth").addEventListener("click", closeAuthModal);
  document.querySelector("[data-close-auth]").addEventListener("click", closeAuthModal);

  document.querySelectorAll(".auth-mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      openAuthModal(tab.dataset.authMode);
    });
  });

  document.getElementById("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    const submitBtn = document.getElementById("authSubmit");

    setAuthFormError("");
    document.getElementById("authVerifyHint").hidden = true;
    submitBtn.disabled = true;

    try {
      if (authMode === "signup") {
        const data = await signUpWithEmail(email, password);
        const needsVerify = !data.session;
        if (needsVerify) {
          document.getElementById("authVerifyHint").hidden = false;
          setAuthMessage(
            "인증 메일을 보냈습니다. 메일함의 링크를 확인한 뒤 로그인해 주세요."
          );
        } else {
          closeAuthModal();
          setAuthMessage(`${email} 계정으로 가입·로그인되었습니다.`);
        }
      } else {
        await signInWithEmail(email, password);
        closeAuthModal();
        setAuthMessage(`${email} 계정으로 로그인했습니다.`);
      }
    } catch (err) {
      setAuthFormError(err.message || "요청에 실패했습니다.");
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById("btnLogout").addEventListener("click", async () => {
    try {
      await signOut();
      setAuthMessage("로그아웃되었습니다.");
      // onAuthChange에서도 초기화되지만, 즉시 화면을 비우기 위해 한 번 더 처리
      resetToGuestData();
    } catch (err) {
      setAuthMessage(err.message || "로그아웃에 실패했습니다.", true);
    }
  });

  onAuthChange(async (session) => {
    renderAuthUser(session);
    await applySessionData(session);
  });
}

/* ---------- Init ---------- */
async function init() {
  // 먼저 게스트 로컬을 보여 준 뒤, 세션이 있으면 클라우드로 교체
  loadState();
  setupTabs();
  setupFlash();
  setupQuiz();
  setupList();
  setupAuth();
  refreshViews();

  const session = await getCurrentSession();
  renderAuthUser(session);
  if (session?.user) {
    await applySessionData(session);
  } else {
    setSyncStatus("로컬 저장 모드입니다. 로그인하면 내 클라우드 단어를 불러옵니다.");
  }

  const supabaseStatus = await testSupabaseConnection();
  console.info("[WordNest] Supabase:", supabaseStatus);
}

init();
