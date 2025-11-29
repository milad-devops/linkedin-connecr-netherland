import { Actor, log, Dataset } from 'apify';
import playwright from 'playwright';

await Actor.init();

const input = await Actor.getInput();
const { LINKEDIN_EMAIL, LINKEDIN_PASSWORD, SEARCH_KEYWORD, CONNECT_MESSAGE, dailyLimit } = input;

if (!LINKEDIN_EMAIL || !LINKEDIN_PASSWORD) {
    throw new Error('Please provide LINKEDIN_EMAIL and LINKEDIN_PASSWORD in input!');
}

log.info('Launching real browser...');
const browser = await playwright.chromium.launch({ headless: false, slowMo: 1000 });
const context = await browser.newContext();
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

// 1️⃣ Login
log.info('Going to LinkedIn login...');
await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle' });
await page.fill('input#username', LINKEDIN_EMAIL);
await page.fill('input#password', LINKEDIN_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForTimeout(6000);
log.info('Logged in successfully.');

// 2️⃣ Search recruiters
log.info(`Searching for: ${SEARCH_KEYWORD}`);
const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(SEARCH_KEYWORD)}&network=%5B"S"%5D&origin=SWITCH_SEARCH_VERTICAL`;
await page.goto(searchUrl, { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

// 3️⃣ Collect recruiter profile URLs
const profiles = await page.$$eval('a.app-aware-link', links =>
    links
        .map(a => a.href)
        .filter(href => href.includes('/in/'))
);
log.info(`Found ${profiles.length} profiles.`);

// 4️⃣ Send Connect Requests
let sentCount = 0;
for (const profileUrl of profiles.slice(0, dailyLimit || 10)) {
    log.info(`Opening profile: ${profileUrl}`);
    await page.goto(profileUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    const connectBtn = await page.$('button:has-text("Connect")');
    if (!connectBtn) {
        log.info('Connect button not found, skipping...');
        continue;
    }

    await connectBtn.click();
    await page.waitForTimeout(2000);

    const addNoteBtn = await page.$('button:has-text("Add a note")');
    if (addNoteBtn) {
        await addNoteBtn.click();
        await page.waitForTimeout(1000);
        await page.fill('textarea[name="message"]', CONNECT_MESSAGE || 'Hi! I would be happy to connect.');
        await page.click('button:has-text("Send")');
    } else {
        await page.click('button:has-text("Send")');
    }

    sentCount++;
    await Dataset.pushData({ profile: profileUrl, status: 'connect_sent' });
    await page.waitForTimeout(3000);
}

log.info(`Done. Total connect requests sent: ${sentCount}`);
await browser.close();
await Actor.exit();
