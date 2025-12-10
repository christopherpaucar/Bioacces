# authentication/views.py
from django.shortcuts import render
from django.http import JsonResponse
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
import cv2
import numpy as np

from .utils import (
    read_image_to_gray,
    detect_and_crop_face,
    save_face_image,
    detect_single_face,
)
from .ml import train_models, predict_identity
from .voice_utils import (
    read_audio_from_bytes,
    preprocess_audio,
    save_voice_sample,
    validate_audio,
)
from .voice_ml import train_voice_models, predict_voice_identity


def index(request):
    return render(request, "index.html")


def admin_panel(request):
    return render(request, "admin_panel.html")


@csrf_exempt
def api_register_user(request):
    """Crea (si no existe) la carpeta del usuario en data/processed_faces/<username> y data/processed_voices/<username>."""
    if request.method != "POST":
        return JsonResponse({"success": False, "msg": "Método inválido."}, status=405)
    username = (request.POST.get("username") or "").strip()
    if not username:
        return JsonResponse({"success": False, "msg": "username requerido."}, status=400)
    
    user_face_dir = settings.PROCESSED_DIR / username
    user_voice_dir = settings.PROCESSED_VOICE_DIR / username
    
    # Verificar si el usuario ya existe (si alguna de las carpetas existe y tiene contenido)
    user_exists = False
    if user_face_dir.exists() and any(user_face_dir.iterdir()):
        user_exists = True
    elif user_voice_dir.exists() and any(user_voice_dir.iterdir()):
        user_exists = True
    
    if user_exists:
        return JsonResponse({
            "success": False, 
            "msg": f"Ya existe un usuario con el nombre '{username}'. Por favor, elige otro nombre.",
            "user_exists": True
        }, status=400)
    
    user_face_dir.mkdir(parents=True, exist_ok=True)
    user_voice_dir.mkdir(parents=True, exist_ok=True)
    return JsonResponse({"success": True, "msg": f"Usuario '{username}' listo para capturar."})


@csrf_exempt
def api_capture_face(request):
    """Recibe username e imagen (blob JPEG). Detecta rostro, recorta y guarda en gris."""
    if request.method != "POST":
        return JsonResponse({"success": False, "msg": "Método inválido."}, status=405)

    username = (request.POST.get("username") or "").strip()
    file = request.FILES.get("image")
    if not username or not file:
        return JsonResponse({"success": False, "msg": "Faltan username o imagen."}, status=400)

    orig, gray = read_image_to_gray(file.read())
    if gray is None:
        return JsonResponse({"success": False, "msg": "No se pudo leer la imagen."}, status=400)

    face = detect_and_crop_face(gray)
    if face is None:
        return JsonResponse({"success": False, "msg": "No se detectó rostro."}, status=200)

    path = save_face_image(username, face)
    return JsonResponse({"success": True, "msg": "Rostro guardado.", "path": str(path)})


@csrf_exempt
def api_retrain(request):
    """Entrena PCA + SVM con el contenido actual de data/processed_faces/."""
    if request.method != "POST":
        return JsonResponse({"success": False, "msg": "Método inválido."}, status=405)
    try:
        result = train_models()
        return JsonResponse(result)
    except Exception as e:
        return JsonResponse({"success": False, "msg": f"Error entrenando: {e}"}, status=500)


@csrf_exempt
def verify_face(request):
    """Verificación: usa el MISMO pipeline de recorte que el training (Haar + recorte rectangular)."""
    if request.method != "POST":
        return JsonResponse({"success": False, "msg": "Método no permitido"}, status=405)

    frame = request.FILES.get("frame")
    if not frame:
        return JsonResponse({"success": False, "msg": "Frame ausente"}, status=400)

    data = np.frombuffer(frame.read(), np.uint8)
    bgr = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if bgr is None:
        return JsonResponse({"success": False, "msg": "Imagen inválida"}, status=400)

    # === clave: usar el mismo detector/recorte que en el training/captura ===
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    face_gray_resized = detect_and_crop_face(gray)   # <- igual que api_capture_face()
    if face_gray_resized is None:
        return JsonResponse({
            "success": True, "accepted": False,
            "reason": "No se detectó rostro",
            "confidence": None, "latency_ms": 0, "model": "PCA + SVM"
        })

    r = predict_identity(face_gray_resized)  # ahora le pasamos GRIS ya recortado
    if not r.get("success"):
        return JsonResponse(r, status=500)

    base = {
        "success": True,
        "accepted": r["accepted"],
        "confidence": r["confidence"],
        "latency_ms": r["latency_ms"],
        "model": "PCA + SVM",
        "top1_label": r.get("top1_label"),
        "top1_prob": r.get("top1_prob"),
        "top2_label": r.get("top2_label"),
        "top2_prob": r.get("top2_prob"),
    }
    if r["accepted"]:
        base["label"] = r["label"]
    else:
        base["reason"] = r["reason"] or "Tu rostro no coincide con ningún usuario registrado."
    return JsonResponse(base)


# ==================== ENDPOINTS DE VOZ ====================

@csrf_exempt
def api_capture_voice(request):
    """Recibe username y audio (blob WAV/MP3). Procesa y guarda la muestra de voz."""
    if request.method != "POST":
        return JsonResponse({"success": False, "msg": "Método inválido."}, status=405)

    username = (request.POST.get("username") or "").strip()
    audio_file = request.FILES.get("audio")
    if not username or not audio_file:
        return JsonResponse({"success": False, "msg": "Faltan username o audio."}, status=400)

    try:
        audio_bytes = audio_file.read()
        audio_data, sample_rate = read_audio_from_bytes(audio_bytes)
        
        # Validar audio
        is_valid, error_msg = validate_audio(audio_data, sample_rate)
        if not is_valid:
            return JsonResponse({"success": False, "msg": error_msg}, status=400)
        
        # Preprocesar
        audio_data = preprocess_audio(audio_data, sample_rate)
        
        # Guardar
        path = save_voice_sample(username, audio_data, sample_rate)
        return JsonResponse({"success": True, "msg": "Voz guardada.", "path": str(path)})
    except Exception as e:
        return JsonResponse({"success": False, "msg": f"Error procesando audio: {str(e)}"}, status=500)


@csrf_exempt
def api_retrain_voice(request):
    """Entrena PCA + SVM con el contenido actual de data/processed_voices/."""
    if request.method != "POST":
        return JsonResponse({"success": False, "msg": "Método inválido."}, status=405)
    try:
        result = train_voice_models()
        return JsonResponse(result)
    except RuntimeError as e:
        # Si es un error de "no hay suficientes clases", es normal al inicio
        error_msg = str(e)
        if "al menos 2 clases" in error_msg or "Se necesitan al menos 2" in error_msg:
            return JsonResponse({
                "success": False,
                "msg": "Se necesitan al menos 2 usuarios con muestras de voz para entrenar el modelo. Esto es normal cuando estás registrando el primer usuario.",
                "is_info": True  # Flag para indicar que es informativo, no un error crítico
            }, status=200)  # Status 200 porque no es realmente un error
        return JsonResponse({"success": False, "msg": f"Error entrenando modelo de voz: {e}"}, status=500)
    except Exception as e:
        return JsonResponse({"success": False, "msg": f"Error entrenando modelo de voz: {e}"}, status=500)


@csrf_exempt
def verify_voice(request):
    """Verificación de voz: procesa audio y predice identidad."""
    if request.method != "POST":
        return JsonResponse({"success": False, "msg": "Método no permitido"}, status=405)

    audio_file = request.FILES.get("audio")
    if not audio_file:
        return JsonResponse({"success": False, "msg": "Audio ausente"}, status=400)

    try:
        audio_bytes = audio_file.read()
        audio_data, sample_rate = read_audio_from_bytes(audio_bytes)
        
        # Validar audio
        is_valid, error_msg = validate_audio(audio_data, sample_rate)
        if not is_valid:
            return JsonResponse({
                "success": True,
                "accepted": False,
                "reason": error_msg,
                "confidence": None,
                "latency_ms": 0,
                "model": "MFCC + PCA + SVM"
            })
        
        # Preprocesar
        audio_data = preprocess_audio(audio_data, sample_rate)
        
        # Predecir
        r = predict_voice_identity(audio_data, sample_rate)
        if not r.get("success"):
            return JsonResponse(r, status=500)

        base = {
            "success": True,
            "accepted": r["accepted"],
            "confidence": r["confidence"],
            "latency_ms": r["latency_ms"],
            "model": "MFCC + PCA + SVM",
            "top1_label": r.get("top1_label"),
            "top1_prob": r.get("top1_prob"),
            "top2_label": r.get("top2_label"),
            "top2_prob": r.get("top2_prob"),
        }
        if r["accepted"]:
            base["label"] = r["label"]
        else:
            base["reason"] = r["reason"] or "Tu voz no coincide con ningún usuario registrado."
        return JsonResponse(base)
    except Exception as e:
        return JsonResponse({"success": False, "msg": f"Error procesando audio: {str(e)}"}, status=500)


@csrf_exempt
def verify_both(request):
    """Verificación conjunta de rostro y voz: procesa ambos y devuelve resultados combinados."""
    if request.method != "POST":
        return JsonResponse({"success": False, "msg": "Método no permitido"}, status=405)

    frame = request.FILES.get("frame")
    audio_file = request.FILES.get("audio")
    
    if not frame or not audio_file:
        return JsonResponse({"success": False, "msg": "Faltan frame o audio"}, status=400)

    try:
        # === Validar rostro ===
        face_result = None
        face_error = None
        try:
            data = np.frombuffer(frame.read(), np.uint8)
            bgr = cv2.imdecode(data, cv2.IMREAD_COLOR)
            if bgr is None:
                face_error = "Imagen inválida"
            else:
                gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
                face_gray_resized = detect_and_crop_face(gray)
                if face_gray_resized is None:
                    face_result = {
                        "success": True,
                        "accepted": False,
                        "reason": "No se detectó rostro",
                        "confidence": None,
                        "model": "PCA + SVM"
                    }
                else:
                    r = predict_identity(face_gray_resized)
                    if r.get("success"):
                        face_result = {
                            "success": True,
                            "accepted": r["accepted"],
                            "confidence": r["confidence"],
                            "label": r.get("label"),
                            "reason": r.get("reason"),
                            "model": "PCA + SVM",
                            "top1_label": r.get("top1_label"),
                            "top1_prob": r.get("top1_prob"),
                        }
                    else:
                        face_error = "Error en predicción de rostro"
        except Exception as e:
            face_error = f"Error procesando rostro: {str(e)}"

        # === Validar voz ===
        voice_result = None
        voice_error = None
        try:
            audio_bytes = audio_file.read()
            audio_data, sample_rate = read_audio_from_bytes(audio_bytes)
            
            is_valid, error_msg = validate_audio(audio_data, sample_rate)
            if not is_valid:
                voice_result = {
                    "success": True,
                    "accepted": False,
                    "reason": error_msg,
                    "confidence": None,
                    "model": "MFCC + PCA + SVM"
                }
            else:
                audio_data = preprocess_audio(audio_data, sample_rate)
                r = predict_voice_identity(audio_data, sample_rate)
                if r.get("success"):
                    voice_result = {
                        "success": True,
                        "accepted": r["accepted"],
                        "confidence": r["confidence"],
                        "label": r.get("label"),
                        "reason": r.get("reason"),
                        "model": "MFCC + PCA + SVM",
                        "top1_label": r.get("top1_label"),
                        "top1_prob": r.get("top1_prob"),
                    }
                else:
                    voice_error = "Error en predicción de voz"
        except Exception as e:
            voice_error = f"Error procesando voz: {str(e)}"

        # === Resultado combinado ===
        # Obtener confianza promedio primero
        face_conf = face_result.get("confidence") if face_result else None
        voice_conf = voice_result.get("confidence") if voice_result else None
        avg_confidence = None
        if face_conf is not None and voice_conf is not None:
            avg_confidence = (face_conf + voice_conf) / 2
        elif face_conf is not None:
            avg_confidence = face_conf
        elif voice_conf is not None:
            avg_confidence = voice_conf
        
        # Obtener labels de top1 para mostrar siempre
        face_top1_label = face_result.get("top1_label") if face_result else None
        voice_top1_label = voice_result.get("top1_label") if voice_result else None
        face_top1_prob = face_result.get("top1_prob") if face_result else None
        voice_top1_prob = voice_result.get("top1_prob") if voice_result else None
        
        # Ambos deben aceptar para que el acceso sea concedido
        both_accepted = (
            face_result and face_result.get("accepted") and
            voice_result and voice_result.get("accepted")
        )
        
        # Verificar que ambos identifiquen al mismo usuario
        same_user = False
        if both_accepted:
            face_label = face_result.get("label")
            voice_label = voice_result.get("label")
            same_user = (face_label and voice_label and face_label == voice_label)

        # Determinar resultado final - LÓGICA ULTRA SIMPLIFICADA: Si promedio >= 75% → PERMITIR (sin más condiciones)
        final_accepted = False
        identified_user = None
        
        # Obtener top1_label directamente de los resultados (siempre están disponibles incluso si rechazan)
        face_top1 = None
        voice_top1 = None
        
        if face_result:
            face_top1 = face_result.get("top1_label")
        if voice_result:
            voice_top1 = voice_result.get("top1_label")
        
        # Determinar usuario más probable para mostrar
        if face_conf and voice_conf:
            if face_conf >= voice_conf:
                identified_user = face_top1 if face_top1 else face_top1_label
            else:
                identified_user = voice_top1 if voice_top1 else voice_top1_label
        elif face_conf:
            identified_user = face_top1 if face_top1 else face_top1_label
        elif voice_conf:
            identified_user = voice_top1 if voice_top1 else voice_top1_label
        
        # LÓGICA DE ACEPTACIÓN: Si promedio >= 75% → PERMITIR (usar el usuario con mayor confianza)
        if (face_conf is not None and voice_conf is not None and 
            avg_confidence is not None and avg_confidence >= 0.75):
            
            # Si ambos tienen top1_label, verificar si coinciden
            if face_top1 and voice_top1:
                # Comparar sin importar mayúsculas/minúsculas y espacios
                face_label_clean = str(face_top1).strip().lower()
                voice_label_clean = str(voice_top1).strip().lower()
                
                if face_label_clean == voice_label_clean:
                    # Ambos identifican al mismo usuario - PERMITIR
                    final_accepted = True
                    identified_user = face_top1
                else:
                    # No coinciden exactamente, pero promedio >= 75% - PERMITIR usando el de mayor confianza
                    final_accepted = True
                    if face_conf >= voice_conf:
                        identified_user = face_top1
                    else:
                        identified_user = voice_top1
            else:
                # Si falta algún top1_label pero el promedio es alto, permitir con el que esté disponible
                if face_top1 or voice_top1:
                    final_accepted = True
                    identified_user = face_top1 if face_top1 else voice_top1
                else:
                    final_accepted = False
        else:
            # Promedio menor a 75% o falta alguna modalidad
            final_accepted = False

        # Construir respuesta
        result = {
            "success": True,
            "accepted": final_accepted,
            "face": face_result if face_result else {"error": face_error},
            "voice": voice_result if voice_result else {"error": voice_error},
            "confidence": avg_confidence,
            "face_confidence": face_conf,
            "voice_confidence": voice_conf,
        }
        
        # Siempre incluir el label del usuario más probable
        if identified_user:
            result["label"] = identified_user
        elif face_top1_label:
            result["label"] = face_top1_label
        elif voice_top1_label:
            result["label"] = voice_top1_label
        
        # Incluir top1 labels y probabilidades para mostrar en el frontend
        if face_top1_label:
            result["face_top1_label"] = face_top1_label
            result["face_top1_prob"] = face_top1_prob
        if voice_top1_label:
            result["voice_top1_label"] = voice_top1_label
            result["voice_top1_prob"] = voice_top1_prob
        
        if final_accepted:
            result["label"] = identified_user or face_result.get("label") or voice_result.get("label")
        else:
            reasons = []
            if face_result and not face_result.get("accepted"):
                reasons.append(f"Rostro: {face_result.get('reason', 'No reconocido')}")
            if voice_result and not voice_result.get("accepted"):
                reasons.append(f"Voz: {voice_result.get('reason', 'No reconocida')}")
            if both_accepted and not same_user:
                reasons.append(f"Los biométricos no coinciden (rostro: {face_result.get('label')}, voz: {voice_result.get('label')})")
            result["reason"] = "; ".join(reasons) if reasons else "Acceso denegado"

        return JsonResponse(result)
    except Exception as e:
        return JsonResponse({"success": False, "msg": f"Error en verificación combinada: {str(e)}"}, status=500)
