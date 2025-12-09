// static/js/app_user.js
document.addEventListener("DOMContentLoaded", () => {
  const video = document.getElementById("video");
  const btnVerifyFace = document.getElementById("btnVerifyFace");
  const statusBox = document.getElementById("statusBox");

  // ---------------- Cámara ----------------
  async function initCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
    } catch (e) {
      setStatus(
        renderDeniedCard({
          title: "No se pudo acceder a la cámara",
          detail: "Revisa los permisos del navegador y vuelve a intentarlo.",
        }),
        "error"
      );
    }
  }
  initCamera();

  // Captura un frame y lo devuelve como Blob JPEG
  async function captureFrameBlob() {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const byteString = atob(dataUrl.split(",")[1]);
    const mime = dataUrl.split(",")[0].split(":")[1].split(";")[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    return new Blob([ab], { type: mime });
  }

  // (opcional) CSRF si lo necesitas
  function getCSRFToken() {
    const name = "csrftoken";
    const cookieStr = document.cookie || "";
    const parts = cookieStr.split(";").map((c) => c.trim());
    for (const p of parts) {
      if (p.startsWith(name + "=")) return decodeURIComponent(p.split("=")[1]);
    }
    const el = document.querySelector('input[name="csrfmiddlewaretoken"]');
    return el ? el.value : "";
  }

  // ---------------- UI helpers ----------------
  function setStatus(content, type = "info") {
    const isHtml = /<\/?[a-z][\s\S]*>/i.test(content);
    const color = type === "ok" ? "#16a34a" : type === "error" ? "#ef4444" : "#3b82f6";
    statusBox.style.borderLeft = `4px solid ${color}`;
    statusBox.innerHTML = isHtml ? content : String(content);
  }

  function normalizeProb(data) {
    let p =
      data.prob ??
      data.confidence ??
      data.probability ??
      data.proba ??
      data.similarity;

    if (p != null) {
      p = Number(p);
      if (!Number.isNaN(p)) {
        if (p > 1.0001) p = p / 100; // 96 -> 0.96
        return Math.max(0, Math.min(1, p));
      }
    }

    const score = data.score ?? data.distance ?? data.dissimilarity;
    if (score != null && !Number.isNaN(Number(score))) {
      const s = Math.max(0, Number(score));
      const k = 0.7;
      const pFromScore = Math.exp(-k * s);
      return Math.max(0, Math.min(1, pFromScore));
    }

    return null;
  }

  function formatConfidence(p) {
    if (p == null) return "—";
    const pct = (p * 100).toFixed(1);
    let label = "Alta";
    if (p < 0.75) label = "Media";
    if (p < 0.55) label = "Baja";
    return `${pct}% <span style="opacity:.8">(${label})</span>`;
  }

  function pickUserName(data) {
    return (
      data.user ??
      data.username ??
      data.identity ??
      data.label ??
      data.pred ??
      data.name ??
      null
    );
  }

  function renderAccessCard({ user, prob, model = "PCA + SVM", latencyMs }) {
    const ts = new Date().toLocaleString();
    const conf = formatConfidence(prob);
    const lat = latencyMs != null ? `${latencyMs} ms` : "—";

    return `
      <div style="background:#eef2f7;border-radius:12px;padding:14px 16px;border:1px solid #d7dfeb;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#16a34a,#22c55e);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;">✓</div>
          <div style="font-weight:700;color:#0f172a;">Acceso concedido</div>
        </div>
        <div style="display:grid;grid-template-columns:140px 1fr;row-gap:6px;column-gap:10px;color:#334155;font-size:.95rem;">
          <div style="opacity:.75;">Usuario</div><div><b>${user || "—"}</b></div>
          <div style="opacity:.75;">Confianza</div><div>${conf}</div>
          <div style="opacity:.75;">Modelo</div><div>${model}</div>
          <div style="opacity:.75;">Latencia</div><div>${lat}</div>
          <div style="opacity:.75;">Fecha/Hora</div><div>${ts}</div>
        </div>
        <div style="margin-top:10px;font-size:.92rem;color:#1e293b;">
          Bienvenido, <b>${user || "usuario"}</b>. Tu identidad ha sido verificada. Puedes continuar.
        </div>
      </div>
    `;
  }

  function renderDeniedCard({ title, detail, tips }) {
    const tipsHtml = (tips || [
      "Procura buena iluminación frontal.",
      "Mira a la cámara de frente y evita movimiento.",
      "Si eres nuevo, pide al administrador que te registre.",
    ]).map((t) => `<li>${t}</li>`).join("");

    return `
      <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:14px 16px;color:#7f1d1d;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#ef4444,#f87171);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;">!</div>
          <div style="font-weight:700;">${title}</div>
        </div>
        <div style="font-size:.95rem;opacity:.95;margin-bottom:8px;">${detail || ""}</div>
        <ul style="margin-left:1rem;line-height:1.4;font-size:.92rem;opacity:.9">${tipsHtml}</ul>
      </div>
    `;
  }

  function friendlyDeniedTitle(reasonRaw) {
    const r = (reasonRaw || "").toLowerCase();
    if (r.includes("distancia pca")) return "Acceso denegado · posible usuario no registrado";
    if (r.includes("probabilidad baja")) return "Acceso denegado · coincidencia débil";
    if (r.includes("margen top-2") || r.includes("margen")) return "Acceso denegado · ambigüedad en la coincidencia";
    return "Acceso denegado";
  }

  // ---------------- Acción: Verificar rostro ----------------
  btnVerifyFace.onclick = async () => {
    setStatus("⏳ Verificando rostro… mantén la cara visible.");
    const blob = await captureFrameBlob();
    const fd = new FormData();
    fd.append("frame", blob, "probe.jpg"); // nombre de campo que espera el backend

    const t0 = performance.now();
    try {
      // RUTA CORRECTA
      const res = await fetch("/api/verify/", {
        method: "POST",
        // headers: { "X-CSRFToken": getCSRFToken() }, // opcional (la vista está csrf_exempt)
        body: fd,
      });

      if (res.status === 404) {
        setStatus(
          renderDeniedCard({
            title: "Endpoint no encontrado",
            detail: "La ruta /api/verify/ no existe. Revisa urls.py.",
          }),
          "error"
        );
        return;
      }

      const data = await res.json().catch(() => ({}));
      const latency = Math.round(performance.now() - t0);

      if (data.success && (data.accepted === true || data.accepted === "true")) {
        const userName = pickUserName(data) || "usuario";
        const prob = normalizeProb(data);
        const model = data.model || "PCA + SVM";
        setStatus(
          renderAccessCard({ user: userName, prob, model, latencyMs: latency }),
          "ok"
        );
      } else {
  const near =
    (typeof data.top1_prob === "number" && data.top1_prob >= 0.55)
      ? ` Posible coincidencia: <b>${data.top1_label}</b> (${(data.top1_prob*100).toFixed(1)}%).`
      : "";
  const reason = data.reason || "Tu rostro no coincide con ningún usuario registrado.";
  const title = friendlyDeniedTitle(reason);
  setStatus(
    renderDeniedCard({
      title,
      detail: reason + near,
    }),
    "error"
  );
}
    } catch (e) {
      setStatus(
        renderDeniedCard({
          title: "Error de red en verificación",
          detail: "No fue posible contactar al servidor.",
        }),
        "error"
      );
    }
  };
});
