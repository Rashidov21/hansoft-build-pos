import shutil
import socket
from datetime import datetime
from pathlib import Path

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrOwner


def _has_internet(timeout: float = 3.0) -> bool:
    """Best-effort internet reachability check from the *backend* process.

    This is what actually matters for sending Z-reports / WhatsApp, since those
    requests originate from the Python backend (urllib), not the webview.

    We open a raw TCP socket to a couple of highly-available hosts. A TCP
    connect is fast, needs no DNS-over-HTTPS, and is not subject to webview CSP.
    """
    # (host, port) targets: Cloudflare DNS, Google DNS, Telegram API.
    targets = [
        ("1.1.1.1", 443),
        ("8.8.8.8", 443),
        ("api.telegram.org", 443),
    ]
    for host, port in targets:
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except OSError:
            continue
    return False


class ConnectivityView(APIView):
    """Report whether the backend host currently has internet access.

    The frontend calls this over 127.0.0.1 (always allowed by CSP) instead of
    probing external hosts from the webview, which is unreliable in WebView2.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"online": _has_internet()})


class BackupNowView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        from django.conf import settings

        db_path = Path(settings.DATABASES["default"]["NAME"])
        if not db_path.exists():
            return Response({"detail": "Database not found"}, status=404)
        out = Path.home() / "Documents" / "GeeksPOS" / "backups"
        out.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        dest = out / f"backup-{stamp}.sqlite3"
        shutil.copy2(db_path, dest)
        return Response({"ok": True, "backup_path": str(dest)})
