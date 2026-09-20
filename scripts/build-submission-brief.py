"""Build the two-page project brief. Requires reportlab; accepts verified deployment metadata."""
from __future__ import annotations

import argparse
from pathlib import Path
from urllib.parse import urlparse
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
INK = colors.HexColor('#183E34')
MUTED = colors.HexColor('#68756C')
GREEN = colors.HexColor('#1F5C48')
PAPER = colors.HexColor('#FBFBF5')
LINE = colors.HexColor('#DCE3D7')
PALE = colors.HexColor('#EEF2E6')
AMBER = colors.HexColor('#9A6027')
WIDTH, HEIGHT = A4
MARGIN = 42
CONTENT = WIDTH - 2 * MARGIN

for font_name, filename in [('Brief', 'segoeui.ttf'), ('BriefBold', 'segoeuib.ttf')]:
    candidate = Path('C:/Windows/Fonts') / filename
    if candidate.exists():
        pdfmetrics.registerFont(TTFont(font_name, str(candidate)))

BODY = 'Brief' if 'Brief' in pdfmetrics.getRegisteredFontNames() else 'Helvetica'
BOLD = 'BriefBold' if 'BriefBold' in pdfmetrics.getRegisteredFontNames() else 'Helvetica-Bold'
pdfmetrics.registerFontFamily(BODY, normal=BODY, bold=BOLD, italic=BODY, boldItalic=BOLD)


def paragraph(pdf, text, x, top, width, size=10, color=INK, leading=None, bold=False):
    style = ParagraphStyle('brief', fontName=BOLD if bold else BODY, fontSize=size,
                           leading=leading or size * 1.45, textColor=color,
                           alignment=TA_LEFT, spaceBefore=0, spaceAfter=0)
    p = Paragraph(text, style)
    _, height = p.wrap(width, HEIGHT)
    p.drawOn(pdf, x, top - height)
    return top - height


def label(pdf, text, x, y, color=MUTED):
    pdf.setFillColor(color)
    pdf.setFont(BOLD, 8)
    pdf.drawString(x, y, text)


def box(pdf, x, y, width, height, fill=PALE, radius=9, stroke=None):
    pdf.setFillColor(fill)
    if stroke:
        pdf.setStrokeColor(stroke)
    pdf.roundRect(x, y, width, height, radius, fill=1, stroke=1 if stroke else 0)


def footer(pdf, page, live):
    pdf.setStrokeColor(LINE)
    pdf.line(MARGIN, 49, WIDTH - MARGIN, 49)
    label(pdf, 'RECEIVERIGHT  /  FIRST COMMIT 2026', MARGIN, 32)
    status = 'PROJECT BRIEF' if live else 'LIVE DEPLOYMENT URL PENDING'
    pdf.setFont(BODY, 7.5)
    pdf.setFillColor(MUTED)
    pdf.drawRightString(WIDTH - MARGIN, 32, f'{status}   {page} / 2')


def header(pdf, kicker):
    pdf.setFillColor(PAPER)
    pdf.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)
    pdf.setFillColor(GREEN)
    pdf.rect(0, HEIGHT - 9, WIDTH, 9, fill=1, stroke=0)
    label(pdf, kicker, MARGIN, 795, GREEN)


def card(pdf, x, top, width, title, text, number):
    box(pdf, x, top - 90, width, 90)
    label(pdf, number, x + 13, top - 19, GREEN)
    paragraph(pdf, title, x + 13, top - 28, width - 26, 10.2, bold=True)
    paragraph(pdf, text, x + 13, top - 47, width - 26, 8.3, MUTED, leading=11.5)


def build(output: Path, site_url: str, test_count: int, youtube_url: str = ''):
    output.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
    pdf.setTitle('ReceiveRight - Submission Brief')
    pdf.setAuthor('Bro code / ReceiveRight')
    pdf.setSubject('One shared, versioned delivery discrepancy record - First Commit 2026')

    header(pdf, 'BRO CODE  /  FIRST COMMIT 2026  /  SHIP IT')
    paragraph(pdf, 'ReceiveRight', MARGIN, 764, CONTENT, 40, GREEN, leading=46, bold=True)
    paragraph(pdf, 'One shared, versioned delivery record.', MARGIN, 706, CONTENT, 17, INK, leading=22)
    paragraph(pdf,
              'For small shops receiving packaged goods. Bring the invoice, physical counts, '
              'evidence, and supplier reply into a versioned record both sides can review.',
              MARGIN, 669, CONTENT, 11.2, MUTED, leading=16)

    label(pdf, 'ONE COMPLETE WORKFLOW', MARGIN, 611)
    gap = 12
    card_width = (CONTENT - 2 * gap) / 3
    card(pdf, MARGIN, 594, card_width, 'Capture', 'Upload the invoice and record the delivery observations.', '01')
    card(pdf, MARGIN + card_width + gap, 594, card_width, 'Confirm', 'Check counts, price and pack size. Review the visible calculation.', '02')
    card(pdf, MARGIN + 2 * (card_width + gap), 594, card_width, 'Review together', 'Share a protected link. Preserve the response and reviewed version.', '03')

    label(pdf, 'A SMALL EXAMPLE WITH A VERIFIABLE RESULT', MARGIN, 475)
    top = 458
    widths = [156, 139, CONTENT - 295]
    box(pdf, MARGIN, top - 31, CONTENT, 31, GREEN, radius=5)
    x_positions = [MARGIN, MARGIN + widths[0], MARGIN + widths[0] + widths[1]]
    for x, name in zip(x_positions, ['INVOICE LINE', 'RECEIVING OBSERVATION', 'ITEM DISCREPANCY']):
        label(pdf, name, x + 11, top - 20, colors.white)
    rows = [
        ('Water: 12 x INR 100', '10 bottles received', '2 missing = INR 200'),
        ('Biscuits: 24 x INR 40', '24 received; 2 damaged', '2 damaged = INR 80'),
        ('Tea: 1 carton x INR 1,200', '12 individual packets', 'Confirm 12 per carton'),
    ]
    y = top - 31
    for index, row in enumerate(rows):
        if index % 2 == 0:
            pdf.setFillColor(PALE)
            pdf.rect(MARGIN, y - 38, CONTENT, 38, fill=1, stroke=0)
        for x, width, value in zip(x_positions, widths, row):
            paragraph(pdf, escape(value), x + 11, y - 10, width - 20, 8.6, INK, leading=12)
        y -= 38
    box(pdf, MARGIN, 259, CONTENT, 41, GREEN, radius=6)
    label(pdf, 'AFTER HUMAN CONFIRMATION', MARGIN + 14, 282, colors.HexColor('#C8DABF'))
    paragraph(pdf, 'INR 280', WIDTH - MARGIN - 119, 289, 108, 22, colors.white, leading=27, bold=True)
    pdf.setFillColor(colors.white)
    pdf.setFont(BODY, 8)
    pdf.drawString(MARGIN + 14, 268, 'Calculated item value. Tax and discounts excluded.')

    label(pdf, 'WHAT MAKES THE RECORD USEFUL', MARGIN, 232)
    paragraph(pdf, '<b>Before sharing</b><br/>Unknown counts, units and pack sizes stay unresolved. '
              'The receiver confirms the invoice and physical observations.',
              MARGIN, 216, 239, 9.5, INK, leading=14)
    paragraph(pdf, '<b>A response to one version</b><br/>A later edit preserves the old quantities, '
              'evidence references and supplier replies in saved history.',
              MARGIN + 267, 216, CONTENT - 267, 9.5, INK, leading=14)
    paragraph(pdf, '<b>Return to the record</b><br/>A privately saved recovery code restores the '
              'workspace on another browser. Active sessions can be renewed.',
              MARGIN, 143, 239, 9.5, INK, leading=14)
    paragraph(pdf, '<b>A precise outcome</b><br/>The supplier acknowledges or disputes affected items. '
              'Closure records agreement, not a refund or payment.',
              MARGIN + 267, 143, CONTENT - 267, 9.5, INK, leading=14)
    paragraph(pdf, 'Product hypothesis: one shared reference reduces reconstruction across messages. Synthetic demo; a real shop/supplier trial is still pending.',
              MARGIN, 75, CONTENT, 7.7, MUTED, leading=10)
    footer(pdf, 1, bool(site_url))
    pdf.showPage()

    header(pdf, 'IMPLEMENTATION  /  VERIFICATION  /  HANDOFF')
    paragraph(pdf, 'Proof behind<br/>the shared record.', MARGIN, 764, CONTENT, 29, GREEN, leading=34, bold=True)
    paragraph(pdf, 'React + TypeScript interface. Express API. Shared deterministic reconciliation. '
              'Five working AWS integrations. Human-reviewed extraction and retained record history.',
              MARGIN, 675, CONTENT, 10.5, MUTED, leading=15)

    label(pdf, 'CURRENT AWS DEPLOYMENT PATH', MARGIN, 623)
    box(pdf, MARGIN, 566, CONTENT, 40, GREEN, radius=7)
    paragraph(pdf, 'HTTPS  /  API Gateway  /  Lambda: React assets + Express API', MARGIN + 16, 592, CONTENT - 32, 10.3, colors.white, leading=14, bold=True)
    for center in [MARGIN + card_width / 2, MARGIN + card_width + gap + card_width / 2, MARGIN + 2 * (card_width + gap) + card_width / 2]:
        pdf.setStrokeColor(colors.HexColor('#8BA68B'))
        pdf.line(center, 566, center, 551)
    for index, (title, description) in enumerate([
        ('DynamoDB', 'Cases, saved states, recovery and transactional writes'),
        ('Private versioned S3', 'Uploaded evidence tied to a checked object version'),
        ('Amazon Textract', 'Editable invoice suggestions; human review is required'),
    ]):
        x = MARGIN + index * (card_width + gap)
        box(pdf, x, 482, card_width, 69)
        paragraph(pdf, title, x + 12, 537, card_width - 24, 9.4, INK, leading=13, bold=True)
        paragraph(pdf, description, x + 12, 518, card_width - 24, 8.3, MUTED, leading=11.7)
    box(pdf, MARGIN, 416, CONTENT, 52, colors.HexColor('#F6EDDA'))
    paragraph(pdf, '<b>Modeled core cost:</b> USD 10.35 per 1,000 one-page invoices under stated workload '
              'assumptions. Excludes S3 requests, logs, transfer, deployment artifacts, operations and taxes. '
              'This is a core-service subtotal, not total cost of ownership or a spending cap.',
              MARGIN + 12, 457, CONTENT - 24, 8.3, AMBER, leading=11.5)

    label(pdf, 'EVIDENCE THAT CAN BE INSPECTED', MARGIN, 388)
    paragraph(pdf, f'<b>{test_count} automated tests passed.</b> Domain arithmetic, extraction parsing, '
              'API access, recovery and saved history are covered. Frontend and Lambda builds passed. '
              'Software tests do not establish customer impact.',
              MARGIN, 372, CONTENT, 9.4, INK, leading=13.8)
    paragraph(pdf, '<b>Live AWS workflow passed.</b> Recovery and renewal; supplier acknowledgement; '
              'a later edit with historical responses retained; private historical evidence; closure '
              'and exports. PIN access does not independently verify supplier identity.',
              MARGIN, 324, CONTENT, 9.4, INK, leading=13.8)
    paragraph(pdf, '<b>Five-image live OCR evaluation.</b> 12 of 13 printed rows returned. One blank-quantity '
              'row was omitted; two units stayed unknown. The UI requires review against the whole invoice. '
              'This tiny synthetic set is not representative accuracy; failures are published.',
              MARGIN, 276, CONTENT, 9.4, INK, leading=13.8)

    label(pdf, 'OPEN THE PROJECT', MARGIN, 213)
    repo = 'https://github.com/Induj1/receiverright'
    paragraph(pdf, f'<b>Repository</b>  <link href="{repo}" color="#1F5C48">{repo}</link>',
              MARGIN, 197, CONTENT, 9.2, INK, leading=14)
    if site_url:
        paragraph(pdf, f'<b>Live app</b>  <link href="{escape(site_url)}" color="#1F5C48">{escape(site_url)}</link>',
                  MARGIN, 175, CONTENT, 9.2, INK, leading=14)
    else:
        paragraph(pdf, '<b>Live app</b>  Deployment verification pending. Add the verified public HTTPS URL.',
                  MARGIN, 175, CONTENT, 9.2, AMBER, leading=14)
    paragraph(pdf, f'<b>Evidence</b>  <link href="{repo}/blob/main/docs/INVOICE-EVALUATION.md" color="#1F5C48">Invoice evaluation</link>'
              f'  /  <link href="{repo}/blob/main/docs/OPERATING-COST.md" color="#1F5C48">Cost assumptions</link>'
              f'  /  <link href="{repo}/blob/main/docs/VERIFICATION.md" color="#1F5C48">Verification record</link>',
              MARGIN, 152, CONTENT, 9.2, INK, leading=14)
    video_status = (f'<link href="{escape(youtube_url)}" color="#1F5C48">Watch on YouTube</link>.'
                    if youtube_url else 'YouTube upload pending.')
    paragraph(pdf, '<b>Bro code</b>  Harshita Nagesh (team lead), Induj Gupta, Rayyan Shaikh, Laavanya Gupta.<br/>'
              '<b>Demo</b>  2:46 edited browser interactions; narration holds disclosed. ' + video_status,
              MARGIN, 127, CONTENT, 8.5, MUTED, leading=12.5)
    paragraph(pdf, 'OpenAI Codex substantially assisted implementation, tests, interface work, documentation and review. '
              'All demo data is synthetic. Summaries use templates; optional Bedrock is disabled.',
              MARGIN, 84, CONTENT, 7.7, MUTED, leading=10.5)
    footer(pdf, 2, bool(site_url))
    pdf.save()
    print(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--site-url', default='', help='Verified public HTTPS deployment URL')
    parser.add_argument('--test-count', type=int, default=103)
    parser.add_argument('--youtube-url', default='', help='Verified published or unlisted YouTube demo URL; omit while upload is pending')
    parser.add_argument('--output', type=Path, default=ROOT / 'output/pdf/ReceiveRight-Submission-Brief.pdf')
    args = parser.parse_args()
    if args.site_url and not args.site_url.startswith('https://'):
        parser.error('--site-url must be a verified HTTPS URL')
    if args.youtube_url:
        video_url = urlparse(args.youtube_url)
        if video_url.scheme != 'https' or video_url.hostname not in {'youtube.com', 'www.youtube.com', 'youtu.be'}:
            parser.error('--youtube-url must be a verified HTTPS YouTube URL')
    build(args.output, args.site_url, args.test_count, args.youtube_url)
