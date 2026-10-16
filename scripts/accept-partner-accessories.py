"""Buy/equip/recover cosmetics in the preview's disposable memory storage."""
import json
import re
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    context = browser.new_context(viewport={"width": 1440, "height": 1100})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("http://127.0.0.1:4187/design/partner-upgrade/accessory-preview.html")
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name=re.compile("装载临时样例")).click()
    page.wait_for_function("document.querySelectorAll('.partner-accessory-card').length===6")
    def card(name):
        return page.locator(".partner-accessory-card").filter(has=page.get_by_role("heading", name=name, exact=True))

    card("棱镜星图").get_by_role("button", name="收藏 · 240", exact=True).click()
    assert page.locator(".buy-confirm-modal").is_visible()
    assert "1760 金币" in page.locator(".buy-confirm-modal").inner_text()
    page.get_by_role("button", name="确认收藏", exact=True).click()
    page.wait_for_function("JSON.parse(localStorage.getItem('csp_pet_data')).coins===1760")
    card("棱镜星图").get_by_role("button", name="装备", exact=True).click()
    page.wait_for_function("JSON.parse(localStorage.getItem('csp_partner_accessories_v1')).equippedByPet['fixture-one']?.halo==='halo-prism'")
    selector = page.locator(".partner-fitting select")
    selector.select_option("fixture-two")
    card("澄明星环").get_by_role("button", name="装备", exact=True).click()
    page.wait_for_function("JSON.parse(localStorage.getItem('csp_partner_accessories_v1')).equippedByPet['fixture-two']?.halo==='halo-clear'")
    selector.select_option("fixture-one")
    card("彗星航迹").get_by_role("button", name="试穿", exact=True).click()
    page.get_by_role("button", name="模拟移动 · 试穿尾迹", exact=True).click()
    page.wait_for_function("document.querySelector('.partner-fitting .partner-accessory-trail')!==null")
    page.wait_for_timeout(3200)  # 1.8s movement plus bounded residual trail fade.
    assert page.locator(".partner-fitting .partner-accessory-trail").count() == 0
    assert page.evaluate("JSON.parse(localStorage.getItem('csp_pet_data')).coins") == 1760
    card("彗星航迹").get_by_role("button", name="收藏 · 300", exact=True).click()
    page.get_by_role("button", name="确认收藏", exact=True).click()
    page.wait_for_function("JSON.parse(localStorage.getItem('csp_pet_data')).coins===1460")
    card("彗星航迹").get_by_role("button", name="装备", exact=True).click()
    page.wait_for_function("JSON.parse(localStorage.getItem('csp_partner_accessories_v1')).equippedByPet['fixture-one']?.trail==='trail-comet'")
    motion_stage = page.locator("main > div").last
    assert page.locator(".partner-accessory-trail").count() == 0
    page.get_by_label("模拟位置移动", exact=True).check()
    page.wait_for_function("document.querySelectorAll('.partner-accessory-trail').length>0")
    assert page.locator(".partner-accessory-layers").evaluate_all("xs=>xs.every(x=>getComputedStyle(x).pointerEvents==='none')")
    page.get_by_label("睡眠", exact=True).check()
    assert page.locator(".partner-accessory-trail").count() == 0
    page.get_by_label("睡眠", exact=True).uncheck()
    page.get_by_label("简化动画", exact=True).check()
    page.wait_for_timeout(100)
    assert not page.locator(".accessory-preview-reduced .partner-accessory-trail").is_visible()
    page.get_by_label("简化动画", exact=True).uncheck()
    page.get_by_label("暂停/隐藏", exact=True).check()
    assert motion_stage.locator(".partner-accessory-layers").count() == 0
    page.get_by_label("暂停/隐藏", exact=True).uncheck()
    page.get_by_label("模拟位置移动", exact=True).uncheck()
    restored = page.evaluate("""async()=>{
      const {usePartnerAccessoryStore:store}=await import('/src/stores/partnerAccessoryStore.ts');
      const backup=await import('/src/lib/backup.ts');
      const original=JSON.parse(localStorage.getItem('csp_partner_accessories_v1'));
      const saved=await backup.buildBackup();
      localStorage.removeItem('csp_partner_accessories_v1');
      await backup.applyBackup(saved);
      store.setState({loaded:false});await store.getState().load();
      return {original,restored:store.getState().snapshot,coins:JSON.parse(localStorage.getItem('csp_pet_data')).coins};
    }""")
    assert restored["coins"] == 1460
    assert restored["restored"]["ownedIds"] == restored["original"]["ownedIds"]
    assert restored["restored"]["equippedByPet"] == restored["original"]["equippedByPet"]
    assert restored["restored"]["equippedByPet"]["fixture-two"] == {"halo": "halo-clear"}
    assert not errors, errors
    page.screenshot(path="/tmp/partner-accessories-acceptance.png", full_page=True)
    print(json.dumps({"coins": 1460, "twoPetLoadoutsIndependent": True, "movementSleepPauseReducedMotion": True,
                      "pointerEventsNone": True, "backupRestore": True, "errors": errors}, ensure_ascii=False))
    context.close()
    browser.close()
