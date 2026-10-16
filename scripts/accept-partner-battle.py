"""Local-only browser acceptance. Requires the isolated Vite preview on port 4187."""
import json
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4187/design/partner-upgrade/preview.html"
SCENE = 'window.__partnerBattlePreview.game.scene.getScene("BattleScene")'

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    )
    results = []
    for scale in [1, 1.25, 1.5, 2]:
        context = browser.new_context(viewport={"width": 1440, "height": 1100}, device_scale_factor=scale)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL)
        page.wait_for_load_state("networkidle")
        page.wait_for_function('window.__partnerBattlePreview?.game.scene.getScene("BattleScene")?.sceneBuilt')
        canvas = page.locator("canvas")
        dimensions = canvas.evaluate("c=>({width:c.width,height:c.height})")
        assert dimensions["width"] * dimensions["height"] <= 3840 * 2160
        assert page.evaluate(f"{SCENE}.children.list.filter(x=>x.type==='Text').every(x=>x.style.resolution===1)")
        page.evaluate("document.querySelector('#battle').style.width='640px'")
        page.wait_for_timeout(250)
        narrow = canvas.evaluate("c=>({width:c.getBoundingClientRect().width,parent:c.parentElement.getBoundingClientRect().width})")
        assert narrow["width"] <= narrow["parent"] + 1, narrow
        page.evaluate("document.querySelector('#battle').style.width=''")
        page.wait_for_timeout(150)
        assert not errors, errors
        results.append({"scale": scale, "backing": dimensions, "narrow": narrow, "errors": errors})
        context.close()

    context = browser.new_context(viewport={"width": 1440, "height": 1100})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_function('window.__partnerBattlePreview?.game.scene.getScene("BattleScene")?.sceneBuilt')
    effects = page.evaluate("""async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const b=window.__partnerBattlePreview,s=b.game.scene.getScene('BattleScene');
      const skill=s.state.skillUsages[0].skill,results=[];
      for(const element of ['fire','water','wind','earth','light']){
        s.initData.playerPet.element=element;
        let count=0;
        const before=s.children.list.filter(x=>x.type==='Graphics').length;
        s.playSkillEffect(skill,()=>count++);
        await wait(120);
        const visible=s.children.list.filter(x=>x.type==='Graphics').length>before;
        await wait(600);
        results.push({element,count,visible,cleaned:s.children.list.filter(x=>x.type==='Graphics').length===before});
      }
      let count=0;s.playSkillEffect(skill,()=>count++);b.pause();
      await wait(400);const paused=count;b.resume();await wait(650);
      results.push({pause:{paused,resumed:count}});
      return results;
    }""")
    for effect in effects[:5]:
        assert effect["count"] == 1 and effect["visible"] and effect["cleaned"], effect
    assert effects[5]["pause"] == {"paused": 0, "resumed": 1}
    page.locator("#mode").click()
    assert "简洁" in page.locator("#status").inner_text()
    page.evaluate(f"window.__simpleCount=0;{SCENE}.playSkillEffect({SCENE}.state.skillUsages[0].skill,()=>window.__simpleCount++)")
    page.wait_for_timeout(400)
    assert page.evaluate("window.__simpleCount") == 1
    page.evaluate(f"window.__exitCount=0;{SCENE}.playSkillEffect({SCENE}.state.skillUsages[0].skill,()=>window.__exitCount++);window.__partnerBattlePreview.destroy()")
    page.wait_for_timeout(500)
    assert page.evaluate("window.__exitCount") == 0
    assert not errors, errors
    print(json.dumps({"scales": results, "effects": effects, "simpleImpact": 1, "exitImpact": 0, "errors": errors}, ensure_ascii=False))
    context.close()
    browser.close()
