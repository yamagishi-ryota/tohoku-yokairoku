"""Existing candidate sheets -> row-major 3x3 crops. No redrawing or retouching."""
import json
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[1]
for card in json.loads((root / 'cards.json').read_text()):
    with Image.open(root / f"sheet_{card['sheet']:02d}_UNVERIFIED.png") as sheet:
        x = (card['sheet_position'] - 1) % 3
        y = (card['sheet_position'] - 1) // 3
        box = (round(x*sheet.width/3), round(y*sheet.height/3),
               round((x+1)*sheet.width/3), round((y+1)*sheet.height/3))
        output = root / card['image']
        output.parent.mkdir(parents=True, exist_ok=True)
        sheet.crop(box).save(output)
print('54 existing card crops saved; source sheets unchanged (UNVERIFIED).')
