/* =========================================================
   記念日クイズ  エフェクト
   ・正解したとき：押したボタンからキラキラが飛び散る
   ・不正解のとき：画面がうっすら暗くなる（ゲームオーバー画面で元に戻る）
   色や速さは css/style.css の「エフェクト」の部分で変更できます。
   ========================================================= */
(function () {
  "use strict";

  const SPARKLE_COUNT = 20;   // キラキラの数
  const SPARKLE_LIFE = 900;   // キラキラが消えるまでの時間（ミリ秒）
  const SHAPES = ["✦", "✧", "★", "♥", "●"];

  // 「動きを減らす」設定の端末ではキラキラを出さない
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 正解：キラキラ ---------- */
  function sparkle(target) {
    if (reduceMotion || !target) return;
    const r = target.getBoundingClientRect();
    const layer = document.createElement("div");
    layer.className = "fx-sparkles";
    layer.setAttribute("aria-hidden", "true");
    // ボタンの中心から飛ばす
    layer.style.left = `${r.left + r.width / 2}px`;
    layer.style.top = `${r.top + r.height / 2}px`;

    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const s = document.createElement("span");
      s.className = `fx-sparkle fx-sparkle--c${i % 3}`;
      s.textContent = SHAPES[Math.floor(Math.random() * SHAPES.length)];
      const angle = (Math.PI * 2 * i) / SPARKLE_COUNT + Math.random() * 0.4;
      const dist = 60 + Math.random() * 90;
      // 横長のボタンなので、横方向は少し遠くまで飛ばす
      s.style.setProperty("--dx", `${Math.cos(angle) * dist * 1.6}px`);
      s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
      s.style.setProperty("--rot", `${Math.round(Math.random() * 360 - 180)}deg`);
      s.style.setProperty("--size", `${14 + Math.random() * 16}px`);
      s.style.animationDelay = `${Math.random() * 120}ms`;
      layer.appendChild(s);
    }
    document.body.appendChild(layer);
    target.classList.add("is-glow");
    setTimeout(() => layer.remove(), SPARKLE_LIFE + 200);
  }

  /* ---------- 不正解：うっすら暗く ---------- */
  const dim = document.createElement("div");
  dim.className = "fx-dim";
  dim.setAttribute("aria-hidden", "true");
  document.body.appendChild(dim);

  function setDim(on) { dim.classList.toggle("is-on", on); }

  document.addEventListener("quiz:answer", (e) => {
    const { correct, button } = e.detail;
    if (correct) sparkle(button);
    else setDim(true);
  });
  // ゲームオーバー画面に切り替わったら明るさを戻す／リトライ時も念のため戻す
  document.addEventListener("quiz:over", () => setDim(false));
  document.addEventListener("quiz:start", () => setDim(false));
})();
