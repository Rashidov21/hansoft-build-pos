"""DEPRECATED — fashion demo seed.

Use honey seed instead:

    python clear_and_seed_honey.py
"""

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "DEPRECATED: redirects to honey seed. Use clear_and_seed_honey.py"

    def handle(self, *args, **options):
        self.stdout.write(
            self.style.WARNING(
                "seed_demo is deprecated (fashion catalog). "
                "Run: python clear_and_seed_honey.py"
            )
        )
