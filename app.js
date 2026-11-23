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
  quiz: {
    queue: [],
    index: 0,
    score: 0,
    answered: false,
  },
};

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

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ words: state.words, streak: state.streak })
  );
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
  if (!state.words.length) return;
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
    state.flashIndex = (state.flashIndex - 1 + state.words.length) % state.words.length;
    renderFlash();
  });

  document.getElementById("btnNext").addEventListener("click", () => {
    state.flashIndex = (state.flashIndex + 1) % state.words.length;
    renderFlash();
  });

  document.getElementById("btnKnow").addEventListener("click", () => {
    const word = currentWord();
    word.status = "known";
    state.streak += 1;
    saveState();
    updateStats();
    state.flashIndex = (state.flashIndex + 1) % state.words.length;
    renderFlash();
  });

  document.getElementById("btnAgain").addEventListener("click", () => {
    const word = currentWord();
    word.status = "learning";
    state.streak = 0;
    saveState();
    updateStats();
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

function answerQuiz(correct, clickedBtn, correctId) {
  if (state.quiz.answered) return;
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

  if (correct) {
    state.quiz.score += 1;
    state.streak += 1;
    const word = state.words.find((w) => w.id === correctId);
    if (word && word.status !== "known") word.status = "learning";
    feedback.textContent = "정답이에요!";
    feedback.className = "quiz-feedback is-correct";
  } else {
    state.streak = 0;
    clickedBtn.classList.add("is-wrong");
    const word = state.words.find((w) => w.id === correctId);
    if (word) word.status = "learning";
    feedback.textContent = "아쉬워요. 다시 한번 외워봐요!";
    feedback.className = "quiz-feedback is-wrong";
  }

  document.getElementById("quizScore").textContent = `점수 ${state.quiz.score}`;
  saveState();
  updateStats();

  const isLast = state.quiz.index >= state.quiz.queue.length - 1;
  const nextBtn = document.getElementById("btnQuizNext");
  nextBtn.hidden = false;
  nextBtn.textContent = isLast ? "결과 보기" : "다음 문제";
}

function showQuizResult() {
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
}

function setupQuiz() {
  document.getElementById("btnQuizNext").addEventListener("click", () => {
    state.quiz.index += 1;
    renderQuiz();
  });
  document.getElementById("btnQuizRestart").addEventListener("click", startQuiz);
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
  document.getElementById("addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const en = document.getElementById("inputEn").value.trim();
    const ko = document.getElementById("inputKo").value.trim();
    const pos = document.getElementById("inputPos").value.trim();
    if (!en || !ko) return;

    state.words.unshift({
      id: crypto.randomUUID(),
      en,
      ko,
      pos,
      example: "",
      exampleKo: "",
      status: "new",
    });
    saveState();
    updateStats();
    e.target.reset();
    renderList();
    renderFlash();
  });

  document.getElementById("searchWords").addEventListener("input", renderList);
  document.getElementById("filterStatus").addEventListener("change", renderList);

  document.getElementById("wordList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='delete']");
    if (!btn) return;
    const item = btn.closest(".word-item");
    const id = item.dataset.id;
    state.words = state.words.filter((w) => w.id !== id);
    if (state.flashIndex >= state.words.length) state.flashIndex = 0;
    saveState();
    updateStats();
    renderList();
    renderFlash();
  });
}

/* ---------- Init ---------- */
function init() {
  loadState();
  setupTabs();
  setupFlash();
  setupQuiz();
  setupList();
  updateStats();
  renderFlash();
}

init();
