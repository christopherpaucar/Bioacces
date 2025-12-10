# authentication/voice_ml.py
import glob
import time
import joblib
import numpy as np
import librosa
import soundfile as sf
from pathlib import Path
from sklearn.decomposition import PCA
from sklearn.svm import SVC
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split

# === Rutas
BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
PROC_VOICE_DIR = DATA_DIR / "processed_voices"
MODELS_DIR = DATA_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

VOICE_PCA_PATH = MODELS_DIR / "voice_pca.joblib"
VOICE_SVM_PATH = MODELS_DIR / "voice_svm.joblib"
VOICE_LBL_PATH = MODELS_DIR / "voice_label_encoder.joblib"
VOICE_CENTS_PATH = MODELS_DIR / "voice_class_centroids.joblib"

# === Hiperparámetros y umbrales de rechazo
SAMPLE_RATE = 22050  # Hz
N_MFCC = 13  # Número de coeficientes MFCC
N_FFT = 2048
HOP_LENGTH = 512
PCA_KEEP = 0.95
SVM_KERNEL = "rbf"
SVM_C = 10.0
SVM_GAMMA = "scale"

import os
# Umbrales configurables por ENV
THRESH_PROBA = float(os.getenv("VOICE_THRESH_PROBA", "0.60"))
THRESH_MARGIN = float(os.getenv("VOICE_THRESH_MARGIN", "0.08"))
THRESH_DIST = float(os.getenv("VOICE_THRESH_DIST", "2.60"))

PROBA_OVERRIDE_ACCEPT = 0.80

# ---------------- Utilidades ----------------


def extract_mfcc_features(audio_path: str) -> np.ndarray:
    """
    Extrae características MFCC de un archivo de audio.
    Devuelve un vector de características promediado.
    """
    try:
        # Cargar audio y normalizar a mono
        y, sr = librosa.load(audio_path, sr=SAMPLE_RATE, mono=True)
        
        # Asegurar duración mínima (rellenar con silencio si es muy corto)
        min_duration = 1.0  # 1 segundo mínimo
        if len(y) < int(min_duration * SAMPLE_RATE):
            padding = int(min_duration * SAMPLE_RATE) - len(y)
            y = np.pad(y, (0, padding), mode='constant')
        
        # Extraer MFCC
        mfccs = librosa.feature.mfcc(
            y=y,
            sr=sr,
            n_mfcc=N_MFCC,
            n_fft=N_FFT,
            hop_length=HOP_LENGTH
        )
        
        # Promediar sobre el tiempo para obtener un vector fijo
        mfcc_mean = np.mean(mfccs, axis=1)
        
        # Normalizar
        norm = np.linalg.norm(mfcc_mean)
        if norm > 0:
            mfcc_mean = mfcc_mean / norm
        
        return mfcc_mean.astype("float32")
    except Exception as e:
        raise ValueError(f"Error extrayendo MFCC de {audio_path}: {e}")


def _load_dataset():
    """Carga el dataset de voces desde data/processed_voices/"""
    X, y = [], []
    class_dirs = [d for d in PROC_VOICE_DIR.glob("*") if d.is_dir()]
    if not class_dirs:
        raise RuntimeError("No hay clases en data/processed_voices")
    
    for d in class_dirs:
        label = d.name
        # Buscar archivos de audio comunes
        audio_files = (
            list(d.glob("*.wav")) +
            list(d.glob("*.mp3")) +
            list(d.glob("*.flac")) +
            list(d.glob("*.ogg"))
        )
        
        for f in audio_files:
            try:
                features = extract_mfcc_features(str(f))
                X.append(features)
                y.append(label)
            except Exception as e:
                print(f"Error procesando {f}: {e}")
                continue
    
    X = np.array(X, dtype="float32")
    y = np.array(y)
    
    if len(np.unique(y)) < 2:
        raise RuntimeError("Se necesitan al menos 2 clases para entrenar.")
    
    return X, y


def _class_centroids(pca_feats: np.ndarray, labels: np.ndarray):
    """Calcula los centroides de cada clase en el espacio PCA"""
    cents = {}
    for cls in np.unique(labels):
        cents[int(cls)] = pca_feats[labels == cls].mean(axis=0)
    return cents


# ---------------- Entrenamiento ----------------


def train_voice_models():
    """Entrena PCA + SVM con el dataset de voces"""
    t0 = time.time()
    X, y = _load_dataset()
    le = LabelEncoder()
    y_enc = le.fit_transform(y)

    # Split para validación
    Xtr, Xte, ytr, yte = train_test_split(
        X, y_enc, test_size=0.2, stratify=y_enc, random_state=42
    )

    # Entrenar PCA
    pca = PCA(
        n_components=PCA_KEEP,
        svd_solver="full",
        whiten=True,
        random_state=42
    )
    Ztr = pca.fit_transform(Xtr)

    # Entrenar SVM
    svm = SVC(
        kernel=SVM_KERNEL,
        C=SVM_C,
        gamma=SVM_GAMMA,
        probability=True,
        class_weight="balanced",
        random_state=42,
    )
    svm.fit(Ztr, ytr)

    # Re-entrenar con TODO el dataset
    pca_full = PCA(
        n_components=PCA_KEEP,
        svd_solver="full",
        whiten=True,
        random_state=42
    )
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

    # Guardar modelos
    joblib.dump(pca_full, VOICE_PCA_PATH)
    joblib.dump(svm_full, VOICE_SVM_PATH)
    joblib.dump(le, VOICE_LBL_PATH)
    joblib.dump(cents, VOICE_CENTS_PATH)

    return {
        "success": True,
        "classes": le.classes_.tolist(),
        "seconds": round(time.time() - t0, 2),
    }


# ---------------- Predicción con rechazo ----------------


def predict_voice_identity(audio_data: np.ndarray, sample_rate: int = None):
    """
    Predice la identidad de una muestra de voz.
    
    Args:
        audio_data: Array numpy con datos de audio (mono)
        sample_rate: Sample rate del audio (si None, usa SAMPLE_RATE)
    
    Returns:
        Dict con resultado de la predicción
    """
    t0 = time.time()
    
    if not (VOICE_PCA_PATH.exists() and VOICE_SVM_PATH.exists() and VOICE_LBL_PATH.exists()):
        return {"success": False, "accepted": False, "reason": "Modelo no entrenado."}

    pca = joblib.load(VOICE_PCA_PATH)
    svm = joblib.load(VOICE_SVM_PATH)
    le = joblib.load(VOICE_LBL_PATH)
    cents = joblib.load(VOICE_CENTS_PATH)

    # Procesar audio
    if sample_rate is None:
        sample_rate = SAMPLE_RATE
    
    # Resamplear si es necesario
    if sample_rate != SAMPLE_RATE:
        audio_data = librosa.resample(audio_data, orig_sr=sample_rate, target_sr=SAMPLE_RATE)
    
    # Asegurar duración mínima
    min_duration = 1.0
    if len(audio_data) < int(min_duration * SAMPLE_RATE):
        padding = int(min_duration * SAMPLE_RATE) - len(audio_data)
        audio_data = np.pad(audio_data, (0, padding), mode='constant')
    
    # Extraer MFCC
    mfccs = librosa.feature.mfcc(
        y=audio_data,
        sr=SAMPLE_RATE,
        n_mfcc=N_MFCC,
        n_fft=N_FFT,
        hop_length=HOP_LENGTH
    )
    
    # Promediar sobre el tiempo
    mfcc_mean = np.mean(mfccs, axis=1)
    
    # Normalizar
    norm = np.linalg.norm(mfcc_mean)
    if norm > 0:
        mfcc_mean = mfcc_mean / norm
    
    # Transformar con PCA
    z = pca.transform(mfcc_mean.reshape(1, -1))
    
    # Predecir
    proba = svm.predict_proba(z)[0]
    order = np.argsort(proba)[::-1]
    k1, k2 = order[0], (order[1] if len(order) > 1 else order[0])
    p1, p2 = float(proba[k1]), float(proba[k2])
    label1 = le.inverse_transform([k1])[0]
    label2 = le.inverse_transform([k2])[0]
    margin = p1 - p2

    center = cents[int(k1)]
    dist = float(np.linalg.norm(z[0] - center))

    # Política de aceptación/denegación
    accepted = True
    reason = None
    
    if p1 >= PROBA_OVERRIDE_ACCEPT:
        accepted = True
        reason = None
    else:
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
        "top1_label": label1,
        "top1_prob": p1,
        "top2_label": label2,
        "top2_prob": p2,
    }

