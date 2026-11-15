/* =========================================================
   記念日クイズ  BGM
   曲・音量・クロスフェードの長さは config.js の bgm で変更できます。
   ---------------------------------------------------------
   ・START を押した瞬間に通常BGMを再生
   ・最終問題に入った瞬間、最終問題用BGMへクロスフェード
   ・RETRY / もう一度あそぶ で通常BGMに戻す
     （通常BGMが流れている間のゲームオーバーなら、止めずにそのまま流す）
   ・ミュートボタンで消音／解除（効果音も一緒に消音）
   ・効果音：START／正解／不正解／最後の問題を正解（config.js の se）
   iPhone は audio の volume を変更できないため、
   音量は Web Audio API（GainNode）で制御します。
   ========================================================= */
(function () {
  "use strict";

  const CFG = window.QUIZ_CONFIG.bgm;
  const volume = Math.min(1, Math.max(0, Number(CFG.volume) || 0));
  const fadeMs = Math.max(0, Number(CFG.crossfadeSeconds) || 0) * 1000;
  const RESET_FADE_MS = 400; // リトライ時の短いフェード

  // ローカルのファイルを直接開いた場合（file://）は Web Audio が無音になるブラウザがあるため使わない
  const AC = window.AudioContext || window.webkitAudioContext;
  const useWebAudio = !!AC && location.protocol !== "file:";
  let ctx = null;

  function makeTrack(src) {
    const audio = new Audio();
    audio.src = encodeURI(src); // ファイル名の空白などに対応
    audio.loop = CFG.loop !== false;
    audio.preload = "none"; // ページを開いただけでは読み込まない（通信量の節約）
    return { audio, gain: null, mix: 0 };
  }

  const tracks = { normal: makeTrack(CFG.normal), final: makeTrack(CFG.final) };

  /* ---------- 効果音（小さいファイルなので、すぐ鳴らせるようページを開いた時点で読み込む） ---------- */
  const SE_CFG = window.QUIZ_CONFIG.se || {};
  const seVolume = Math.min(1, Math.max(0, Number(SE_CFG.volume) || 0));
  const se = {};
  ["start", "correct", "wrong", "clear"].forEach((key) => {
    if (!SE_CFG[key]) return;
    const audio = new Audio();
    audio.src = encodeURI(SE_CFG[key]);
    audio.preload = "auto";
    se[key] = { audio, gain: null };
  });
  let current = null;   // 今メインで鳴っている曲（"normal" / "final"）
  let muted = false;
  let fadeTimer = null;

  /* ---------- 音量の反映 ---------- */
  function apply(track) {
    const v = muted ? 0 : track.mix * volume;
    if (track.gain) track.gain.gain.value = v;
    else track.audio.volume = v;
  }
  function applySe(s) {
    const v = muted ? 0 : seVolume;
    if (s.gain) s.gain.gain.value = v;
    else s.audio.volume = v;
  }
  function applyAll() {
    apply(tracks.normal); apply(tracks.final);
    Object.values(se).forEach(applySe);
  }

  function playSe(key) {
    const s = se[key];
    if (!s) return;
    applySe(s);
    s.audio.currentTime = 0;
    const p = s.audio.play();
    if (p && p.catch) p.catch((e) => console.warn("効果音を再生できませんでした", key, e));
  }

  /* ---------- 初回の START で Web Audio を準備（ユーザー操作の中で行う必要がある） ---------- */
  function ensureContext() {
    if (!useWebAudio) return;
    if (!ctx) {
      try {
        ctx = new AC();
        [...Object.values(tracks), ...Object.values(se)].forEach((t) => {
          const node = ctx.createMediaElementSource(t.audio);
          t.gain = ctx.createGain();
          node.connect(t.gain).connect(ctx.destination);
          t.audio.volume = 1;
        });
      } catch (e) {
        console.warn("Web Audio が使えないため通常の再生にします", e);
        ctx = null;
        [...Object.values(tracks), ...Object.values(se)].forEach((t) => { t.gain = null; });
      }
      applyAll();
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  function play(track) {
    const p = track.audio.play();
    if (p && p.catch) p.catch((e) => console.warn("BGMを再生できませんでした", e));
  }

  /* ---------- フェード（時間で計算するので、裏に回っても最後まで進む） ---------- */
  function fadeTo(name, ms, restart) {
    const next = tracks[name];
    const others = Object.values(tracks).filter((t) => t !== next);
    clearInterval(fadeTimer);

    if (restart) next.audio.currentTime = 0;
    if (next.audio.paused) { if (!restart) next.mix = 0; play(next); }
    current = name;

    const from = new Map([[next, next.mix], ...others.map((t) => [t, t.mix])]);
    const start = performance.now();
    const step = () => {
      const k = ms > 0 ? Math.min(1, (performance.now() - start) / ms) : 1;
      next.mix = from.get(next) + (1 - from.get(next)) * k;
      others.forEach((t) => { t.mix = from.get(t) * (1 - k); });
      applyAll();
      if (k >= 1) {
        clearInterval(fadeTimer);
        others.forEach((t) => { t.audio.pause(); });
      }
    };
    step();
    if (ms > 0) fadeTimer = setInterval(step, 30);
  }

  /* ---------- クイズの進行に合わせて切り替え ---------- */
  document.addEventListener("quiz:start", () => {
    ensureContext();
    playSe("start");
    if (current === "normal" && !tracks.normal.audio.paused) {
      // 通常BGMが鳴っている（1〜4問目でゲームオーバー）→ 止めずにそのまま流す
    } else if (current === "final") {
      // 最終BGMが鳴っている（最終問題でゲームオーバー／全問正解後）→ 通常BGMを頭から、短くクロスフェード
      tracks.normal.mix = 0;
      fadeTo("normal", RESET_FADE_MS, true);
    } else {
      // 初回の START → 通常BGMを頭から
      tracks.normal.mix = 0;
      fadeTo("normal", 0, true);
    }
    // 最終問題で遅れないよう、最終BGMをこの時点で読み込み開始
    if (tracks.final.audio.preload !== "auto") {
      tracks.final.audio.preload = "auto";
      tracks.final.audio.load();
    }
  });

  function toFinal() {
    if (current === "final") return;
    tracks.final.mix = 0;
    fadeTo("final", fadeMs, true);
  }
  // 最終問題の少し前（config.js の finalEarlySeconds）に切り替え開始
  document.addEventListener("quiz:final-soon", toFinal);
  // 念のため、最終問題が出た時点でまだなら切り替え（出題数1問のときなど）
  document.addEventListener("quiz:question", (e) => { if (e.detail.isFinal) toFinal(); });

  // 回答したとき：正解／不正解／最後の問題を正解 の効果音
  document.addEventListener("quiz:answer", (e) => {
    const { correct, isFinal } = e.detail;
    playSe(!correct ? "wrong" : isFinal ? "clear" : "correct");
  });

  /* ---------- ミュートボタン（BGMと効果音の両方を消音） ---------- */
  const muteBtn = document.getElementById("muteBtn");
  const muteLabel = muteBtn.querySelector(".mute-btn__label");
  const muteIcon = muteBtn.querySelector(".mute-btn__icon");
  muteBtn.addEventListener("click", () => {
    muted = !muted;
    muteBtn.setAttribute("aria-pressed", String(muted));
    muteBtn.setAttribute("aria-label", muted ? "BGMのミュートを解除" : "BGMをミュート");
    muteLabel.textContent = muted ? "BGM OFF" : "BGM ON";
    muteIcon.textContent = muted ? "×" : "♪";
    if (ctx && ctx.state === "suspended") ctx.resume();
    applyAll();
  });

  // テスト用（ブラウザのコンソールから状態を確認できる）
  window.__bgm = { tracks, se, get current() { return current; }, get muted() { return muted; }, get webAudio() { return !!ctx; } };
})();
