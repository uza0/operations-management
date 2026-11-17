import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * A printable page, as a PDF file.
 *
 * The installed Android app cannot print: Chrome ignores `window.print()`
 * inside it, and handing the page to the browser lands back in the app. So
 * the server opens the same page in a headless Chrome, with the visitor's own
 * cookies, and saves it with the same print stylesheet the paper version
 * uses. The phone receives an ordinary download.
 *
 * Only the pages that already have a print button can be asked for, and the
 * page itself still decides who may see it: the cookies forwarded are the
 * visitor's, so someone not allowed to open a report gets the login page —
 * which is caught below — not the report.
 */
const PRINTABLE = [
  /^\/(admin|leader)\/events\/[A-Za-z0-9_-]+\/(board\/sheet|reports)$/,
  /^\/admin\/(credits|report)$/,
  /^\/sheet\/[A-Za-z0-9_-]+$/,
];

function safeName(name: string | null): string {
  const cleaned = (name ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 80);
  return `${cleaned || 'ticketzone'}.pdf`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('path') ?? '';
  let target: URL;
  try {
    target = new URL(raw, url.origin);
  } catch {
    return NextResponse.json({ error: 'bad path' }, { status: 400 });
  }
  if (target.origin !== url.origin || !PRINTABLE.some((re) => re.test(target.pathname))) {
    return NextResponse.json({ error: 'not printable' }, { status: 400 });
  }
  // The page would otherwise open its own print dialog inside the headless browser.
  target.searchParams.delete('print');

  const [{ default: chromium }, puppeteer] = await Promise.all([
    import('@sparticuz/chromium'),
    import('puppeteer-core'),
  ]);

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: process.env.CHROME_PATH || (await chromium.executablePath()),
    headless: true,
    defaultViewport: { width: 1000, height: 1400 },
  });

  try {
    const page = await browser.newPage();
    const cookie = request.headers.get('cookie');
    if (cookie) await page.setExtraHTTPHeaders({ cookie });
    await page.emulateMediaType('print');
    const response = await page.goto(target.toString(), { waitUntil: 'networkidle0', timeout: 40_000 });

    // Sent to the login page (or anywhere else): not allowed to see it.
    const landed = new URL(page.url());
    if (!response || !response.ok() || landed.pathname !== target.pathname) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    const filename = safeName(url.searchParams.get('name') ?? (await page.title()));

    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ticketzone.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
      },
    });
  } finally {
    await browser.close();
  }
}
