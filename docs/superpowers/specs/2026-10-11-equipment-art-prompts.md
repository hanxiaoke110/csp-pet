# 新装备专属美术：生成与验收记录

模式：内置 imagegen；每件装备单独调用，不使用拼图裁切代替独立设计。
最终资源：`public/dungeon-exploration/weapons/<id>.webp` 与 `public/dungeon-exploration/armor/<id>.webp`。
旧装备资源不替换。生成 PNG 原稿保留在生成工具默认目录，不进入应用构建；最终透明 WebP 保存在本仓库。

## 共用提示约束

Use case: stylized-concept. Asset type: fantasy RPG inventory icon. Single isolated equipment item, centered square, entire silhouette visible with clear margin. Polished hand-painted Chinese fantasy RPG item art, dimensional metallic bevels, rich fabric folds for armor, crisp readable silhouette and jewel detail at 96px. Rarity-proportional detail: common modest, rare refined, epic elaborate, legendary spectacular. Restrained localized magical glow, not washing out the item. Actual transparent background. No text, watermark, frame, pedestal or opaque atmosphere. Armor is an empty garment, with no body, head, person or mannequin.

## 每件装备的主体提示

- `fire-weapon-common`：common-tier single sturdy short bronze dagger with a red wrapped handle, tiny ember ruby, simple flame-shaped blade, modest decoration
- `fire-weapon-rare`：rare-tier matched pair of curved fighting daggers crossing in an X, copper and crimson metal, molten orange inset channels, clearly two blades
- `fire-weapon-epic`：epic-tier long-handled battle scythe with one great crimson curved blade, phoenix feather motifs, blackened steel, gold trims and fiery ruby
- `water-weapon-common`：common-tier blue wood magic staff topped with a modest silver crescent enclosing a small water droplet crystal
- `water-weapon-rare`：rare-tier elegant single longbow with blue-silver swept arms, visible taut bowstring, frosty turquoise gems and dark blue leather grip
- `water-weapon-epic`：epic-tier substantial long battle halberd, ice-blue broad axe blade and spear tip on a single silver shaft, white frost carvings and sapphire
- `light-weapon-common`：common-tier small gold and ivory scepter with a pale yellow star-shaped head enclosing a tiny clear jewel, restrained decoration
- `light-weapon-rare`：rare-tier elegant slender silver rapier with an ivory grip, polished golden swept guard and small radiant yellow crystal, distinct straight thin blade
- `light-weapon-epic`：epic-tier circular throwing battle ring with four substantial ivory blades, gold filigree and violet star crystals, no handle, not a shield
- `fire-weapon-legendary`：golden sun-raven chakram with scarlet enamel and amber core
- `water-weapon-legendary`：silver sapphire whale crescent moonblade
- `light-weapon-legendary`：ivory golden winged celestial crossbow with violet star crystal
- `earth-armor-rare`：rare earth-element flowing protective robe, sturdy ochre fabric, modest bronze shoulder guards and jade clasp
- `earth-armor-epic`：epic earth-element heavy battle breastplate, angular layered dark bronze and brown stone plates, jade core, mountain engravings
- `fire-armor-rare`：rare fire-element light feather mantle, rich crimson fabric with a few amber feathers, copper clasp and modest trims
- `fire-armor-epic`：epic fire-element dramatic red-black battle robe with gold armored shoulders and angular phoenix feather hem, amber gemstone
- `fire-armor-legendary`：legendary fire-element regal phoenix armor, substantial gold breastplate and spectacular crimson feather shoulder cape, ruby sun core
- `wind-armor-rare`：rare wind-element lightweight short green cloak, flowing teal cloth, silver clasp and modest leaf shaped shoulder pads
- `wind-armor-epic`：epic wind-element agile dark green long coat with sweeping silver shoulder armor, emerald clasp and cloud-swirl hem
- `wind-armor-legendary`：legendary wind-element spectacular teal and jade feather cuirass with gold edging, curved bird-wing shoulder armor, green jewel and flowing light cape
- `water-armor-legendary`：legendary water-element substantial deep blue silver scale breastplate, whale and ocean wave motifs, sapphire core, icy layered shoulder guards
- `light-armor-rare`：rare light-element short ivory cape over simple pale gold shoulder armor, small yellow star clasp
- `light-armor-epic`：epic light-element elegant white violet long ceremonial battle robe, golden armored shoulders, amethyst star clasp and layered hem
- `light-armor-legendary`：legendary light-element magnificent white and gold celestial cuirass, wing-like pauldrons, radiant violet star core and a flowing ivory cape

## 输出约束

- Sharp 仅做非语义的缩放和 WebP 压缩，256×256，quality 88 / alphaQuality 100，保留透明度。
- 24张新增图合计620.1 KiB，每张不超过100 KiB；校验专属路径、透明通道、尺寸、重复文件哈希和总大小。
- 目录只改图片引用，不重新生成或修改价格、品级、效果、已有装备ID。
- 本批不部署、不发桌面版本；新增典藏卡、原生战斗与Windows升级实测另行完成。
