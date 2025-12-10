# authentication/voice_utils.py
import numpy as np
import librosa
import soundfile as sf
from pathlib import Path
from django.conf import settings
import time
import io

# Configuración de audio
SAMPLE_RATE = 22050
MIN_DURATION = 1.0  # Duración mínima en segundos
MAX_DURATION = 5.0  # Duración máxima en segundos


def ensure_dir(path: Path):
    """Asegura que un directorio exista"""
    path.mkdir(parents=True, exist_ok=True)


def read_audio_from_bytes(audio_bytes: bytes, sample_rate: int = None):
    """
    Lee bytes de audio y devuelve (audio_data, sample_rate).
    Soporta WAV, MP3, FLAC, OGG.
    """
    if sample_rate is None:
        sample_rate = SAMPLE_RATE
    
    try:
        # Intentar leer con librosa (soporta múltiples formatos)
        audio_data, sr = librosa.load(
            io.BytesIO(audio_bytes),
            sr=sample_rate,
            mono=True,
            duration=MAX_DURATION
        )
        return audio_data, sr
    except Exception as e:
        # Si librosa falla, intentar con soundfile
        try:
            audio_data, sr = sf.read(io.BytesIO(audio_bytes))
            if len(audio_data.shape) > 1:
                # Convertir a mono si es estéreo
                audio_data = np.mean(audio_data, axis=1)
            if sr != sample_rate:
                audio_data = librosa.resample(audio_data, orig_sr=sr, target_sr=sample_rate)
            return audio_data, sample_rate
        except Exception as e2:
            raise ValueError(f"No se pudo leer el audio: {e2}")


def normalize_audio_duration(audio_data: np.ndarray, sample_rate: int = SAMPLE_RATE):
    """
    Normaliza la duración del audio:
    - Si es muy corto, rellena con silencio
    - Si es muy largo, trunca
    """
    min_samples = int(MIN_DURATION * sample_rate)
    max_samples = int(MAX_DURATION * sample_rate)
    
    # Rellenar si es muy corto
    if len(audio_data) < min_samples:
        padding = min_samples - len(audio_data)
        audio_data = np.pad(audio_data, (0, padding), mode='constant')
    
    # Truncar si es muy largo
    if len(audio_data) > max_samples:
        audio_data = audio_data[:max_samples]
    
    return audio_data


def preprocess_audio(audio_data: np.ndarray, sample_rate: int = SAMPLE_RATE):
    """
    Preprocesa audio: normaliza duración y remuestrea si es necesario.
    """
    # Remuestrear si es necesario
    if sample_rate != SAMPLE_RATE:
        audio_data = librosa.resample(audio_data, orig_sr=sample_rate, target_sr=SAMPLE_RATE)
    
    # Normalizar duración
    audio_data = normalize_audio_duration(audio_data, SAMPLE_RATE)
    
    # Normalizar amplitud (opcional, para evitar clipping)
    max_val = np.abs(audio_data).max()
    if max_val > 0:
        audio_data = audio_data / max_val * 0.95
    
    return audio_data


def save_voice_sample(username: str, audio_data: np.ndarray, sample_rate: int = SAMPLE_RATE):
    """
    Guarda una muestra de voz en formato WAV.
    """
    from django.conf import settings
    
    # Crear directorio del usuario si no existe
    voice_dir = settings.PROCESSED_VOICE_DIR / username
    ensure_dir(voice_dir)
    
    # Generar nombre de archivo único
    ts = int(time.time() * 1000)
    path = voice_dir / f"{username}_{ts}.wav"
    
    # Guardar como WAV
    sf.write(str(path), audio_data, sample_rate)
    
    return path


def validate_audio(audio_data: np.ndarray, sample_rate: int = SAMPLE_RATE):
    """
    Valida que el audio tenga características mínimas para procesamiento.
    Retorna (is_valid, error_message)
    """
    if len(audio_data) == 0:
        return False, "Audio vacío"
    
    # Verificar duración mínima
    duration = len(audio_data) / sample_rate
    if duration < MIN_DURATION:
        return False, f"Audio muy corto ({duration:.2f}s < {MIN_DURATION}s)"
    
    # Verificar que no sea solo silencio
    rms = np.sqrt(np.mean(audio_data**2))
    if rms < 0.01:  # Umbral de silencio
        return False, "Audio demasiado silencioso"
    
    return True, None

