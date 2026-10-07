import os
import sys

sys.path.insert(0, "c:/Users/saidj/Documents/GitHub/geeks_pos/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from catalog.views import ProductCategoryListCreate
from rest_framework.test import APIRequestFactory, force_authenticate
from django.contrib.auth import get_user_model
User = get_user_model()

factory = APIRequestFactory()
user = User.objects.first()

request = factory.get('/api/catalog/product-categories/')
force_authenticate(request, user=user)
view = ProductCategoryListCreate.as_view()
response = view(request)
print("Product categories response data type:", type(response.data))
if isinstance(response.data, list):
    print("Is list")
elif isinstance(response.data, dict) and 'results' in response.data:
    print("Is paginated dictionary")
else:
    print("Unknown type")

from catalog.views import CategoryListCreate
request2 = factory.get('/api/catalog/categories/')
force_authenticate(request2, user=user)
view2 = CategoryListCreate.as_view()
response2 = view2(request2)
print("Categories response data type:", type(response2.data))
if isinstance(response2.data, list):
    print("Is list")
elif isinstance(response2.data, dict) and 'results' in response2.data:
    print("Is paginated dictionary")
else:
    print("Unknown type")
