"""Deterministic synthetic invoices for a small, openly reproducible OCR evaluation.

These are generated documents, not customer invoices. An AWS run against the PNGs
measures this tiny synthetic set only; parser unit tests are a separate check.
"""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'evaluation'
OUT.mkdir(parents=True, exist_ok=True)
FONTS = Path('C:/Windows/Fonts')


def font(size, bold=False):
    preferred = FONTS / ('arialbd.ttf' if bold else 'arial.ttf')
    return ImageFont.truetype(str(preferred), size)


cases = [
    {
        'id': '01-clean-pieces', 'variant': 'Clean portrait invoice with a separate unit column',
        'supplier': 'Harbor Example Supply', 'invoiceNumber': 'SYN-001',
        'lines': [
            {'description': 'Drinking Water 1 L', 'billedQty': 12, 'billedUnit': 'piece', 'unitPriceMinor': 10000},
            {'description': 'Oat Biscuits 150 g', 'billedQty': 24, 'billedUnit': 'piece', 'unitPriceMinor': 4000},
            {'description': 'Tea Pouch 100 g', 'billedQty': 8, 'billedUnit': 'piece', 'unitPriceMinor': 12000},
        ],
        'visibleOmissions': [], 'accent': '#1B5D51',
    },
    {
        'id': '02-carton-mixed', 'variant': 'Monochrome invoice with quantity suffix units',
        'supplier': 'Meadow Example Wholesale', 'invoiceNumber': 'SYN-002',
        'lines': [
            {'description': 'Black Tea 100 g', 'billedQty': 2, 'billedUnit': 'carton', 'unitPriceMinor': 120000},
            {'description': 'Hand Soap 75 g', 'billedQty': 3, 'billedUnit': 'box', 'unitPriceMinor': 48000},
            {'description': 'Fruit Juice 1 L', 'billedQty': 6, 'billedUnit': 'piece', 'unitPriceMinor': 9500},
        ],
        'visibleOmissions': ['Pack sizes intentionally absent; no physical receiving counts exist on the invoice.'],
        'accent': '#343434', 'quantitySuffix': True,
    },
    {
        'id': '03-missing-fields', 'variant': 'Invoice with deliberately blank quantity and unit cells',
        'supplier': 'Garden Example Traders', 'invoiceNumber': 'SYN-003',
        'lines': [
            {'description': 'Milk Powder 500 g', 'billedQty': None, 'billedUnit': 'unknown', 'unitPriceMinor': 24000},
            {'description': 'Paper Cups 12 x 50', 'billedQty': 4, 'billedUnit': 'unknown', 'unitPriceMinor': 18000},
        ],
        'visibleOmissions': ['Row 1 has no quantity or billed unit.', 'Row 2 has no billed unit. Product text 12 x 50 is not a billed quantity or confirmed pack size.'],
        'accent': '#96522A',
    },
    {
        'id': '04-indian-money', 'variant': 'Invoice with Indian thousands grouping and paise',
        'supplier': 'Summit Example Distribution', 'invoiceNumber': 'SYN-004',
        'lines': [
            {'description': 'Display Pack A', 'billedQty': 2, 'billedUnit': 'box', 'unitPriceMinor': 1245050},
            {'description': 'Retail Bundle B', 'billedQty': 1, 'billedUnit': 'carton', 'unitPriceMinor': 10500000},
        ],
        'visibleOmissions': ['Pack sizes intentionally absent.'], 'accent': '#354A8C', 'indianGrouping': True,
    },
    {
        'id': '05-simulated-scan', 'variant': 'Generated gray low-contrast scan, 1.3 degree rotation and light blur',
        'supplier': 'River Example Stores', 'invoiceNumber': 'SYN-005',
        'lines': [
            {'description': 'Rice Crackers 100 g', 'billedQty': 18, 'billedUnit': 'piece', 'unitPriceMinor': 5500},
            {'description': 'Cocoa Mix 200 g', 'billedQty': 6, 'billedUnit': 'piece', 'unitPriceMinor': 17550},
            {'description': 'Lemon Drink 500 ml', 'billedQty': 12, 'billedUnit': 'piece', 'unitPriceMinor': 3500},
        ],
        'visibleOmissions': [], 'accent': '#4A4A4A', 'scan': True,
    },
]


def price(value, indian=False):
    rupees, paise = divmod(value, 100)
    digits = str(rupees)
    if indian and len(digits) > 3:
        prefix, last = digits[:-3], digits[-3:]
        parts = []
        while prefix:
            parts.insert(0, prefix[-2:])
            prefix = prefix[:-2]
        digits = ','.join(parts + [last])
    else:
        digits = f'{rupees:,}'
    return f'{digits}.{paise:02d}'


def create(case):
    image = Image.new('RGB', (1400, 1650), '#ffffff')
    draw = ImageDraw.Draw(image)
    ink, muted, accent = '#202B35', '#52616B', case['accent']
    draw.rectangle((0, 0, 1400, 18), fill=accent)
    draw.text((85, 64), case['supplier'], font=font(47, True), fill=accent)
    draw.text((85, 132), 'Synthetic supplier • no real business or customer data', font=font(25), fill=muted)
    draw.text((85, 220), 'INVOICE', font=font(48, True), fill=ink)
    draw.text((870, 223), case['invoiceNumber'], font=font(38, True), fill=ink)
    draw.text((85, 292), 'Bill to: Example Receiving Shop', font=font(29), fill=ink)
    draw.text((870, 292), 'Date: 20 Sep 2026', font=font(29), fill=ink)
    draw.text((85, 345), 'Currency: INR', font=font(29), fill=ink)
    draw.text((870, 345), 'Terms: review on receipt', font=font(26), fill=muted)

    suffix = case.get('quantitySuffix', False)
    columns = [(85, 'Item description'), (640, 'Qty'), (760, 'Unit'), (920, 'Unit price'), (1130, 'Amount')]
    if suffix:
        columns = [(85, 'Item description'), (660, 'Quantity'), (920, 'Unit price'), (1130, 'Amount')]
    y = 456
    draw.rectangle((70, y - 12, 1330, y + 65), fill=accent)
    for x, label in columns:
        draw.text((x, y), label, font=font(28, True), fill='white')
    y += 110
    amounts = []
    for index, row in enumerate(case['lines']):
        if index % 2 == 0:
            draw.rectangle((70, y - 17, 1330, y + 77), fill='#F2F4F5')
        draw.text((85, y), row['description'], font=font(29), fill=ink)
        qty = row['billedQty']
        unit = row['billedUnit']
        unit_text = '' if unit == 'unknown' else unit if qty == 1 else {'box': 'boxes'}.get(unit, unit + 's')
        if suffix:
            draw.text((660, y), f'{qty} {unit_text}' if qty is not None else '', font=font(28), fill=ink)
        else:
            draw.text((640, y), str(qty) if qty is not None else '', font=font(29), fill=ink)
            draw.text((760, y), unit_text, font=font(27), fill=ink)
        draw.text((920, y), price(row['unitPriceMinor'], case.get('indianGrouping')), font=font(28), fill=ink)
        amount = qty * row['unitPriceMinor'] if qty is not None else None
        amounts.append(amount)
        draw.text((1130, y), price(amount, case.get('indianGrouping')) if amount is not None else '', font=font(28), fill=ink)
        draw.line((70, y + 81, 1330, y + 81), fill='#CFD6DB', width=2)
        y += 112
    y += 65
    if all(amount is not None for amount in amounts):
        draw.text((830, y), 'Total INR', font=font(31, True), fill=ink)
        draw.text((1090, y), price(sum(amounts), case.get('indianGrouping')), font=font(31, True), fill=ink)
    else:
        draw.text((85, y), 'Incomplete invoice: missing values require supplier clarification.', font=font(28, True), fill=accent)
    draw.text((85, 1210), 'For receiving verification only.', font=font(30, True), fill=ink)
    draw.text((85, 1262), 'Physical counts, damage, and pack conversion must be confirmed separately.', font=font(26), fill=muted)
    draw.line((85, 1390, 1315, 1390), fill='#CED5D9', width=2)
    draw.text((85, 1433), 'RECEIVERIGHT · SYNTHETIC OCR EVALUATION', font=font(29, True), fill=accent)
    draw.text((85, 1483), case['variant'], font=font(23), fill=muted)
    draw.text((85, 1525), 'No real sale, delivery, payment, or user validation is represented.', font=font(23), fill=muted)
    if case.get('scan'):
        image = ImageEnhance.Contrast(image.convert('L')).enhance(0.65)
        image = image.rotate(1.3, resample=Image.Resampling.BICUBIC, expand=False, fillcolor=235)
        image = image.filter(ImageFilter.GaussianBlur(0.6)).convert('RGB')
    file = f'{case["id"]}.png'
    image.save(OUT / file, optimize=True)
    case['image'] = file


for case in cases:
    create(case)
    for private in ['accent', 'quantitySuffix', 'indianGrouping', 'scan']:
        case.pop(private, None)

manifest = {
    'kind': 'synthetic-ground-truth',
    'version': 1,
    'createdFor': 'ReceiveRight parser and live Amazon Textract evaluation',
    'limitations': [
        'Five generated invoices are a tiny convenience sample, not representative customer accuracy.',
        'No user pilot, real shop invoice, handwriting, multilingual document, or photographed crumpled paper is included.',
        'Null quantity and unknown unit mean the source invoice omits that field; filling it would be an inference.',
        'Line order follows the printed table. Price is integer paise per billed unit, with no tax or discount.',
        'Receiving counts and pack sizes are not ground-truth invoice fields and must remain unconfirmed.',
    ],
    'cases': cases,
}
(OUT / 'expected.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(f'Wrote {len(cases)} synthetic invoices and expected.json in {OUT}')
