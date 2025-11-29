import { Actor, log, Dataset } from 'apify';
import playwright from 'playwright';

await Actor.init();

const input = await Actor.getInput();
const LINKEDIN_EMAIL = input.LINKEDIN_EMAIL || process.env.LINKEDIN_EMAIL;
const LINKEDIN_PASSWORD = input.LINKEDIN_PASSWORD || process.env.LINKEDIN_PASSWORD;
const SEARCH_KEYWORD = input.SEARCH_KEYWORD || 'recruiter netherlands';
const CONNECT_MESSAGE = input.CONNECT_MESSAGE || 'Hi! I would be happy to connect with you.';
const DAILY_LIMIT = input.dailyLimit || 20;

if (!LINKEDIN_EMAIL || !LINKEDIN_PASSWORD) throw new Error('Please provide LINKEDIN_EMAIL and LINKEDIN_PASSWORD!');

log.info("Launching browser...");
const browser = await playwright.chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

// ---------------- LOGIN ------------------
log.info("Going to LinkedIn login...");
await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle' });

await page.fill('input#username', LINKEDIN_EMAIL);
await page.fill('input#password', LINKEDIN_PASSWORD);
await page.click('button[type="submit"]');

await page.waitForTimeout(6000);
log.info("Logged in successfully.");

// ---------------- SEARCH WITH LOCATION ------------------
const geoUrn = '102221843'; // Netherlands
const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(SEARCH_KEYWORD)}&origin=GLOBAL_SEARCH_HEADER&geoUrn=%5B"${geoUrn}"%5D`;
await page.goto(searchUrl, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);

// ---------------- INTERCEPT XHR ------------------
let profiles = new Set();

page.on('response', async (response) => {
    try {
        const url = response.url();
        if (url.includes('voyager/api/search/blended')) {
            const json = await response.json();
            if (json && json.data && json.included) {
                json.included.forEach(item => {
                    if (item.$type === 'com.linkedin.voyager.identity.shared.MiniProfile') {
                        profiles.add(`https://www.linkedin.com/in/${item.publicIdentifier}`);
                    }
                });
            }
        }
    } catch (err) {
        // ignore
    }
});

// Scroll to load XHR results
let prevCount = 0;
for (let i = 0; i < 15; i++) {
    await page.evaluate('window.scrollBy(0, document.body.scrollHeight)');
    await page.waitForTimeout(4000);
    if (profiles.size === prevCount) break;
    prevCount = profiles.size;
}

log.info(`Collected ${profiles.size} recruiter profiles.`);

// ---------------- CONNECT REQUESTS ------------------
let sentCount = 0;
for (const profile of Array.from(profiles)) {
    if (sentCount >= DAILY_LIMIT) break;
    log.info(`Opening profile: ${profile}`);
    await page.goto(profile, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    const connectBtn = await page.$('button:has-text("Connect"), button[aria-label*="Connect"]');
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

    log.info(`Connect request sent to ${profile}`);
    sentCount++;

    await page.waitForTimeout(3000);
    await Dataset.pushData({ profile, status: 'connect_sent' });
}

await browser.close();
log.info(`Done. Total connect requests sent: ${sentCount}`);
await Actor.exit();
