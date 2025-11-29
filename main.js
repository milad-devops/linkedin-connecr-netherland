import { Actor, log, Dataset } from 'apify';
import playwright from 'playwright';
import { ApifyClient } from 'apify';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

await Actor.init();

const input = await Actor.getInput();
const { LINKEDIN_EMAIL, LINKEDIN_PASSWORD, SEARCH_KEYWORD, CONNECT_MESSAGE, dailyLimit } = input;

if (!LINKEDIN_EMAIL || !LINKEDIN_PASSWORD) throw new Error('Email or password missing!');

// --- 1️⃣ Run official LinkedIn Profile Scraper ---
log.info('Running official LinkedIn Profile Scraper...');
const run = await client.acts.startActorRun('apify/linkedin-profile-scraper', {
    body: {
        searchStrings: [SEARCH_KEYWORD],
        maxProfiles: 50,
        resultsType: 'RECENT',
        useChrome: true
    }
});

// --- Wait for the scraper to finish ---
const { defaultDatasetId } = await client.acts.getRun(run.id);
const { items: profiles } = await client.datasets.getItems(defaultDatasetId, { clean: true });

log.info(`Scraper collected ${profiles.length} profiles.`);

// --- 2️⃣ Launch Playwright to send Connect Request ---
const browser = await playwright.chromium.launch({ headless: false, slowMo: 1000 });
const context = await browser.newContext();
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

// Login
log.info('Logging into LinkedIn...');
await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle' });
await page.fill('input#username', LINKEDIN_EMAIL);
await page.fill('input#password', LINKEDIN_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForTimeout(6000);

// Send Connect Request
let sentCount = 0;
for (const profile of profiles.slice(0, dailyLimit)) {
    log.info(`Opening profile: ${profile.publicProfileUrl}`);
    await page.goto(profile.publicProfileUrl, { waitUntil: 'networkidle' });
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
    await Dataset.pushData({ profile: profile.publicProfileUrl, status: 'connect_sent' });
    await page.waitForTimeout(3000);
}

log.info(`Done. Total connect requests sent: ${sentCount}`);
await browser.close();
await Actor.exit();
