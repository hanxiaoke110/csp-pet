"""Exercise real ascension UI in a fresh, disposable browser context only."""
import json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    context = browser.new_context(viewport={"width": 1280, "height": 1000})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("http://127.0.0.1:4187/design/partner-upgrade/growth-preview.html")
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="创建演示存档").click()
    panel = page.get_by_role("region", name="伙伴升华")
    for target, coins, sand in [("稀有", 900, 5), ("传说", 660, 0)]:
        page.get_by_role("button", name="升华为" + target, exact=True).click()
        page.get_by_role("button", name="确认升华", exact=True).click()
        page.wait_for_function("""([coins,sand])=>{
          const pets=JSON.parse(localStorage.getItem('csp_pet_data'));
          const growth=JSON.parse(localStorage.getItem('csp_partner_growth_v1'));
          return pets.coins===coins&&growth.starSand===sand;
        }""", arg=[coins, sand])
    assert "已达传说品质" in panel.inner_text()
    saved = page.evaluate("JSON.parse(localStorage.getItem('csp_pet_data'))")
    assert saved["ownedPets"][0]["quality"] == "legendary"
    assert saved["ownedPets"][1].get("quality") is None
    assert len(saved["ownedPets"][0]["ascensionHistory"]) == 2
    page.get_by_role("button", name="卡皮·二号", exact=True).click()
    assert page.get_by_role("button", name="升华为稀有", exact=True).is_disabled()
    assert "星砂 0" in panel.inner_text()
    assert not errors, errors
    page.get_by_role("button", name="重置演示存档").click()
    second = context.new_page()
    second.goto("http://127.0.0.1:4187/design/partner-upgrade/growth-preview.html")
    second.wait_for_load_state("networkidle")
    for tab in [page, second]:
        ready = tab.evaluate("""async()=>{
          const pet=await import('/src/stores/petStore.ts');
          const growth=await import('/src/stores/partnerGrowthStore.ts');
          await pet.usePetStore.getState().load();
          await growth.usePartnerGrowthStore.getState().load();
          window.__growth=growth.usePartnerGrowthStore;
          window.__transactions=await import('/src/lib/partnerTransactions.ts');
          return {petLoaded:pet.usePetStore.getState().loaded,growthLoaded:growth.usePartnerGrowthStore.getState().loaded};
        }""")
        assert ready == {"petLoaded": True, "growthLoaded": True}, ready
    for tab in [page, second]:
        tab.evaluate("window.__growth.getState().ascend('preview-one','common').then(r=>window.__ascendResult=r); true")
    for tab in [page, second]:
        tab.wait_for_function("window.__ascendResult!==undefined")
    attempts = [tab.evaluate("window.__ascendResult") for tab in [page, second]]
    assert sum(result["ok"] for result in attempts) == 1, attempts
    assert page.evaluate("JSON.parse(localStorage.getItem('csp_pet_data')).coins") == 900
    for index, tab in enumerate([page, second]):
        tab.evaluate("""offset=>{
          Promise.all(Array.from({length:10},(_,i)=>window.__growth.getState().recordCorrect('accept-'+(i+offset)))).then(r=>window.__recorded=r);
        }""", index * 10)
    for tab in [page, second]:
        tab.wait_for_function("window.__recorded!==undefined")
    ledger = page.evaluate("JSON.parse(localStorage.getItem('csp_partner_growth_v1'))")
    assert ledger["starSand"] == 6 and len(ledger["firstCorrectIds"]) == 20, ledger
    page.evaluate("""()=>{
      window.__transactions.withPartnerTransactionLock(async()=>{
        window.__lockEntered=true;
        await new Promise(resolve=>window.__unlock=resolve);
      });
    }""")
    page.wait_for_function("window.__lockEntered===true")
    second.evaluate("window.__transactions.recoverPartnerState().then(()=>window.__recovered=true); true")
    second.wait_for_timeout(120)
    assert second.evaluate("window.__recovered!==true")
    page.evaluate("window.__unlock(); true")
    second.wait_for_function("window.__recovered===true")
    assert not errors, errors
    print(json.dumps({"coins": saved["coins"], "quality": "legendary", "otherPetUnchanged": True, "insufficientSandDisabled": True,
                      "concurrentAscensions": attempts, "concurrentQuestions": len(ledger["firstCorrectIds"]),
                      "recoveryWaitsForActiveTransaction": True, "errors": errors}, ensure_ascii=False))
    context.close()
    browser.close()
