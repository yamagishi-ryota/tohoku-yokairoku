"""Encode distribution-only copies as WebP; repository image originals stay untouched."""
import base64
import io
import json
import sys
from PIL import Image
result = {}
for file in json.loads(sys.stdin.read()):
    with Image.open(file) as image:
        output = io.BytesIO()
        image.save(output, format='WEBP', quality=92, method=6)
        result[file] = 'data:image/webp;base64,' + base64.b64encode(output.getvalue()).decode('ascii')
json.dump(result, sys.stdout)
