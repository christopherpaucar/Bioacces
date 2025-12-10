// ===========================
// Panel Administrador (front)
// ===========================
document.addEventListener("DOMContentLoaded", () => {
  const video = document.getElementById("video");
  const usernameField = document.getElementById("username");
  const btnCreateUser = document.getElementById("btnCreateUser");
  const btnCaptureFaces = document.getElementById("btnCaptureFaces");
  const btnCaptureVoices = document.getElementById("btnCaptureVoices");
  const btnRetrainAll = document.getElementById("btnRetrainAll");
  const voiceCaptureStatus = document.getElementById("voiceCaptureStatus");
  const voicePhraseDisplay = document.getElementById("voicePhraseDisplay");
  const voicePhraseName = document.getElementById("voicePhraseName");
  const currentPhraseName = document.getElementById("currentPhraseName");
  const countdownDisplay = document.getElementById("countdownDisplay");
  const countdownNumber = document.getElementById("countdownNumber");
  const countdownMessage = document.getElementById("countdownMessage");
  const photoCounter = document.getElementById("photoCounter");
  const currentPhotoCount = document.getElementById("currentPhotoCount");
  const totalPhotoCount = document.getElementById("totalPhotoCount");
  const photoProgressBar = document.getElementById("photoProgressBar");
  const statusBox = document.getElementById("statusBox");
  const userStatusLabel = document.getElementById("userStatusLabel");
  
  // Actualizar el nombre en la frase cuando se escribe el username
  usernameField.addEventListener("input", () => {
    const username = (usernameField.value || "").trim();
    if (voicePhraseName) {
      voicePhraseName.textContent = username || "[nombre del usuario]";
    }
    if (currentPhraseName) {
      currentPhraseName.textContent = username || "[nombre del usuario]";
    }
  });

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
      <div style="background:#eef6ff;border:1px solid #c7ddff;border-radius:12px;padding:14px 16px;color:#0f2a46;animation:fadeIn 0.3s ease-in;">
        <div style="display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:6px;">
          <span style="font-size:1.2rem;">💡</span>
          <span>${title}</span>
        </div>
        <div style="opacity:.9;margin-left:28px;">${body}</div>
      </div>
    `;
  }

  function renderOkCard(title, body) {
    return `
      <div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:12px;padding:14px 16px;color:#064e3b;animation:fadeIn 0.3s ease-in;">
        <div style="display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:6px;">
          <span style="font-size:1.2rem;">✅</span>
          <span>${title}</span>
        </div>
        <div style="opacity:.9;margin-left:28px;">${body}</div>
      </div>
    `;
  }

  function renderErrorCard(body) {
    return `
      <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:14px 16px;color:#7f1d1d;animation:shake 0.4s ease-in-out;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:1.2rem;">⚠️</span>
          <span>${body}</span>
        </div>
      </div>
    `;
  }

  function renderSuccessCard(title, body, icon = "🎉") {
    return `
      <div style="background:linear-gradient(135deg,#ecfdf5,#d1fae5);border:2px solid #86efac;border-radius:12px;padding:16px 18px;color:#064e3b;animation:bounceIn 0.5s ease-in;">
        <div style="display:flex;align-items:center;gap:10px;font-weight:700;margin-bottom:8px;font-size:1.1rem;">
          <span style="font-size:1.5rem;">${icon}</span>
          <span>${title}</span>
        </div>
        <div style="opacity:.95;margin-left:38px;font-size:0.95rem;">${body}</div>
      </div>
    `;
  }

  // Función para resetear todo al estado inicial
  function resetToInitialState() {
    // Limpiar campo de usuario
    if (usernameField) {
      usernameField.value = "";
      usernameField.placeholder = "Ej: juan";
    }
    
    // Limpiar label de estado
    if (userStatusLabel) {
      userStatusLabel.innerHTML = "";
    }
    
    // Ocultar contador de fotos
    if (photoCounter) {
      photoCounter.style.display = "none";
    }
    
    // Ocultar countdown y mensaje "COMPLETADO"
    if (countdownDisplay) {
      countdownDisplay.style.display = "none";
    }
    if (countdownNumber) {
      countdownNumber.style.fontSize = "5rem";
      countdownNumber.style.color = "#fff";
      countdownNumber.textContent = "";
    }
    if (countdownMessage) {
      countdownMessage.style.color = "#fff";
      countdownMessage.style.fontWeight = "400";
      countdownMessage.style.fontSize = "1.5rem";
      countdownMessage.textContent = "Preparate, la captura comenzará en...";
    }
    
    // Resetear estado de voz
    if (voiceCaptureStatus) {
      voiceCaptureStatus.textContent = "";
    }
    
    // Resetear botón a estado inicial
    if (btnCreateUser) {
      btnCreateUser.textContent = "➕ Crear usuario";
      btnCreateUser.style.background = "";
      btnCreateUser.disabled = false;
      btnCreateUser.style.opacity = "1";
      btnCreateUser.style.cursor = "pointer";
    }
    
    // Mensaje inicial
    setStatus(
      renderInfoCard(
        "👋 Listo para registrar",
        "Escribe un nombre de usuario y haz clic en 'Crear usuario' para comenzar."
      ),
      "info"
    );
  }

  // ---------- 1) Crear usuario / Nuevo usuario ----------
  btnCreateUser.onclick = async () => {
    // Si el botón dice "Nuevo usuario", resetear todo
    if (btnCreateUser.textContent.includes("Nuevo usuario") || btnCreateUser.textContent.includes("🔄")) {
      resetToInitialState();
      return;
    }

    const username = (usernameField.value || "").trim();
    
    // Validación más amigable
    if (!username) {
      setStatus(
        renderErrorCard("¡Ups! 👋 Necesitas escribir un nombre de usuario para continuar."),
        "error"
      );
      // Animación en el campo
      usernameField.style.animation = "shake 0.4s ease-in-out";
      setTimeout(() => {
        usernameField.style.animation = "";
        usernameField.focus();
      }, 400);
      return;
    }

    // Validar formato básico
    if (username.length < 2) {
      setStatus(
        renderErrorCard("El nombre de usuario debe tener al menos 2 caracteres. ✏️"),
        "error"
      );
      usernameField.focus();
      return;
    }

    // Deshabilitar botón durante el proceso
    const originalText = btnCreateUser.textContent;
    btnCreateUser.disabled = true;
    btnCreateUser.textContent = "⏳ Creando...";
    btnCreateUser.style.opacity = "0.7";
    btnCreateUser.style.cursor = "not-allowed";

    setStatus(
      renderInfoCard(
        "🔄 Creando usuario...",
        `Estamos preparando todo para <b>${username}</b>. Esto solo tomará un momento...`
      )
    );

    const fd = new FormData();
    fd.append("username", username);

    try {
      // Simular un pequeño delay para mejor UX (opcional)
      await new Promise((r) => setTimeout(r, 300));

      const res = await fetch("/api/register-user/", {
        method: "POST",
        headers: { "X-CSRFToken": getCSRFToken() },
        body: fd,
      });
      
      const data = await res.json().catch(() => ({}));
      
      if (data.success) {
        setStatus(
          renderSuccessCard(
            "¡Usuario creado exitosamente! 🎉",
            `Perfecto, <b>${username}</b> ya está registrado en el sistema. Ahora puedes continuar con los siguientes pasos:<br><br>
            <b>📸 Paso 2:</b> Captura 40 fotos del rostro<br>
            <b>🎤 Paso 3:</b> Captura 10 muestras de voz<br>
            <b>⚙️ Paso 4:</b> Reentrena el sistema completo`,
            "✨"
          ),
          "ok"
        );
        
        // NO limpiar el campo - mantener el nombre para capturar fotos y voz
        // Mostrar label de estado debajo del campo
        if (userStatusLabel) {
          userStatusLabel.innerHTML = `<span style="color:#16a34a;font-weight:600;">✅ Usuario "<b>${username}</b>" creado exitosamente - Listo para capturar</span>`;
        }
        
        // Cambiar botón a "Nuevo usuario" para permitir cancelar/empezar de nuevo
        btnCreateUser.textContent = "🔄 Nuevo usuario";
        btnCreateUser.style.background = "linear-gradient(135deg, #3b82f6, #60a5fa)";
        btnCreateUser.disabled = false;
        btnCreateUser.style.opacity = "1";
        btnCreateUser.style.cursor = "pointer";
      } else {
        // Verificar si es porque el usuario ya existe
        if (data.user_exists || (data.msg && data.msg.includes("Ya existe"))) {
          setStatus(
            renderErrorCard(
              `⚠️ Ya existe un usuario con el nombre "<b>${username}</b>". Por favor, elige otro nombre diferente.`
            ),
            "error"
          );
          // Resaltar el campo
          usernameField.style.border = "2px solid #ef4444";
          usernameField.focus();
          setTimeout(() => {
            usernameField.style.border = "2px solid #e2e8f0";
          }, 3000);
        } else {
          setStatus(
            renderErrorCard(
              data.msg || data.error || "No se pudo crear el usuario. Por favor, intenta con otro nombre. 🤔"
            ),
            "error"
          );
        }
        
        // Restaurar botón
        btnCreateUser.disabled = false;
        btnCreateUser.textContent = originalText;
        btnCreateUser.style.opacity = "1";
        btnCreateUser.style.cursor = "pointer";
      }
    } catch (e) {
      setStatus(
        renderErrorCard(
          "Oops! 😅 Hubo un problema de conexión. Por favor, verifica tu internet e intenta nuevamente."
        ),
        "error"
      );
      // Restaurar botón
      btnCreateUser.disabled = false;
      btnCreateUser.textContent = originalText;
      btnCreateUser.style.opacity = "1";
      btnCreateUser.style.cursor = "pointer";
    }
  };

  // ---------- Función de cuenta regresiva ----------
  async function showCountdown(seconds = 3, message = "Preparate, la captura comenzará en...") {
    if (countdownDisplay) {
      countdownDisplay.style.display = "flex";
    }
    if (countdownMessage) {
      countdownMessage.textContent = message;
    }
    if (countdownNumber) {
      countdownNumber.style.color = "#fff"; // Reset color
      countdownNumber.style.fontSize = "5rem"; // Reset size
      countdownNumber.style.animation = "none"; // Clear animation
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

  // ---------- 2) Capturar 40 fotos ----------
  btnCaptureFaces.onclick = async () => {
    const username = (usernameField.value || "").trim();
    if (!username) {
      setStatus(renderErrorCard("Escribe un nombre de usuario."), "error");
      return;
    }

    setStatus(
      renderInfoCard(
        "📸 Preparando captura de rostro...",
        `¡Perfecto! Vamos a capturar <b>40 fotos</b> del rostro de <b>${username}</b>.<br>
        <b>💡 Instrucciones:</b><br>
        • Mantén el rostro visible y firme<br>
        • Mira directamente a la cámara<br>
        • La captura comenzará en breve con una cuenta regresiva`
      )
    );

    // Mostrar cuenta regresiva
    await showCountdown(3);

    // Mostrar contador de fotos
    if (photoCounter) {
      photoCounter.style.display = "block";
    }
    if (totalPhotoCount) {
      totalPhotoCount.textContent = "40";
    }
    if (currentPhotoCount) {
      currentPhotoCount.textContent = "0";
    }
    if (photoProgressBar) {
      photoProgressBar.style.width = "0%";
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

        // Actualizar contador en tiempo real
        if (currentPhotoCount) {
          currentPhotoCount.textContent = i;
        }
        if (photoProgressBar) {
          const percentage = (i / 40) * 100;
          photoProgressBar.style.width = `${percentage}%`;
        }

        setStatus(
          renderInfoCard(
            "Capturando imágenes…",
            `Foto <b>${i}</b> / 40 capturada correctamente.`
          )
        );
        // Pequeña pausa para no saturar
        await new Promise((r) => setTimeout(r, 250));
      }

      // Mostrar mensaje de finalización destacado sobre la cámara
      if (countdownDisplay) {
        countdownDisplay.style.display = "flex";
      }
      if (countdownNumber) {
        countdownNumber.textContent = "¡COMPLETADO!";
        countdownNumber.style.color = "#22c55e";
        countdownNumber.style.fontSize = "4rem";
        countdownNumber.style.animation = "pulse 0.5s ease-in-out 3";
      }
      if (countdownMessage) {
        countdownMessage.textContent = "40 fotos capturadas exitosamente";
        countdownMessage.style.color = "#22c55e";
        countdownMessage.style.fontWeight = "700";
        countdownMessage.style.fontSize = "1.5rem";
      }

      setStatus(
        renderSuccessCard(
          "¡Fantástico! 🎉 Captura de rostro completada",
          `¡Excelente trabajo! Se capturaron exitosamente <b>40 fotos</b> del rostro de <b>${username}</b>.<br><br>
          <b>✅ Próximos pasos:</b><br>
          1️⃣ Captura las muestras de voz (Paso 2b)<br>
          2️⃣ Reentrena el sistema completo (Paso 3)`,
          "📸"
        ),
        "ok"
      );

      // NO ocultar el mensaje "COMPLETADO" - se mantendrá hasta que termine el reentrenamiento
      // Solo ocultar el contador de fotos
      setTimeout(() => {
        if (photoCounter) {
          photoCounter.style.display = "none";
        }
      }, 2000);
    } catch (e) {
      setStatus(renderErrorCard("Error durante la captura de imágenes."), "error");
      if (countdownDisplay) {
        countdownDisplay.style.display = "none";
      }
    }
  };

  // ---------- 3) Reentrenar ambos sistemas ----------
  btnRetrainAll.onclick = async () => {
    const t0 = performance.now();
    let faceSuccess = false;
    let voiceSuccess = false;
    let faceError = null;
    let voiceError = null;

    // Paso 1: Reentrenar modelo de rostro
    setStatus(
      renderInfoCard(
        "🤖 Entrenando modelo de rostro...",
        `¡Genial! Estamos actualizando el modelo de reconocimiento facial con las nuevas imágenes.<br>
        <b>⏱️ Tiempo estimado:</b> 20-60 segundos<br>
        <b>💡 No cierres esta ventana durante el proceso.</b>`
      )
    );
    
    try {
      const resFace = await fetch("/api/retrain/", {
        method: "POST",
        headers: { "X-CSRFToken": getCSRFToken() },
      });
      const dataFace = await resFace.json().catch(() => ({}));
      
      if (dataFace.success) {
        faceSuccess = true;
      } else {
        faceError = dataFace.msg || "No se pudo entrenar el modelo de rostro.";
      }
    } catch (e) {
      faceError = "Error de red durante el reentrenamiento de rostro.";
    }

    // Paso 2: Reentrenar modelo de voz
    if (faceSuccess) {
      setStatus(
        renderInfoCard(
          "🎤 Entrenando modelo de voz...",
          `¡Perfecto! El modelo de rostro está listo. Ahora estamos actualizando el modelo de reconocimiento de voz.<br>
          <b>⏱️ Tiempo estimado:</b> 20-60 segundos<br>
          <b>💡 Casi terminamos, solo un momento más...</b>`
        )
      );
    }

    try {
      const resVoice = await fetch("/api/retrain-voice/", {
        method: "POST",
        headers: { "X-CSRFToken": getCSRFToken() },
      });
      const dataVoice = await resVoice.json().catch(() => ({}));
      
      if (dataVoice.success) {
        voiceSuccess = true;
      } else {
        // Verificar si es un mensaje informativo (no hay suficientes usuarios aún)
        if (dataVoice.is_info || (dataVoice.msg && dataVoice.msg.includes("al menos 2 usuarios"))) {
          voiceError = dataVoice.msg || "Se necesitan al menos 2 usuarios para entrenar el modelo de voz.";
          voiceError = "INFO: " + voiceError; // Marcar como informativo
        } else {
          voiceError = dataVoice.msg || "No se pudo entrenar el modelo de voz.";
        }
      }
    } catch (e) {
      voiceError = "Error de red durante el reentrenamiento de voz.";
    }

    // Resultado final
    const ms = Math.round(performance.now() - t0);

    if (faceSuccess && voiceSuccess) {
      setStatus(
        renderSuccessCard(
          "¡Entrenamiento completado exitosamente! 🎉",
          `¡Excelente! Ambos modelos han sido actualizados correctamente.<br><br>
          <b>✅ Modelos actualizados:</b><br>
          • Reconocimiento facial (PCA + SVM)<br>
          • Reconocimiento de voz (MFCC + PCA + SVM)<br><br>
          <b>⏱️ Tiempo total:</b> ${(ms / 1000).toFixed(1)} segundos<br><br>
          <b>🚀 Ya puedes probar el sistema en el modo Usuario!</b>`,
          "✨"
        ),
        "ok"
      );
      
        // Resetear todo después del entrenamiento completo
        setTimeout(() => {
          resetToInitialState();
          setStatus(
            renderInfoCard(
              "✅ Sistema listo para nuevo registro",
              "El entrenamiento se completó exitosamente. Puedes registrar un nuevo usuario o probar el sistema en modo Usuario."
            ),
            "info"
          );
        }, 3000); // Esperar 3 segundos antes de resetear para que el usuario vea el mensaje de éxito
    } else if (faceSuccess && !voiceSuccess) {
      // Si el error de voz es informativo, mostrar mensaje informativo en lugar de error
      if (voiceError && voiceError.startsWith("INFO:")) {
        const infoMsg = voiceError.replace("INFO: ", "");
        setStatus(
          renderInfoCard(
            "Modelo de rostro actualizado correctamente",
            `El modelo de rostro está listo. ${infoMsg} Puedes continuar registrando más usuarios y luego reentrenar.`
          ),
          "info"
        );
        
        // Resetear todo el sistema para permitir registrar otro usuario
        setTimeout(() => {
          resetToInitialState();
          setStatus(
            renderInfoCard(
              "✅ Sistema listo para nuevo registro",
              "El modelo de rostro está actualizado. Puedes registrar otro usuario para completar el entrenamiento de voz (se necesitan al menos 2 usuarios)."
            ),
            "info"
          );
        }, 3000); // Esperar 3 segundos antes de resetear
      } else {
        // Traducir mensajes de error comunes al español
        let errorMsg = voiceError || "Error desconocido";
        let isInfoError = false;
        if (errorMsg.includes("least populated class") || errorMsg.includes("only 1 member") || errorMsg.includes("minimum number of groups")) {
          errorMsg = "La clase menos poblada tiene solo 1 miembro, lo cual es insuficiente. El número mínimo de grupos para cualquier clase no puede ser menor a 2. Esto es normal cuando estás registrando el primer usuario. Necesitas al menos 2 usuarios con muestras de voz para entrenar el modelo.";
          isInfoError = true;
        }
        setStatus(
          renderErrorCard(
            `Modelo de rostro actualizado correctamente, pero hubo un error con el modelo de voz: ${errorMsg}`
          ),
          "error"
        );
        
        // Si es un error informativo (primer usuario), resetear todo después de 3 segundos
        if (isInfoError) {
          setTimeout(() => {
            resetToInitialState();
            setStatus(
              renderInfoCard(
                "✅ Sistema listo para nuevo registro",
                "El modelo de rostro está actualizado. Puedes registrar otro usuario para completar el entrenamiento de voz (se necesitan al menos 2 usuarios)."
              ),
              "info"
            );
          }, 3000); // Esperar 3 segundos antes de resetear
        }
      }
    } else if (!faceSuccess && voiceSuccess) {
      setStatus(
        renderErrorCard(
          `Modelo de voz actualizado correctamente, pero hubo un error con el modelo de rostro: ${faceError || "Error desconocido"}`
        ),
        "error"
      );
    } else {
      setStatus(
        renderErrorCard(
          `Error en ambos modelos. Rostro: ${faceError || "Error desconocido"}. Voz: ${voiceError || "Error desconocido"}`
        ),
        "error"
      );
    }
  };

  // ---------- Captura de voz ----------
  let voiceMediaRecorder = null;
  let voiceAudioChunks = [];

  async function startVoiceRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceMediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      voiceAudioChunks = [];

      voiceMediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceAudioChunks.push(event.data);
        }
      };

      voiceMediaRecorder.onstop = async () => {
        const audioBlob = new Blob(voiceAudioChunks, { type: 'audio/webm' });
        await sendVoiceSample(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      voiceMediaRecorder.start();
      voiceCaptureStatus.textContent = "🎤 Grabando... Habla ahora (6 segundos)";
      voiceCaptureStatus.style.color = "#ef4444";
      
      // Mostrar la frase que deben decir
      if (voicePhraseDisplay) {
        const username = (usernameField.value || "").trim();
        if (currentPhraseName) {
          currentPhraseName.textContent = username || "[nombre del usuario]";
        }
        voicePhraseDisplay.style.display = "block";
      }
    } catch (e) {
      setStatus(renderErrorCard("No se pudo acceder al micrófono."), "error");
    }
  }

  function stopVoiceRecording() {
    if (voiceMediaRecorder && voiceMediaRecorder.state !== 'inactive') {
      voiceMediaRecorder.stop();
      voiceCaptureStatus.textContent = "⏳ Procesando...";
      voiceCaptureStatus.style.color = "#3b82f6";
      
      // Ocultar la frase cuando termina la grabación
      if (voicePhraseDisplay) {
        voicePhraseDisplay.style.display = "none";
      }
    }
  }

  async function sendVoiceSample(audioBlob) {
    const username = (usernameField.value || "").trim();
    if (!username) {
      setStatus(renderErrorCard("Escribe un nombre de usuario."), "error");
      return;
    }

    try {
      // Convertir WebM a WAV
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const wavBlob = audioBufferToWav(audioBuffer);

      const fd = new FormData();
      fd.append("username", username);
      fd.append("audio", wavBlob, "voice.wav");

      const res = await fetch("/api/capture-voice/", {
        method: "POST",
        headers: { "X-CSRFToken": getCSRFToken() },
        body: fd,
      });

      const data = await res.json().catch(() => ({}));
      return data.success;
    } catch (e) {
      console.error("Error enviando muestra de voz:", e);
      return false;
    }
  }

  function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const length = buffer.length * numChannels * bytesPerSample;
    const arrayBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(arrayBuffer);

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

  // ---------- Capturar 10 muestras de voz ----------
  btnCaptureVoices.onclick = async () => {
    const username = (usernameField.value || "").trim();
    if (!username) {
      setStatus(renderErrorCard("Escribe un nombre de usuario."), "error");
      return;
    }

    setStatus(
      renderInfoCard(
        "🎤 Iniciando captura de voz...",
        `¡Perfecto! Vamos a capturar <b>10 muestras de voz</b> para <b>${username}</b>.<br>
        <b>⏱️ Tiempo estimado:</b> Aproximadamente 1.5 minutos<br>
        <b>💡 Consejo:</b> Habla claro y natural, repite la frase indicada en cada grabación.`
      )
    );

    try {
      for (let i = 1; i <= 10; i++) {
        voiceCaptureStatus.textContent = `Preparando muestra ${i}/10...`;
        voiceCaptureStatus.style.color = "#3b82f6";
        
        // Pausa antes de iniciar (reducida para agilizar)
        await new Promise((r) => setTimeout(r, 500));
        
        // Iniciar grabación
        await startVoiceRecording();
        
        // Esperar 6 segundos de grabación
        await new Promise((r) => setTimeout(r, 6000));
        
        // Detener grabación
        stopVoiceRecording();
        
        // Esperar a que termine el procesamiento (reducido)
        await new Promise((r) => setTimeout(r, 200));
        
        voiceCaptureStatus.textContent = `Muestra ${i}/10 capturada correctamente.`;
        voiceCaptureStatus.style.color = "#16a34a";
        
        setStatus(
          renderInfoCard(
            "Capturando muestras de voz…",
            `Muestra <b>${i}</b> / 10 capturada correctamente.`
          )
        );
        
        // Pausa entre muestras (reducida para agilizar)
        if (i < 10) {
          await new Promise((r) => setTimeout(r, 800));
        }
      }

      setStatus(
        renderSuccessCard(
          "¡Excelente! 🎉 Dataset de voz completado",
          `¡Genial! Se capturaron exitosamente <b>10 muestras de voz</b> para <b>${username}</b>.<br><br>
          <b>✅ Próximo paso:</b> Haz clic en "Reentrenar sistema completo" para actualizar los modelos con los nuevos datos.`,
          "🎤"
        ),
        "ok"
      );
      voiceCaptureStatus.textContent = "✅ 10 muestras capturadas";
      voiceCaptureStatus.style.color = "#16a34a";
    } catch (e) {
      setStatus(renderErrorCard("Error durante la captura de voz."), "error");
      voiceCaptureStatus.textContent = "❌ Error en captura";
      voiceCaptureStatus.style.color = "#ef4444";
    }
  };

});
