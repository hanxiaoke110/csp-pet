"""Real-size visual and lifecycle acceptance using disposable preview storage."""
import json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    page = browser.new_page(viewport={"width": 1400, "height": 1200})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto("http://127.0.0.1:4187/design/partner-upgrade/accessory-preview.html")
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="装载临时样例（2000 金币 / 两位卡皮）").click()
    page.wait_for_selector(".accessory-gallery-grid article")
    gallery = page.locator(".accessory-size-gallery")
    gallery.scroll_into_view_if_needed()
    checks = []
    for size in [110, 140, 170]:
        page.get_by_label("桌宠尺寸", exact=True).select_option(str(size))
        for dark in [True, False]:
            page.get_by_label("深色桌面", exact=True).set_checked(dark)
            page.get_by_label("模拟位置移动", exact=True).check()
            page.wait_for_timeout(650)
            assert gallery.locator(".partner-accessory-trail > g").count() > 0
            assert gallery.locator(".back .partner-accessory-orbit > g").count() > 0
            assert gallery.locator(".front .partner-accessory-orbit > g").count() > 0
            # The ring spans the actor, not a thumbnail at its feet.
            halo = gallery.locator(".partner-accessory-depth.front .partner-accessory-halo").first
            assert halo.bounding_box()["width"] > size * .75
            assert gallery.locator(".partner-accessory-layers").evaluate_all("xs=>xs.every(x=>getComputedStyle(x).pointerEvents==='none')")
            gallery.screenshot(path=f"/tmp/accessories-{size}-{'dark' if dark else 'light'}.png")
            checks.append({"size": size, "dark": dark, "trailParticles": gallery.locator(".partner-accessory-trail > g").count()})
            page.get_by_label("模拟位置移动", exact=True).uncheck()
            page.wait_for_timeout(1300)
            assert gallery.locator(".partner-accessory-trail").count() == 0
    page.get_by_label("模拟位置移动", exact=True).check()
    page.wait_for_timeout(650)
    page.get_by_label("睡眠", exact=True).check()
    assert gallery.locator(".partner-accessory-trail, .partner-accessory-orbit").count() == 0
    page.get_by_label("睡眠", exact=True).uncheck()
    page.emulate_media(reduced_motion="reduce")
    page.wait_for_timeout(100)
    assert gallery.locator(".partner-accessory-trail").count() == 0
    before = gallery.locator(".partner-accessory-orbit").first.inner_html()
    page.wait_for_timeout(300)
    assert gallery.locator(".partner-accessory-orbit").first.inner_html() == before
    page.get_by_label("暂停/隐藏", exact=True).check()
    assert gallery.locator(".partner-accessory-layers").count() == 0
    assert page.evaluate("JSON.parse(localStorage.getItem('csp_pet_data')).coins") == 2000
    assert not errors, errors
    print(json.dumps({"checks": checks, "stoppingSleepReducedPause": True, "noPurchaseOrSaveMutation": True, "errors": errors}))
    browser.close()
