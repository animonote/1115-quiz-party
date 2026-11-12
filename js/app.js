/* =========================================================
   記念日クイズ  本体
   問題や文言の変更は config.js で行ってください。
   ========================================================= */
(function () {
  "use strict";

  const CFG = window.QUIZ_CONFIG;
  const MARKS = ["A", "B", "C", "D"];
  const $ = (id) => document.getElementById(id);

  const el = {
    screens: document.querySelectorAll(".screen"),
    title: $("screenTitle"),
    quiz: $("screenQuiz"),
    over: $("screenOver"),
    clear: $("screenClear"),
    qNumber: $("qNumber"),
    qTotal: $("qTotal"),
    progressFill: $("progressFill"),
    finalBadge: $("finalBadge"),
    questionText: $("questionText"),
    choices: $("choices"),
    answerReveal: $("answerReveal"),
    rewardImg: $("rewardImg"),
  };

  /* ---------- 設定の読み込み・チェック ---------- */
  const pool = CFG.questions.filter((item, i) => {
    const ok = item && item.q && Array.isArray(item.choices) && item.choices.length === 4 &&
               MARKS.includes(String(item.answer).trim().toUpperCase());
    if (!ok) console.warn(`config.js の ${i + 1} 番目の問題に不備があるため除外しました`, item);
    return ok;
  });
  const total = Math.min(CFG.questionCount, pool.length);

  /* ---------- 文言・画像を反映 ---------- */
  function applyTexts() {
    const t = CFG.texts;
    const set = (id, text) => { if ($(id) && text != null) $(id).textContent = text; };
    document.title = t.pageTitle;
    // 大見出しが空なら画面からは隠す（読み上げ用にページ名だけ残す）
    $("titleHeading").textContent = t.title || t.pageTitle;
    $("titleHeading").classList.toggle("visually-hidden", !t.title);
    set("subtitle", t.subtitle);
    set("ruleText", t.rule);
    set("bgmNoticeText", t.bgmNotice);
    set("startBtn", t.startButton);
    set("finalBadge", t.finalBadge);
    set("overTitle", t.overTitle);
    set("overText", t.overText);
    set("retryBtn", t.retryButton);
    set("clearTitle", t.clearTitle);
    set("rewardCaption", t.rewardCaption);
    set("againBtn", t.againButton);
    set("footerText", t.footer);
    $("logoImg").src = encodeURI(CFG.images.logo);     // フォルダ名の空白などに対応
    $("mascotImg").src = encodeURI(CFG.images.mascot);
    $("gameoverImg").src = encodeURI(CFG.images.gameover); // 先に読み込んでおき、ゲームオーバー時にすぐ出す
    el.qTotal.textContent = total;
  }

  /* ---------- ユーティリティ ---------- */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function showScreen(target) {
    el.screens.forEach((s) => { s.hidden = s !== target; });
    window.scrollTo(0, 0);
  }

  /* ---------- ゲーム進行 ---------- */
  let deck = [];      // 今回出題する問題
  let index = 0;      // 今何問目か（0始まり）
  let locked = false; // 回答後の連打防止

  function startGame() {
    deck = shuffle(pool).slice(0, total);   // 重複なしでランダムに選ぶ
    index = 0;
    document.dispatchEvent(new CustomEvent("quiz:start")); // BGM開始（ボタンを押した瞬間に鳴らす）
    showScreen(el.quiz);
    renderQuestion();
  }

  function renderQuestion() {
    const item = deck[index];
    const correctIdx = MARKS.indexOf(String(item.answer).trim().toUpperCase());
    const isFinal = index === total - 1;

    el.qNumber.textContent = index + 1;
    el.progressFill.style.width = `${((index + 1) / total) * 100}%`;
    el.finalBadge.hidden = !isFinal;
    el.questionText.textContent = item.q;

    // 選択肢の並びをランダムに
    const options = shuffle(item.choices.map((text, i) => ({ text, correct: i === correctIdx })));
    el.choices.innerHTML = "";
    options.forEach((opt, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice";
      btn.innerHTML = '<span class="choice__mark"></span><span class="choice__text"></span>';
      btn.querySelector(".choice__mark").textContent = MARKS[i];
      btn.querySelector(".choice__text").textContent = opt.text;
      btn.dataset.correct = opt.correct ? "1" : "";
      btn.addEventListener("click", () => answer(btn));
      li.appendChild(btn);
      el.choices.appendChild(li);
    });

    locked = false;
    // 画面の切り替えアニメーションを毎問かけ直す
    el.quiz.style.animation = "none";
    void el.quiz.offsetWidth;
    el.quiz.style.animation = "";

    document.dispatchEvent(new CustomEvent("quiz:question", { detail: { index, total, isFinal } }));
  }

  function answer(btn) {
    if (locked) return;
    locked = true;

    const buttons = el.choices.querySelectorAll(".choice");
    const correctBtn = [...buttons].find((b) => b.dataset.correct);
    const isCorrect = btn === correctBtn;

    buttons.forEach((b) => { b.disabled = true; });

    // 次が最終問題なら、表示より少し前に最終BGMへの切り替えを始める
    if (isCorrect && index + 1 === total - 1) {
      const early = Math.max(0, Number(CFG.bgm.finalEarlySeconds) || 0) * 1000;
      setTimeout(() => document.dispatchEvent(new CustomEvent("quiz:final-soon")),
                 Math.max(0, CFG.answerDelay - early));
    }
    correctBtn.classList.add("is-correct");
    if (!isCorrect) btn.classList.add("is-wrong");

    setTimeout(() => {
      if (!isCorrect) {
        gameOver(correctBtn.querySelector(".choice__text").textContent);
      } else if (index + 1 >= total) {
        gameClear();
      } else {
        index++;
        renderQuestion();
      }
    }, CFG.answerDelay);
  }

  function gameOver(correctText) {
    $("answerText").textContent = correctText;
    showScreen(el.over);
    document.dispatchEvent(new CustomEvent("quiz:over"));
  }

  function gameClear() {
    // 全問正解したときに初めて画像を読み込む
    // ひとことをランダムで表示（1つだけ書いた場合はそれを表示）
    const msgs = [].concat(CFG.texts.clearText || []).filter(Boolean);
    $("clearText").textContent = msgs.length ? msgs[Math.floor(Math.random() * msgs.length)] : "";

    if (!el.rewardImg.getAttribute("src")) el.rewardImg.src = encodeURI(CFG.images.reward);
    showScreen(el.clear);
    document.dispatchEvent(new CustomEvent("quiz:clear"));
  }

  /* ---------- ボタン ---------- */
  $("startBtn").addEventListener("click", startGame);
  $("retryBtn").addEventListener("click", startGame);
  $("againBtn").addEventListener("click", startGame);

  applyTexts();
})();
