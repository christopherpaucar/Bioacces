// static/js/app_user.js
document.addEventListener("DOMContentLoaded", () => {
  const video = document.getElementById("video");
  const capturedFaceImage = document.getElementById("capturedFaceImage");
  const btnVerifyBoth = document.getElementById("btnVerifyBoth");
  const voiceStatus = document.getElementById("voiceStatus");
  const stepIndicator = document.getElementById("stepIndicator");
  const stepText = document.getElementById("stepText");
  const countdownDisplay = document.getElementById("countdownDisplay");
  const countdownNumber = document.getElementById("countdownNumber");
  const countdownMessage = document.getElementById("countdownMessage");
  const statusBox = document.getElementById("statusBox");
  
  // ---------- Función de cuenta regresiva ----------
  async function showCountdown(seconds = 3) {
    if (countdownDisplay) {
      countdownDisplay.style.display = "flex";
    }
    
    for (let i = seconds; i > 0; i--) {
      if (countdownNumber) {
        countdownNumber.textContent = i;
        // Animación de pulso
        countdownNumber.style.transform = "scale(1.2)";
        countdownNumber.style.transition = "transform 0.1s";
        setTimeout(() => {
          if (countdownNumber) {
            countdownNumber.style.transform = "scale(1)";
          }
        }, 100);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    
    // Mostrar "¡YA!" antes de empezar
    if (countdownNumber) {
      countdownNumber.textContent = "¡YA!";
      countdownNumber.style.color = "#22c55e";
    }
    if (countdownMessage) {
      countdownMessage.textContent = "Capturando...";
    }
    await new Promise((r) => setTimeout(r, 500));
    
    // Ocultar contador
    if (countdownDisplay) {
      countdownDisplay.style.display = "none";
    }
    if (countdownNumber) {
      countdownNumber.style.color = "#fff";
    }
  }

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
    if (r.includes("muy corto") || r.includes("muy silencioso")) return "Acceso denegado · audio inválido";
    return "Acceso denegado";
  }

  // ---------------- Acción: Verificar ambos (rostro + voz) ----------------
  btnVerifyBoth.onclick = async () => {
    // Deshabilitar botón durante el proceso
    btnVerifyBoth.disabled = true;
    btnVerifyBoth.textContent = "⏳ Verificando...";
    btnVerifyBoth.style.opacity = "0.7";
    
    try {
      // ========== PASO 1: Capturar rostro ==========
      if (stepIndicator) {
        stepIndicator.style.display = "block";
        stepText.textContent = "📸 Paso 1: Capturando rostro...";
        stepIndicator.style.background = "#eef6ff";
        stepIndicator.style.borderColor = "#3b82f6";
      }
      voiceStatus.textContent = "Preparando captura de rostro...";
      voiceStatus.style.color = "#3b82f6";
      
      setStatus("⏳ Preparando captura de rostro… mantén la cara visible.");
      
      // Mostrar cuenta regresiva
      await showCountdown(3, "Preparate, la captura comenzará en...");
      
      setStatus("⏳ Capturando rostro… mantén la cara visible.");
      
      // Capturar y guardar temporalmente
      capturedFaceBlob = await captureFrameBlob();
      
      // Mostrar la imagen capturada en lugar del video
      if (capturedFaceImage && capturedFaceBlob) {
        const imageUrl = URL.createObjectURL(capturedFaceBlob);
        capturedFaceImage.src = imageUrl;
        capturedFaceImage.style.display = "block";
        video.style.display = "none";
      }
      
      // Actualizar indicador de paso
      if (stepText) {
        stepText.textContent = "✅ Paso 1 completado: Rostro capturado";
      }
      voiceStatus.textContent = "✅ Rostro capturado correctamente";
      voiceStatus.style.color = "#16a34a";
      
      // Pausa de 2 segundos antes del paso 2 para que el usuario se prepare
      if (stepText) {
        stepText.textContent = "⏳ Preparando Paso 2...";
        stepIndicator.style.background = "#fef3c7";
        stepIndicator.style.borderColor = "#f59e0b";
      }
      voiceStatus.textContent = "⏳ Preparando verificación de voz en 2 segundos...";
      voiceStatus.style.color = "#f59e0b";
      
      await new Promise((r) => setTimeout(r, 2000));
      
      // ========== PASO 2: Capturar y verificar voz ==========
      if (stepText) {
        stepText.textContent = "🎤 Paso 2: Verificando voz...";
        stepIndicator.style.background = "#f0fdf4";
        stepIndicator.style.borderColor = "#16a34a";
      }
      voiceStatus.textContent = "🎤 Preparando grabación de voz...";
      voiceStatus.style.color = "#3b82f6";
      
      setStatus("⏳ Preparando verificación de voz…");
      
      // Iniciar grabación de voz automáticamente
      await startRecording();
      
      // Esperar 5 segundos de grabación
      await new Promise((r) => setTimeout(r, 5000));
      
      // Detener grabación automáticamente
      stopRecording();
      
    } catch (e) {
      setStatus(
        renderDeniedCard({
          title: "Error durante la verificación",
          detail: "Hubo un problema durante el proceso. Por favor, intenta nuevamente.",
        }),
        "error"
      );
      
      // Resetear
      resetFaceCapture();
      btnVerifyBoth.disabled = false;
      btnVerifyBoth.textContent = "🔒 Verificar identidad";
      btnVerifyBoth.style.opacity = "1";
      if (stepIndicator) {
        stepIndicator.style.display = "none";
      }
      voiceStatus.textContent = "";
    }
  };
  
  // Función para resetear la captura
  function resetFaceCapture() {
    if (capturedFaceImage) {
      capturedFaceImage.style.display = "none";
      if (capturedFaceImage.src) {
        URL.revokeObjectURL(capturedFaceImage.src);
        capturedFaceImage.src = "";
      }
    }
    if (video) {
      video.style.display = "block";
    }
    capturedFaceBlob = null;
  }

  // ---------------- Reconocimiento de voz ---------------- 
  let mediaRecorder = null;
  let audioChunks = [];
  let capturedFaceBlob = null; // Almacenar foto del rostro temporalmente

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        await sendVoiceForVerification(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      voiceStatus.textContent = "🎤 Grabando... Di tu nombre completo ahora";
      voiceStatus.style.color = "#ef4444";
    } catch (e) {
      setStatus(
        renderDeniedCard({
          title: "No se pudo acceder al micrófono",
          detail: "Revisa los permisos del navegador y vuelve a intentarlo.",
        }),
        "error"
      );
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      voiceStatus.textContent = "⏳ Procesando audio...";
      voiceStatus.style.color = "#3b82f6";
    }
  }

  async function sendVoiceForVerification(audioBlob) {
    // Verificar si hay rostro capturado
    if (!capturedFaceBlob) {
      setStatus(
        renderDeniedCard({
          title: "Rostro no capturado",
          detail: "Primero debes capturar tu rostro haciendo clic en 'Verificar rostro'.",
        }),
        "error"
      );
      resetFaceCapture();
      btnVerifyBoth.disabled = false;
      btnVerifyBoth.textContent = "🔒 Verificar identidad";
      btnVerifyBoth.style.opacity = "1";
      if (stepIndicator) {
        stepIndicator.style.display = "none";
      }
      voiceStatus.textContent = "";
      return;
    }

    setStatus("⏳ Verificando rostro y voz conjuntamente… procesando.");
    if (stepText) {
      stepText.textContent = "⏳ Procesando verificación...";
    }
    voiceStatus.textContent = "⏳ Procesando verificación...";
    voiceStatus.style.color = "#3b82f6";
    
    // Convertir WebM a WAV usando Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Convertir a WAV
    const wavBlob = audioBufferToWav(audioBuffer);
    
    const fd = new FormData();
    fd.append("frame", capturedFaceBlob, "face.jpg");
    fd.append("audio", wavBlob, "voice.wav");

    const t0 = performance.now();
    try {
      const res = await fetch("/api/verify-both/", {
        method: "POST",
        body: fd,
      });

      if (res.status === 404) {
        setStatus(
          renderDeniedCard({
            title: "Endpoint no encontrado",
            detail: "La ruta /api/verify-both/ no existe. Revisa urls.py.",
          }),
          "error"
        );
        return;
      }

      const data = await res.json().catch(() => ({}));
      const latency = Math.round(performance.now() - t0);

      if (data.success && (data.accepted === true || data.accepted === "true")) {
        const userName = pickUserName(data) || "usuario";
        const faceProb = data.face_confidence || 0;
        const voiceProb = data.voice_confidence || 0;
        const avgProb = data.confidence || ((faceProb + voiceProb) / 2);
        
        // Mostrar resultado con ambos porcentajes
        const resultHtml = `
          <div style="background:#eef2f7;border-radius:12px;padding:14px 16px;border:1px solid #d7dfeb;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#16a34a,#22c55e);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;">✓</div>
              <div style="font-weight:700;color:#0f172a;">Acceso concedido</div>
            </div>
            <div style="display:grid;grid-template-columns:140px 1fr;row-gap:6px;column-gap:10px;color:#334155;font-size:.95rem;">
              <div style="opacity:.75;">Usuario</div><div><b>${userName || "—"}</b></div>
              <div style="opacity:.75;">Confianza promedio</div><div>${(avgProb * 100).toFixed(1)}%</div>
              <div style="opacity:.75;">Rostro</div><div>${(faceProb * 100).toFixed(1)}%</div>
              <div style="opacity:.75;">Voz</div><div>${(voiceProb * 100).toFixed(1)}%</div>
              <div style="opacity:.75;">Latencia</div><div>${latency} ms</div>
              <div style="opacity:.75;">Fecha/Hora</div><div>${new Date().toLocaleString()}</div>
            </div>
            <div style="margin-top:10px;font-size:.92rem;color:#1e293b;">
              Bienvenido, <b>${userName || "usuario"}</b>. Tu identidad ha sido verificada por rostro y voz. Puedes continuar.
            </div>
          </div>
        `;
        
        setStatus(resultHtml, "ok");
        voiceStatus.textContent = "✅ Verificación completa (rostro + voz)";
        voiceStatus.style.color = "#16a34a";
        if (stepText) {
          stepText.textContent = "✅ Verificación completada exitosamente";
          stepIndicator.style.background = "#ecfdf5";
          stepIndicator.style.borderColor = "#16a34a";
        }
        
        // Restaurar botón
        btnVerifyBoth.disabled = false;
        btnVerifyBoth.textContent = "🔒 Verificar identidad";
        btnVerifyBoth.style.opacity = "1";
        
        // Resetear después de 5 segundos para permitir nueva captura
        setTimeout(() => {
          resetFaceCapture();
          if (stepIndicator) {
            stepIndicator.style.display = "none";
          }
          voiceStatus.textContent = "";
        }, 5000);
      } else {
        const faceData = data.face || {};
        const voiceData = data.voice || {};
        const faceProb = data.face_confidence || faceData.confidence || 0;
        const voiceProb = data.voice_confidence || voiceData.confidence || 0;
        const avgProb = data.confidence || ((faceProb + voiceProb) / 2);
        const reason = data.reason || "Acceso denegado";
        
        // Obtener el nombre del usuario más probable (si está disponible)
        const probableUser = data.label || data.face_top1_label || data.voice_top1_label || 
                            faceData.top1_label || voiceData.top1_label || null;
        
        const resultHtml = `
          <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:14px 16px;color:#7f1d1d;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#ef4444,#f87171);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;">!</div>
              <div style="font-weight:700;">Acceso denegado</div>
            </div>
            <div style="font-size:.95rem;opacity:.95;margin-bottom:8px;">${reason}</div>
            <div style="display:grid;grid-template-columns:140px 1fr;row-gap:6px;column-gap:10px;color:#7f1d1d;font-size:.9rem;margin-top:8px;">
              ${probableUser ? `<div style="opacity:.75;">Usuario probable</div><div><b>${probableUser}</b></div>` : ''}
              <div style="opacity:.75;">Confianza promedio</div><div>${avgProb > 0 ? (avgProb * 100).toFixed(1) + "%" : "—"}</div>
              <div style="opacity:.75;">Rostro</div><div>${faceProb > 0 ? (faceProb * 100).toFixed(1) + "%" : "—"}</div>
              <div style="opacity:.75;">Voz</div><div>${voiceProb > 0 ? (voiceProb * 100).toFixed(1) + "%" : "—"}</div>
            </div>
            <ul style="margin-left:1rem;line-height:1.4;font-size:.92rem;opacity:.9;margin-top:8px;">
              <li>Procura buena iluminación frontal.</li>
              <li>Mira a la cámara de frente y habla claramente.</li>
              <li>Si eres nuevo, pide al administrador que te registre.</li>
            </ul>
          </div>
        `;
        
        setStatus(resultHtml, "error");
        voiceStatus.textContent = "❌ Verificación fallida";
        voiceStatus.style.color = "#ef4444";
        if (stepText) {
          stepText.textContent = "❌ Verificación fallida";
          stepIndicator.style.background = "#fff1f2";
          stepIndicator.style.borderColor = "#ef4444";
        }
        
        // Restaurar botón
        btnVerifyBoth.disabled = false;
        btnVerifyBoth.textContent = "🔒 Verificar identidad";
        btnVerifyBoth.style.opacity = "1";
        
        // Resetear después de 5 segundos para permitir nuevo intento
        setTimeout(() => {
          resetFaceCapture();
          if (stepIndicator) {
            stepIndicator.style.display = "none";
          }
          voiceStatus.textContent = "";
        }, 5000);
      }
      
    } catch (e) {
      setStatus(
        renderDeniedCard({
          title: "Error de red en verificación",
          detail: "No fue posible contactar al servidor.",
        }),
        "error"
      );
      voiceStatus.textContent = "❌ Error de conexión";
      voiceStatus.style.color = "#ef4444";
    }
  }

  // Función auxiliar para convertir AudioBuffer a WAV
  function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const length = buffer.length * numChannels * bytesPerSample;
    const arrayBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, length, true);

    // Convertir audio a PCM
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

});
