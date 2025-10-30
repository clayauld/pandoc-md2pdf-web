from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    page.goto("http://localhost:8080")
    page.set_input_files('input[type="file"]', ['jules-scratch/verification/test.md'])
    page.click('button[type="submit"]')
    page.wait_for_selector('#results a')
    page.screenshot(path="jules-scratch/verification/verification.png")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
