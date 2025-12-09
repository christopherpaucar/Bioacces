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


def index(request):
    return render(request, "index.html")


def admin_panel(request):
    return render(request, "admin_panel.html")


@csrf_exempt
def api_register_user(request):
    """Crea (si no existe) la carpeta del usuario en data/processed_faces/<username>."""
    if request.method != "POST":
        return JsonResponse({"success": False, "msg": "Método inválido."}, status=405)
    username = (request.POST.get("username") or "").strip()
    if not username:
        return JsonResponse({"success": False, "msg": "username requerido."}, status=400)
    user_dir = settings.PROCESSED_DIR / username
    user_dir.mkdir(parents=True, exist_ok=True)
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
