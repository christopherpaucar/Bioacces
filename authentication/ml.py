# authentication/ml.py
import glob
import time
import joblib
import numpy as np
import cv2
from pathlib import Path
from sklearn.decomposition import PCA
from sklearn.svm import SVC
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split

# === Rutas
BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
PROC_DIR = DATA_DIR / "processed_faces"
MODELS_DIR = DATA_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

PCA_PATH = MODELS_DIR / "face_pca.joblib"
SVM_PATH = MODELS_DIR / "face_svm.joblib"
LBL_PATH = MODELS_DIR / "label_encoder.joblib"
CENTS_PATH = MODELS_DIR / "class_centroids.joblib"

# === Hiperparámetros y umbrales de rechazo
IMG_SIZE = (160, 160)
PCA_KEEP = 0.95
SVM_KERNEL = "rbf"
SVM_C = 10.0
SVM_GAMMA = "scale"

import os
# Umbrales configurables por ENV (para ajustar sin tocar código)
THRESH_PROBA  = float(os.getenv("FACE_THRESH_PROBA",  "0.60"))  # antes 0.85 -> 0.60
THRESH_MARGIN = float(os.getenv("FACE_THRESH_MARGIN", "0.08"))  # antes 0.10 -> 0.08
THRESH_DIST   = float(os.getenv("FACE_THRESH_DIST",   "2.60"))  # antes 2.20 -> 2.60

PROBA_OVERRIDE_ACCEPT = 0.80

# ---------------- Utilidades ----------------
def _read_image(path: str) -> np.ndarray:
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f"No se pudo leer {path}")
    img = cv2.resize(img, IMG_SIZE, interpolation=cv2.INTER_AREA)
    img = cv2.equalizeHist(img)
    img = img.astype("float32")
    norm = np.linalg.norm(img)
    if norm > 0:
        img = img / norm
    return img.ravel()

def _load_dataset():
    X, y = [], []
    class_dirs = [d for d in PROC_DIR.glob("*") if d.is_dir()]
    if not class_dirs:
        raise RuntimeError("No hay clases en data/processed_faces")
    for d in class_dirs:
        label = d.name
        files = list(d.glob("*.jpg")) + list(d.glob("*.png"))
        for f in files:
            try:
                X.append(_read_image(str(f)))
                y.append(label)
            except Exception:
                continue
    X = np.array(X, dtype="float32")
    y = np.array(y)
    if len(np.unique(y)) < 2:
        raise RuntimeError("Se necesitan al menos 2 clases para entrenar.")
    return X, y

def _class_centroids(pca_feats: np.ndarray, labels: np.ndarray):
    cents = {}
    for cls in np.unique(labels):
        cents[int(cls)] = pca_feats[labels == cls].mean(axis=0)
    return cents

# ---------------- Entrenamiento ----------------
def train_models():
    t0 = time.time()
    X, y = _load_dataset()
    le = LabelEncoder()
    y_enc = le.fit_transform(y)

    # Entrena con split para estabilidad y luego reajusta con todo
    Xtr, Xte, ytr, yte = train_test_split(X, y_enc, test_size=0.2, stratify=y_enc, random_state=42)

    pca = PCA(n_components=PCA_KEEP, svd_solver="full", whiten=True, random_state=42)
    Ztr = pca.fit_transform(Xtr)

    svm = SVC(
        kernel=SVM_KERNEL,
        C=SVM_C,
        gamma=SVM_GAMMA,
        probability=True,
        class_weight="balanced",
        random_state=42,
    )
    svm.fit(Ztr, ytr)

    # Re-entrena con TODO el dataset para el modelo final
    pca_full = PCA(n_components=PCA_KEEP, svd_solver="full", whiten=True, random_state=42)
    Z = pca_full.fit_transform(X)
    svm_full = SVC(
        kernel=SVM_KERNEL,
        C=SVM_C,
        gamma=SVM_GAMMA,
        probability=True,
        class_weight="balanced",
        random_state=42,
    ).fit(Z, y_enc)

    cents = _class_centroids(Z, y_enc)

    joblib.dump(pca_full, PCA_PATH)
    joblib.dump(svm_full, SVM_PATH)
    joblib.dump(le, LBL_PATH)
    joblib.dump(cents, CENTS_PATH)

    return {
        "success": True,
        "classes": le.classes_.tolist(),
        "seconds": round(time.time() - t0, 2),
    }

# ---------------- Predicción con rechazo ----------------
def predict_identity(face_img: np.ndarray):
    """
    face_img puede ser:
      - cara en GRIS (ya recortada y reescalada por detect_and_crop_face)
      - o cara en BGR (recorte crudo).
    """
    t0 = time.time()
    if not (PCA_PATH.exists() and SVM_PATH.exists() and LBL_PATH.exists()):
        return {"success": False, "accepted": False, "reason": "Modelo no entrenado."}

    pca   = joblib.load(PCA_PATH)
    svm   = joblib.load(SVM_PATH)
    le    = joblib.load(LBL_PATH)
    cents = joblib.load(MODELS_DIR / "class_centroids.joblib")

    # --- normaliza entrada ---
    if face_img.ndim == 3:   # BGR -> GRAY
        gray = cv2.cvtColor(face_img, cv2.COLOR_BGR2GRAY)
    else:
        gray = face_img

    # Asegurar tamaño/normalización EXACTOS a los del training
    gray = cv2.resize(gray, IMG_SIZE, interpolation=cv2.INTER_AREA)
    gray = cv2.equalizeHist(gray)
    v = gray.astype("float32")
    v = v / (np.linalg.norm(v) + 1e-9)
    z = pca.transform(v.ravel().reshape(1, -1))

    proba = svm.predict_proba(z)[0]
    order = np.argsort(proba)[::-1]
    k1, k2 = order[0], (order[1] if len(order) > 1 else order[0])
    p1, p2 = float(proba[k1]), float(proba[k2])
    label1 = le.inverse_transform([k1])[0]
    label2 = le.inverse_transform([k2])[0]
    margin = p1 - p2

    center = cents[int(k1)]
    dist = float(np.linalg.norm(z[0] - center))

    accepted = True
    reason = None
        # --- política de aceptación/denegación ---
    # Si la probabilidad top-1 es >= 80%, aceptamos SIN chequear distancia/margen.
    if p1 >= PROBA_OVERRIDE_ACCEPT:
        accepted = True
        reason = None
    else:
        accepted = True
        reason = None
        if p1 < THRESH_PROBA:
            accepted = False
            reason = f"Probabilidad baja ({p1:.2f} < {THRESH_PROBA})"
        elif margin < THRESH_MARGIN:
            accepted = False
            reason = f"Margen top-2 insuficiente ({margin:.2f} < {THRESH_MARGIN})"
        elif dist > THRESH_DIST:
            accepted = False
            reason = f"Distancia PCA alta ({dist:.2f} > {THRESH_DIST})"


    return {
        "success": True,
        "accepted": accepted,
        "label": label1 if accepted else None,
        "confidence": p1,
        "margin": margin,
        "distance": dist,
        "latency_ms": int((time.time() - t0) * 1000),
        "reason": reason,
        "top1_label": label1, "top1_prob": p1,
        "top2_label": label2, "top2_prob": p2,
    }


