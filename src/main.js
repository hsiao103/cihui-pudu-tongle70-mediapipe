import "./style.css";
import { FilesetResolver, FaceLandmarker, HandLandmarker } from "@mediapipe/tasks-vision";

const $ = (selector) => document.querySelector(selector);
const video = $("#video");
const canvas = $("#overlay");
const ctx = canvas.getContext("2d");
const stage = $("#stage");
const welcome = $("#welcome");
const status = $("#status");
const startupMessage = $("#startupMessage");
const blessingPanel = $("#blessingPanel");
const blessingText = $("#blessingText");
const flash = $("#flash");
const startButton = $("#startButton");
const captureButton = $("#captureButton");
const switchButton = $("#switchButton");
const resetButton = $("#resetButton");

let faceLandmarker = null;
let handLandmarker = null;
let mediaStream = null;
let facingMode = "user";
let running = false;
let lastVideoTime = -1;
let prayerStartedAt = 0;
let blessingVisibleUntil = 0;
let currentBlessing = "平安順遂，福慧增長。";

const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const blessings = [
  "慈光護佑，闔家平安，萬事順遂。",
  "心存善念，福慧增長，日日皆安。",
  "媽祖護航，出入平安，前程光明。",
  "和氣致祥，貴人相助，好運常在。",
  "平安是福，健康是喜，幸福相隨。",
  "善念常存，福運相伴，所願漸成。"
];

function setBusy(isBusy, message = "") {
  startButton.disabled = isBusy;
  startButton.textContent = isBusy ? "正在啟動…" : "開始體驗";
  startupMessage.textContent = message;
}

async function createLandmarker(factory, vision, options) {
  try {
    return await factory.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "GPU" }
    });
  } catch (gpuError) {
    console.warn("GPU 初始化失敗，改用 CPU。", gpuError);
    return factory.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "CPU" }
    });
  }
}

async function loadModels() {
  if (faceLandmarker && handLandmarker) return;
  startupMessage.textContent = "正在下載 MediaPipe 辨識元件，首次載入可能需要數秒。";
  status.textContent = "載入 MediaPipe 模型中…";

  const wasmRoot = new URL(
    "../node_modules/@mediapipe/tasks-vision/wasm",
    import.meta.url
  ).href;

  // Vite build 後 node_modules 路徑不存在，因此使用套件 CDN 提供 WASM。
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
  );

  faceLandmarker = await createLandmarker(FaceLandmarker, vision, {
    baseOptions: { modelAssetPath: FACE_MODEL },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  handLandmarker = await createLandmarker(HandLandmarker, vision, {
    baseOptions: { modelAssetPath: HAND_MODEL },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
}

async function startCamera() {
  setBusy(true, "準備啟動相機與辨識模型…");
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("此瀏覽器不支援相機功能。");
    }
    await loadModels();

    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 960 }
      },
      audio: false
    });

    video.srcObject = mediaStream;
    await video.play();
    resizeCanvas();

    welcome.hidden = true;
    captureButton.disabled = false;
    switchButton.disabled = false;
    running = true;
    status.textContent = "請將臉部置於畫面中央";
    setBusy(false, "");
    requestAnimationFrame(renderLoop);
  } catch (error) {
    console.error(error);
    setBusy(false, `啟動失敗：${error.message || "請檢查網路與相機權限"}`);
    status.textContent = "無法啟動，請檢查相機權限";
  }
}

function resizeCanvas() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function point(landmark, width, height) {
  return { x: (1 - landmark.x) * width, y: landmark.y * height };
}

function handCenter(hand, width, height) {
  const points = [0, 5, 9, 13, 17].map((index) => point(hand[index], width, height));
  return {
    x: points.reduce((sum, item) => sum + item.x, 0) / points.length,
    y: points.reduce((sum, item) => sum + item.y, 0) / points.length
  };
}

function fingersPointUp(hand) {
  const wrist = hand[0];
  return [8, 12, 16, 20].filter((tip) => hand[tip].y < wrist.y).length >= 3;
}

function isPrayerGesture(hands, width, height) {
  if (!hands || hands.length < 2) return false;
  const a = handCenter(hands[0], width, height);
  const b = handCenter(hands[1], width, height);
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  const centerY = (a.y + b.y) / 2;
  return distance < width * 0.18 &&
    centerY > height * 0.30 &&
    centerY < height * 0.84 &&
    fingersPointUp(hands[0]) &&
    fingersPointUp(hands[1]);
}

function blendshapeScore(categories, name) {
  return categories?.find((item) => item.categoryName === name)?.score ?? 0;
}

function drawHalo(cx, cy, radius, time) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const gradient = ctx.createRadialGradient(cx, cy, radius * 0.15, cx, cy, radius);
  gradient.addColorStop(0, "rgba(255,245,180,.5)");
  gradient.addColorStop(0.55, "rgba(255,200,60,.2)");
  gradient.addColorStop(1, "rgba(255,200,60,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,226,124,.92)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 20; i += 1) {
    const angle = (Math.PI * 2 / 20) * i + time / 1600;
    ctx.fillStyle = "rgba(255,228,132,.65)";
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(angle) * radius * 0.91,
      cy + Math.sin(angle) * radius * 0.91,
      2.4,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.restore();
}

function drawCrown(cx, top, faceWidth) {
  const scale = faceWidth / 250;
  ctx.save();
  ctx.translate(cx, top);
  ctx.scale(scale, scale);
  ctx.shadowColor = "rgba(255,207,67,.72)";
  ctx.shadowBlur = 14;

  const gradient = ctx.createLinearGradient(0, -90, 0, 75);
  gradient.addColorStop(0, "#fff2ad");
  gradient.addColorStop(0.48, "#e3aa2f");
  gradient.addColorStop(1, "#8a3d0b");
  ctx.fillStyle = gradient;
  ctx.strokeStyle = "#ffeaa4";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-105, 40); ctx.lineTo(-88, -5); ctx.lineTo(-62, 10);
  ctx.lineTo(-42, -52); ctx.lineTo(-16, -20); ctx.lineTo(0, -88);
  ctx.lineTo(16, -20); ctx.lineTo(42, -52); ctx.lineTo(62, 10);
  ctx.lineTo(88, -5); ctx.lineTo(105, 40);
  ctx.quadraticCurveTo(0, 68, -105, 40);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  [[-70,6,"#d9342d"],[-34,-14,"#2ca96a"],[0,-42,"#d9342d"],[34,-14,"#2ca96a"],[70,6,"#d9342d"]]
    .forEach(([x,y,color]) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff0b4"; ctx.stroke();
    });

  for (let i = -4; i <= 4; i += 1) {
    const x = i * 20;
    ctx.strokeStyle = "#ffe68b";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, 42); ctx.lineTo(x, 102 + Math.abs(i) * 5); ctx.stroke();
    ctx.fillStyle = i % 2 ? "#d93a2e" : "#fff4c5";
    ctx.beginPath(); ctx.arc(x, 108 + Math.abs(i) * 5, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawParticles(width, height, time) {
  ctx.save();
  for (let i = 0; i < 30; i += 1) {
    const x = (i * 83 + time * 0.015 * (i % 4 + 1)) % width;
    const y = (i * 57 + time * 0.01 * (i % 3 + 1)) % height;
    ctx.fillStyle = `rgba(255,225,132,${0.16 + (i % 5) * 0.08})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function triggerBlessing(now) {
  currentBlessing = blessings[Math.floor(Math.random() * blessings.length)];
  blessingText.textContent = currentBlessing;
  blessingVisibleUntil = now + 7000;
}

function renderLoop(now) {
  if (!running) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);

  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      const timestamp = performance.now();
      const faceResult = faceLandmarker.detectForVideo(video, timestamp);
      const handResult = handLandmarker.detectForVideo(video, timestamp);
      const face = faceResult.faceLandmarks?.[0];
      const hands = handResult.landmarks ?? [];

      if (face) {
        const left = point(face[234], width, height);
        const right = point(face[454], width, height);
        const forehead = point(face[10], width, height);
        const faceWidth = Math.abs(right.x - left.x);
        const centerX = (left.x + right.x) / 2;

        drawHalo(centerX, forehead.y + faceWidth * 0.12, faceWidth * 0.82, now);
        drawCrown(centerX, forehead.y - faceWidth * 0.42, faceWidth);
        drawParticles(width, height, now);

        const blendshapes = faceResult.faceBlendshapes?.[0]?.categories ?? [];
        const smile = (
          blendshapeScore(blendshapes, "mouthSmileLeft") +
          blendshapeScore(blendshapes, "mouthSmileRight")
        ) / 2;
        const praying = isPrayerGesture(hands, width, height);

        if (praying) {
          if (!prayerStartedAt) prayerStartedAt = now;
          const progress = Math.min(1, (now - prayerStartedAt) / 900);
          status.textContent = progress < 1 ? "合掌祈福感應中…" : "🙏 媽祖已接收您的祈願";
          if (progress >= 1 && now > blessingVisibleUntil) triggerBlessing(now);
        } else {
          prayerStartedAt = 0;
          status.textContent = smile > 0.35
            ? "😊 微笑成功，請雙手合掌"
            : "請微笑並在胸前雙手合掌";
        }
      } else {
        prayerStartedAt = 0;
        status.textContent = "請將臉部置於畫面中央";
      }
    } catch (error) {
      console.error("辨識執行錯誤", error);
      status.textContent = "辨識暫時中斷，請重新體驗";
    }
  }

  blessingPanel.classList.toggle("show", now < blessingVisibleUntil);
  requestAnimationFrame(renderLoop);
}

function capturePhoto() {
  flash.classList.remove("go");
  void flash.offsetWidth;
  flash.classList.add("go");

  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const output = document.createElement("canvas");
  output.width = Math.round(rect.width * dpr);
  output.height = Math.round(rect.height * dpr);
  const outputContext = output.getContext("2d");

  outputContext.save();
  outputContext.translate(output.width, 0);
  outputContext.scale(-1, 1);
  outputContext.drawImage(video, 0, 0, output.width, output.height);
  outputContext.restore();
  outputContext.drawImage(canvas, 0, 0, output.width, output.height);

  const barHeight = 112 * dpr;
  outputContext.fillStyle = "rgba(82,10,13,.93)";
  outputContext.fillRect(0, output.height - barHeight, output.width, barHeight);
  outputContext.textAlign = "center";
  outputContext.fillStyle = "#ffe391";
  outputContext.font = `700 ${18 * dpr}px sans-serif`;
  outputContext.fillText("慈惠寺普渡 × 同樂70序曲", output.width / 2, output.height - 70 * dpr);
  outputContext.fillStyle = "#fff8e8";
  outputContext.font = `800 ${22 * dpr}px sans-serif`;
  outputContext.fillText(currentBlessing, output.width / 2, output.height - 34 * dpr);

  const link = document.createElement("a");
  link.href = output.toDataURL("image/png");
  link.download = `慈惠寺普渡_同樂70序曲_祝福照_${Date.now()}.png`;
  link.click();
}

function resetExperience() {
  prayerStartedAt = 0;
  blessingVisibleUntil = 0;
  blessingPanel.classList.remove("show");
  status.textContent = running ? "請將臉部置於畫面中央" : "尚未啟動鏡頭";
}

startButton.addEventListener("click", startCamera);
captureButton.addEventListener("click", capturePhoto);
switchButton.addEventListener("click", async () => {
  facingMode = facingMode === "user" ? "environment" : "user";
  await startCamera();
});
resetButton.addEventListener("click", resetExperience);
window.addEventListener("resize", resizeCanvas);
