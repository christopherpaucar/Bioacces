# authentication/urls.py
from django.urls import path
from .views import (
    index,
    admin_panel,
    api_register_user,
    api_capture_face,
    api_retrain,
    verify_face,
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
]
