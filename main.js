import { Actor, log, Dataset } from 'apify';
import playwright from 'playwright';

await Actor.init();

const input = await Actor.getInput();
const LINKEDIN_EMAIL = input.LINKEDIN_EMAIL;
const LINKEDIN_PASSWORD = input.LINKEDIN_PASSWORD;
const SEARCH_KEYWORD = input.SEARCH_KEYWORD || 'recruiter netherlands';
const CONNECT_MESSAGE = input.CONNECT_MESSAGE || 'Hi! I would be happy to connect with you.';
const DAILY_LIMIT = input.dailyLimit || 10;

if (!LINKEDIN_EMAIL || !LINKEDIN_PASSWORD) throw new Error('Email or password missing!');

log.info('Launching browser in real mode...');
const browser = await playwright.chromium.launch({
    headless: false,       // مهم: non-headless
    slowMo: 1000           // optional: حرکت‌ها را کمی کندتر ببینی
});
const context = await browser.newContext();
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

// --- لاگین ---
log.info('Going to LinkedIn login...');
await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle' });
await page.fill('input#username', LINKEDIN_EMAIL);
await page.fill('input#password', LINKEDIN_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForTimeout(6000);
log.info('Logged in successfully.');

// --- جستجوی recruiter هلندی ---
const geoUrn = '102221843'; // Netherlands
const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(SEARCH_KEYWORD)}&origin=GLOBAL_SEARCH_HEADER&geoUrn=%5B"${geoUrn}"%5D`;
await page.goto(searchUrl, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);

// --- scroll تا انتها برای load تمام نتایج ---
let previousHeight;
for (let i = 0; i < 20; i++) {
    previousHeight = await page.evaluate('document.body.scrollHeight');
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await page.waitForTimeout(4000);
    const newHeight = await page.evaluate('document.body.scrollHeight');
    if (newHeight === previousHeight) break;
}

// --- جمع‌آوری پروفایل‌ها ---
const profiles = await page.$$eval('a.search-result__result-link', links =>
    [...new Set(links.map(l => l.href.split("?")[0]))]
);
log.info(`Collected ${profiles.length} profiles.`);

// --- ارسال connect request ---
let sentCount = 0;
for (const profile of profiles.slice(0, DAILY_LIMIT)) {
    log.info(`Opening profile: ${profile}`);
    await page.goto(profile, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    const connectBtn = await page.$('button:has-text("Connect")');
    if (!connectBtn) continue;

    await connectBtn.click();
    await page.waitForTimeout(2000);

    const addNoteBtn = await page.$('button:has-text("Add a note")');
    if (addNoteBtn) {
        await addNoteBtn.click();
        await page.waitForTimeout(1000);
        await page.fill('textarea[name="message"]', CONNECT_MESSAGE);
        await page.click('button:has-text("Send")');
    } else {
        await page.click('button:has-text("Send")');
    }

    sentCount++;
    await Dataset.pushData({ profile, status: 'connect_sent' });
    await page.waitForTimeout(3000);
}

log.info(`Done. Total connect requests sent: ${sentCount}`);
await browser.close();
await Actor.exit();
