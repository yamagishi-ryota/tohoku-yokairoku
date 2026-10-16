"""Existing candidate sheets -> row-major 3x3 crops. No redrawing or retouching."""
import json
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[1]
# Sheet 6 has a white right/bottom margin and a slightly uneven 3x3 layout.
# These bounds follow its existing card frames, not the entire PNG canvas.
sheet_6_columns = [(0, 322), (326, 646), (649, 976)]
sheet_6_rows = [(0, 466), (469, 928), (930, 1384)]
for card in json.loads((root / 'cards.json').read_text()):
    with Image.open(root / f"sheet_{card['sheet']:02d}_UNVERIFIED.png") as sheet:
        x = (card['sheet_position'] - 1) % 3
        y = (card['sheet_position'] - 1) // 3
        if card['sheet'] == 6:
            if sheet.size != (1024, 1536):
                raise ValueError('Sheet 6 dimensions changed; review card frame bounds before cropping.')
            left, right = sheet_6_columns[x]
            top, bottom = sheet_6_rows[y]
            box = (left, top, right, bottom)
        else:
            box = (round(x*sheet.width/3), round(y*sheet.height/3),
                   round((x+1)*sheet.width/3), round((y+1)*sheet.height/3))
        output = root / card['image']
        output.parent.mkdir(parents=True, exist_ok=True)
        sheet.crop(box).save(output)
print('54 existing card crops saved; source sheets unchanged (UNVERIFIED).')
