# authentication/urls.py
from django.urls import path
from .views import (
    index,
    admin_panel,
    api_register_user,
    api_capture_face,
    api_retrain,
    verify_face,
    api_capture_voice,
    api_retrain_voice,
    verify_voice,
    verify_both,
)

urlpatterns = [
    # Vistas
    path("", index, name="index"),
    path("admin-panel/", admin_panel, name="admin_panel"),

    # API Admin
    path("api/register-user/", api_register_user, name="api_register_user"),
    path("api/capture-face/", api_capture_face, name="api_capture_face"),
    path("api/retrain/", api_retrain, name="api_retrain"),

    # API Usuario (verificación)
    path("api/verify/", verify_face, name="verify_face"),

    # (Opcional) alias para compatibilidad con versiones anteriores
    path("api/verify-face/", verify_face, name="api_verify_face"),

    # API Voz - Admin
    path("api/capture-voice/", api_capture_voice, name="api_capture_voice"),
    path("api/retrain-voice/", api_retrain_voice, name="api_retrain_voice"),

    # API Voz - Usuario (verificación)
    path("api/verify-voice/", verify_voice, name="verify_voice"),

    # API Combinada - Usuario (verificación rostro + voz)
    path("api/verify-both/", verify_both, name="verify_both"),
]
