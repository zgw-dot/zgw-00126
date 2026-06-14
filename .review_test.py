import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Test 2: Student grades
        print("=== Test 2: Student Grades Page ===")
        await page.goto("http://localhost:5173")
        await page.wait_for_timeout(1000)
        # Check if already logged in as admin, go to login if yes
        current_url = page.url
        if "login" not in current_url:
            await page.goto("http://localhost:5173/login")
            await page.wait_for_timeout(1000)
        # Click role buttons by their position (second button = student)
        role_btns = await page.locator(".flex.border-b button").all()
        if len(role_btns) >= 3:
            await role_btns[0].click()  # student
            await page.wait_for_timeout(500)
        await page.get_by_placeholder("\u8BF7\u8F93\u5165\u7528\u6237\u540D").fill("student1")
        await page.get_by_placeholder("\u8BF7\u8F93\u5165\u5BC6\u7801").fill("student123")
        await page.click("button[type='submit']")
        await page.wait_for_url("**/student/dashboard", timeout=10000)
        print("  Student login succeeded")

        await page.goto("http://localhost:5173/student/grades")
        await page.wait_for_timeout(2000)
        gh1 = await page.locator("h1").text_content()
        print(f"  H1: {gh1}")

        # Test 3: Route guard
        print("\n=== Test 3: Student route guard ===")
        await page.goto("http://localhost:5173/admin/statistics")
        await page.wait_for_timeout(2000)
        url = page.url
        print(f"  URL: {url}")
        print(f"  Redirected: {'student/dashboard' in url}")

        await browser.close()
        print("\n=== Done ===")

asyncio.run(main())
