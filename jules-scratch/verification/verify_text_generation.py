import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Store console errors in a list
        errors = []
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)

        try:
            # 1. Go to the app
            await page.goto("http://127.0.0.1:5000")

            # 2. Log in as professor
            await page.get_by_role("button", name="Vstoupit jako Profesor").click()

            # 3. Wait for dashboard and click "Nová lekce"
            await expect(page.get_by_role("heading", name="Knihovna lekcí")).to_be_visible(timeout=10000)
            await page.get_by_role("button", name="+ Nová lekce").click()

            # 4. Wait for editor and navigate to the text generation view
            await expect(page.get_by_role("heading", name="Vytvořit novou lekci")).to_be_visible(timeout=10000)
            await page.get_by_role("link", name="✍️ Text pro studenty").click()

            # 5. Fill prompt and generate text
            await expect(page.get_by_role("heading", name="Text pro studenty")).to_be_visible()
            await page.get_by_placeholder("Např. 'Vytvoř poutavý úvodní text o principech kvantové mechaniky pro úplné začátečníky. Zmiň Schrödingera, Heisenberga a princip superpozice.'").fill("Napiš krátký odstavec o historii kvantové fyziky.")
            await page.get_by_role("button", name="✨ Generovat text").click()

            # 6. Wait for the result and check for errors
            generation_output = page.locator("#generation-output")
            # Wait for the "Generuji..." message to disappear and the final content to be present.
            # We check for text that is NOT the loading or error message.
            await expect(generation_output.get_by_text("AI Sensei přemýšlí")).to_be_hidden(timeout=30000)

            # Check for the error message in the console logs
            has_500_error = any("500" in error for error in errors)
            if has_500_error:
                raise Exception("A 500 Internal Server Error was found in the console.")

            # Check that the output container has some generated text.
            await expect(generation_output).not_to_contain_text("Došlo k chybě")
            await expect(generation_output).not_to_be_empty()


            # 7. Take a screenshot
            await page.screenshot(path="jules-scratch/verification/text_generation_success.png")
            print("Successfully generated text and took a screenshot.")

        except Exception as e:
            print(f"An error occurred during verification: {e}")
            await page.screenshot(path="jules-scratch/verification/text_generation_error.png")
        finally:
            await browser.close()
            # Print all console messages for debugging if something went wrong
            if errors:
                print("\n--- Console Messages ---")
                for msg in errors:
                    print(msg)
                print("----------------------\n")


if __name__ == "__main__":
    asyncio.run(main())