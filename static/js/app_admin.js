// ===========================
// Panel Administrador (front)
// ===========================
document.addEventListener("DOMContentLoaded", () => {
  const video = document.getElementById("video");
  const usernameField = document.getElementById("username");
  const btnCreateUser = document.getElementById("btnCreateUser");
  const btnCaptureFaces = document.getElementById("btnCaptureFaces");
  const btnRetrain = document.getElementById("btnRetrain");
  const statusBox = document.getElementById("statusBox");

  // ---------- Cámara ----------
  async function initCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
    } catch (err) {
      setStatus(renderErrorCard("No se pudo acceder a la cámara."), "error");
    }
  }
  initCamera();

  // ---------- Utilidades ----------
  function getCSRFToken() {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : "";
  }

  function captureFrameBlobSync() {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9)
    );
  }

  // ---------- Mensajes Pro ----------
  function setStatus(content, type = "info") {
    const isHtml = /<\/?[a-z][\s\S]*>/i.test(content);
    const color =
      type === "ok" ? "#16a34a" : type === "error" ? "#ef4444" : "#3b82f6";
    statusBox.style.borderLeftColor = color;
    statusBox.innerHTML = isHtml ? content : String(content);
  }

  function renderInfoCard(title, body) {
    return `
      <div style="background:#eef6ff;border:1px solid #c7ddff;border-radius:12px;padding:14px 16px;color:#0f2a46;">
        <div style="font-weight:700;margin-bottom:6px;">${title}</div>
        <div style="opacity:.9">${body}</div>
      </div>
    `;
  }

  function renderOkCard(title, body) {
    return `
      <div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:12px;padding:14px 16px;color:#064e3b;">
        <div style="font-weight:700;margin-bottom:6px;">${title}</div>
        <div style="opacity:.9">${body}</div>
      </div>
    `;
  }

  function renderErrorCard(body) {
    return `
      <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:14px 16px;color:#7f1d1d;">
        ${body}
      </div>
    `;
  }

  // ---------- 1) Crear usuario ----------
  btnCreateUser.onclick = async () => {
    const username = (usernameField.value || "").trim();
    if (!username) {
      setStatus(renderErrorCard("Escribe un nombre de usuario."), "error");
      return;
    }

    setStatus(renderInfoCard("Creando usuario…", `ID: <b>${username}</b>`));
    const fd = new FormData();
    fd.append("username", username);

    try {
      const res = await fetch("/api/register-user/", {
        method: "POST",
        headers: { "X-CSRFToken": getCSRFToken() },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setStatus(
          renderOkCard(
            "Usuario creado",
            `Ahora puedes capturar su dataset con la cámara.`
          ),
          "ok"
        );
      } else {
        setStatus(renderErrorCard(data.error || "No se pudo crear."), "error");
      }
    } catch (e) {
      setStatus(renderErrorCard("Error de red al crear usuario."), "error");
    }
  };

  // ---------- 2) Capturar 40 fotos ----------
  btnCaptureFaces.onclick = async () => {
    const username = (usernameField.value || "").trim();
    if (!username) {
      setStatus(renderErrorCard("Escribe un nombre de usuario."), "error");
      return;
    }

    setStatus(
      renderInfoCard(
        "Capturando imágenes…",
        "Mantén el rostro visible. Esto tomará unos segundos."
      )
    );

    try {
      for (let i = 1; i <= 40; i++) {
        const blob = await captureFrameBlobSync();
        const fd = new FormData();
        fd.append("username", username);
        fd.append("image", blob, `face_${i}.jpg`);

        const res = await fetch("/api/capture-face/", {
          method: "POST",
          headers: { "X-CSRFToken": getCSRFToken() },
          body: fd,
        });
        await res.json().catch(() => ({}));

        setStatus(
          renderInfoCard(
            "Capturando imágenes…",
            `Foto <b>${i}</b> / 40 capturada correctamente.`
          )
        );
        // Pequeña pausa para no saturar
        await new Promise((r) => setTimeout(r, 250));
      }

      setStatus(
        renderOkCard(
          "Dataset capturado",
          "Se generaron 40 imágenes. Ahora puedes reentrenar el sistema."
        ),
        "ok"
      );
    } catch (e) {
      setStatus(renderErrorCard("Error durante la captura de imágenes."), "error");
    }
  };

  // ---------- 3) Reentrenar ----------
  btnRetrain.onclick = async () => {
    setStatus(
      renderInfoCard(
        "Entrenando modelos…",
        "Actualizando PCA + SVM con nuevas imágenes. Esto puede tardar 20–60 s."
      )
    );
    const t0 = performance.now();
    try {
      const res = await fetch("/api/retrain/", {
        method: "POST",
        headers: { "X-CSRFToken": getCSRFToken() },
      });
      const data = await res.json().catch(() => ({}));
      const ms = Math.round(performance.now() - t0);

      if (data.success) {
        setStatus(
          renderOkCard(
            "Entrenamiento completado",
            `Modelos actualizados en <b>${ms} ms</b>. Ya puedes validar en modo Usuario.`
          ),
          "ok"
        );
      } else {
        setStatus(
          renderErrorCard(data.msg || "No se pudo entrenar el modelo."),
          "error"
        );
      }
    } catch (e) {
      setStatus(renderErrorCard("Error de red durante el reentrenamiento."), "error");
    }
  };
});
