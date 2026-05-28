# authentication/utils.py
import cv2
import numpy as np
from pathlib import Path
from django.conf import settings
import time
import shutil
import tempfile

def _load_haar_cascade():
  source = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
  target_dir = Path(tempfile.gettempdir()) / "bioacces_haar"
  target_dir.mkdir(parents=True, exist_ok=True)
  target = target_dir / source.name
  if not target.exists():
    shutil.copy2(source, target)
  cascade = cv2.CascadeClassifier(str(target))
  if cascade.empty():
    raise RuntimeError(f"No se pudo cargar el clasificador Haar desde {target}")
  return cascade


HAAR = _load_haar_cascade()


def ensure_dir(path: Path):
  path.mkdir(parents=True, exist_ok=True)


def read_image_to_gray(file_bytes: bytes):
  """Lee bytes -> BGR y Gray. Devuelve (bgr, gray). Si falla, (None, None)."""
  data = np.frombuffer(file_bytes, np.uint8)
  img = cv2.imdecode(data, cv2.IMREAD_COLOR)
  if img is None:
      return None, None
  gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
  return img, gray


def detect_and_crop_face(gray: np.ndarray):
  """Detecta la cara en GRAY, recorta y redimensiona a settings.IMG_SIZE."""
  faces = HAAR.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=6, minSize=(80, 80))
  if len(faces) == 0:
      return None
  x, y, w, h = max(faces, key=lambda b: b[2]*b[3])
  crop = gray[y:y+h, x:x+w]
  face = cv2.resize(crop, settings.IMG_SIZE, interpolation=cv2.INTER_AREA)
  face = cv2.equalizeHist(face)
  return face


def save_face_image(username: str, face_gray_resized: np.ndarray):
  user_dir = settings.PROCESSED_DIR / username
  ensure_dir(user_dir)
  ts = int(time.time() * 1000)
  path = user_dir / f"{username}_{ts}.jpg"
  cv2.imwrite(str(path), face_gray_resized)
  return path


def detect_single_face(bgr):
    """
    Devuelve un recorte BGR del rostro con los mismos parámetros
    que usamos al generar el dataset de entrenamiento.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    # mismos parámetros que detect_and_crop_face()
    faces = HAAR.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(80, 80))
    if len(faces) == 0:
        return None

    # toma la cara más grande y SIN padding (igual que train)
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    face = bgr[y:y+h, x:x+w].copy()
    return face
