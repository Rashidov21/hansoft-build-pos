from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"

    def ready(self):
        from . import signals  # noqa: F401
        from django.db.models.signals import post_migrate
        from .bootstrap import ensure_default_users_and_pins

        post_migrate.connect(
            lambda **kwargs: ensure_default_users_and_pins(),
            dispatch_uid="accounts.ensure_default_users_and_pins",
        )
