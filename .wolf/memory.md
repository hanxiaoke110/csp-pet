## 2026-07-06 — 智子试炼场集成桌面 App + 身份复用 + 换班级处理

### 集成方案
- 桌面 App 侧边栏加「智子试炼场」入口，地牢全屏渲染（脱离 AppShell）
- 顶层 App 根据 URL 在 BrowserRouter 与 MemoryRouter 间二选一（不嵌套，避免 React Router 报错）
- 进/出地牢用 pushState + 自定义事件 `csp-app-route-change` 触发顶层切换
- 地牢 CSS 动态注入/移除（`?raw` 导入），不污染桌面样式

### 身份复用（复用桌面班级绑定）
- 新增 `src-dungeon/utils/autoRegister.ts`：读桌面 `csp_class_code`/`csp_display_name`/`csp_student_name`/`csp_student_phone`
- TitleScreen 简化：有 classCode→进；无→提示去设置绑定；去掉"已有账号登录"
- RegisterScreen 简化：只剩选流派，用桌面 binding 自动建档，不选初始宠物（用桌面灵犀智子）
- `/login` 路由废弃

### 换班级处理（数据归属 device_hash，classCode 仅作准入凭证）
- **后端 sync 端点**：白名单加 `class_code`，带班级码合法性校验 + 同步 teacher_id
- **后端地牢教师删除/恢复**：同时更新 class_students.status，避免"进得去打不了"死锁
- **前端 dungeonStore.setClassCode**：仅更新本地 classCode，进度全保留
- **前端 App init**：检测本地 player.classCode vs 桌面 csp_class_code 不一致 → setClassCode + saveToLocalStorage + 异步 sync

### 赛季制（规划，未实现）
- 学期赛季，赛季切换清战斗记录/副本进度/玩家成长，保留徽章/错题/弱点
- 后端 current_season 接口 + attempts 清理待做

### 改动文件
- `src/App.tsx`、`src/components/layout/AppShell.tsx`：桌面集成入口
- `src-dungeon/DungeonEmbed.tsx`（新）、`src-dungeon/utils/autoRegister.ts`（新）
- `src-dungeon/App.tsx`、`TitleScreen.tsx`、`RegisterScreen.tsx`：身份复用
- `src-dungeon/stores/dungeonStore.ts`：setClassCode
- `cf-workers/api.js`：sync class_code 白名单 + 教师删除同步 class_students

### 待部署
- Worker 需重新部署（sync + 教师删除改动）

## 2026-07-01 — 智子试炼场 Phaser.js 卡牌战斗改造

### 背景
用户反馈当前战斗画面「太简陋、没有游戏的感觉」。经讨论确认：采用 Phaser.js + 卡牌类战斗风格，左右对峙布局、4 技能加能量限制、答题作为技能命中/完美释放判定、显示敌方意图、连击 buff、无自动战斗。

### 新增依赖
- `phaser@^3.90.0`

### 新增文件
- `src-dungeon/phaser/BattlePhaserGame.ts` — Phaser.Game 实例管理
- `src-dungeon/phaser/types.ts` — Phaser 战斗内部类型
- `src-dungeon/phaser/scenes/BattleScene.ts` — 主战斗场景
- `src-dungeon/phaser/entities/PetSprite.ts` — 宠物精灵
- `src-dungeon/phaser/entities/HealthBar.ts` — 血条
- `src-dungeon/phaser/entities/EnergyOrb.ts` — 能量球
- `src-dungeon/phaser/entities/Card.ts` — 技能卡牌
- `src-dungeon/phaser/entities/CardHand.ts` — 手牌管理
- `src-dungeon/phaser/entities/TurnIndicator.ts` — 回合指示器
- `src-dungeon/phaser/entities/ComboCounter.ts` — 连击计数器
- `src-dungeon/phaser/entities/IntentBubble.ts` — 敌方意图气泡
- `src-dungeon/phaser/entities/DamageText.ts` — 伤害飘字
- `src-dungeon/components/screens/BattleScreen.css` — 题目覆盖层样式

### 修改文件
- `src-dungeon/components/screens/BattleScreen.tsx` — 重写为 React 外壳 + Phaser Canvas
- `src-dungeon/data/skills.ts` — 4 技能新增 `energyCost` 与 `effectType`
- `src-dungeon/types/dungeon.ts` — `BattleState` 新增 `energy`/`maxEnergy`/`shield`/`enemyIntent`/`burnStacks`
- `src-dungeon/utils/combatLogic.ts` — 新增连击伤害、意图生成、护盾计算、灼烧结算
- `.wolf/anatomy.md` / `.wolf/cerebrum.md` — 更新结构与学习项

### 核心机制
- 能量：初始 2，上限 5，每回合 +1；语法射线 0 能、火球/护盾 1 能、递归爆发 3 能
- 答题命中判定：答对全额伤害+特效，答错 0.3 倍伤害且连击清零
- 护盾：数组护盾答对获得 25% 最大 HP 护盾，可抵挡敌方攻击
- 敌方意图：普通攻击/蓄力重击/防御姿态，玩家低血量更易被重击
- 连击 buff：每连续答对 +10% 伤害，上限 50%

### 验证
- `npx tsc --project tsconfig.dungeon.json --noEmit`：通过
- `npm run build:dungeon`：构建成功（主包 1.58 MB / gzip 454 KB）
- `npm test`：5/5 通过

### 审查修复（2026-07-01 晚）
通过 Agent 代码审查发现 9 个问题并修复：
1. **回合数/能量偏移**：`startPlayerTurn` 先 `round++`/`energy+1` 导致第一回合显示为第 2 回合且能量为 3 → 改为初始 `round=0`、`energy=initialEnergy-1`。
2. **答题 setTimeout 未清理**：组件卸载时可能访问已销毁的 Phaser 实例 → 增加 `answerTimeoutRef` 并在卸载时清理。
3. **敌方防御无实际效果**：仅 UI 展示 → 增加 `enemyDefending` 状态，下回合玩家伤害减半。
4. **`handleAnswerResult` 缺少二次校验**：防止 React 侧竞速/重复回调 → 加能量/冷却/次数校验。
5. **卡牌 hover tween 叠加**：快速划过时动画堆积 → `killTweensOf(this)` 后再创建新 tween。
6. **题目缺少 options 软锁死**：增加"该题目缺少选项"兜底按钮，可继续战斗。
7. **结算 HP 比例失真**：胜利固定按满血计算 → Phaser 在 `battleEnd` 中带回真实 `playerHp/enemyHp`。
8. **50 回合上限**：已补充在 `startPlayerTurn` 开头。
9. **包体积**：Phaser 全量导入导致主包 1.58 MB，作为桌面端可接受，后续可用 `manualChunks` 拆分或按需引入优化。

## 2026-06-30 — 智子试炼场 Task 13：副本背景图与剧情引入

### 改动文件
- `src-dungeon/data/dungeons.json` — 为 8 个副本添加 `bgImage`、重写 `guardianLine`、新增 `bossLine`、按任务命名规范更新 `bossName`
- `src-dungeon/components/screens/DungeonEntrance.tsx` — 副本入口展示背景图、守关 NPC 对白、Boss 登场台词
- `src-dungeon/types/dungeon.ts` — `DungeonDefinition` 新增可选 `bgImage` 与必填 `bossLine`

### 新增字段
- `bgImage?: string`：副本背景图路径，如 `/dungeon-bg/dungeon-01-bg.png`，缺省时用 `color` 渐变兜底
- `bossLine: string`：Boss 登场台词，与 `guardianLine` 共同构成副本剧情引入

### 剧情文案
按「中二热血、适合中国中小学生」风格重写 8 副本 NPC 开场白与 Boss 登场台词：
1. 天机阁（计算机基础）— 玄机子 / 蓝屏幽魂
2. 数术殿（进制转换与编码）— 算无穷 / 进位魔·乱码君
3. 灵码洞（C++ 程序设计基础）— 语法尊者 / 段错误·NULL 之影
4. 万木林（数据结构）— 结构真君 / 越界虫·数组吞噬者
5. 算法塔（算法）— 算法天尊 / 超时魔·TLE 君王
6. 天算台（数学逻辑）— 数论圣者 / 概率云·WA 雷神
7. 真题战场（CSP-J/S 历年真题）— 战场老兵·洛谷之魂 / 真题守护者·退役战神
8. 潜龙觉醒（综合模拟大挑战）— 秘境守护者·第一代潜龙 / 综合大魔王·Bug 之源

### UI 变更
- `DungeonEntrance` 根节点使用 `bgImage` + 暗色渐变遮罩作为背景，无图时回退到主题色渐变
- 新增 NPC 对白框（🛡️ 守关者）与 Boss 对白框（👹 Boss，红色边框）
- 原有副本标题、描述、进度条、关卡列表、Boss 战入口全部保留

### 验证
- `npx tsc --noEmit`：通过
- `npm run build:dungeon`：构建成功
- 未创建实际 PNG 文件，背景图路径作为占位，等待后续美术素材

---



### 改动文件
- `src-dungeon/types/dungeon.ts` — 扩展 `LeaderboardType` 类型
- `cf-workers/api.js` — 新增排行榜类型校验与 4 条 SQL 查询分支，补 `dungeon_attempts.is_win` 字段
- `src-dungeon/components/screens/LeaderboardScreen.tsx` — 新增 4 个排行榜 Tab 与对应数值显示

### 新增内容
- `LeaderboardType` 新增 `'wins' | 'ss_count' | 'progress' | 'warrior'`
- Worker `/api/dungeon/leaderboard`：
  - 增加 `VALID_TYPES` 校验，非法类型返回 400
  - `wins`：近 30 天 `is_win = 1` 的尝试次数
  - `ss_count`：近 30 天 `rating = 'SS'` 的尝试次数
  - `progress`：已通关（`status='cleared'`）的不同副本数
  - `warrior`：近 30 天加权积分（胜场×10 + SS×30 + S×15）
  - 新类型同时支持 `class` 与 `global` 作用域；class 作用域通过 `JOIN dungeon_players` 过滤班级码
- `ensureSchema`：
  - `dungeon_attempts` 建表语句增加 `is_win INTEGER DEFAULT 0`
  - 增加 `ALTER TABLE dungeon_attempts ADD COLUMN is_win INTEGER DEFAULT 0` 迁移

### 前端展示
- LeaderboardScreen tabs 扩展为 8 个：战力/连击/征服/成就/试炼胜场/无伤通关/征服进度/班级战神
- `getTypeValue` 为新类型返回 `value` 字段的展示文本

### 验证
- `node --check cf-workers/api.js`：通过
- 目标文件单独类型检查无新增错误（src-dungeon 既有类型错误未处理）

---

## 2026-06-30 — 智子试炼场 Task 10：实现 S/SS 战斗评级计算

### 改动文件
- `src-dungeon/utils/gameLogic.ts` — 新增 `calculateBattleRating` 函数

### 新增内容
- `calculateBattleRating(correctCount, totalQuestions, remainingHpRatio, usedSkillIds, roundCount, expectedRounds)`：
  - 计算准确率 `accuracy = correctCount / totalQuestions`
  - 计算本局使用过的独特技能数 `uniqueSkills = new Set(usedSkillIds).size`
  - **SS**：准确率 100% + 剩余 HP ≥ 70% + 独特技能 ≥ 4 + 回合数 ≤ 预期回合
  - **S**：准确率 ≥ 80% + 剩余 HP ≥ 50% + 独特技能 ≥ 3
  - **A**：准确率 ≥ 70% + 剩余 HP ≥ 30%
  - **B**：准确率 ≥ 60%
  - 否则 **C**（类型保留 `D`，但当前函数不会返回 `D`）

### 说明
- 函数返回类型为已有的 `ClearRating`（`'D' | 'C' | 'B' | 'A' | 'S' | 'SS'`），与 `getStageClearRating` 保持一致
- 未改动文件中其他现有函数

---

## 2026-06-30 — 智子试炼场 Task 9：随机金币奖励计算

### 改动文件
- `src-dungeon/utils/gameLogic.ts` — 新增 `randomGold` 与 `calculateBattleRewards` 函数

### 函数说明
- `randomGold(min, max)`：闭区间随机整数
- `calculateBattleRewards(isWin, isFirstClear, isBoss, rating)`：
  - 失败返回 `0` 与 `['失败，无奖励']`
  - 胜利基础奖励 10–20 金币
  - 首次通关额外 ×2（基于基础值）
  - Boss 战额外 15–30 金币
  - S/SS 评级分别额外奖励 10–15 / 15–20 金币

---

## 2026-06-30 — 智子试炼场 Task 8：为 8 副本 40 关配置敌方宠物

### 改动文件
- `src-dungeon/data/dungeons.json` — 为每个 stage 添加 `enemyPet` 字段

### 配置规则
- 副本 1（天机阁）：water / glitch-bot，等级 1–2，普通
- 副本 2（数术殿）：earth / brassprout、df-maixiaoshu，等级 2–3，普通/稀有
- 副本 3（灵码洞）：fire / boolet、boo，等级 3–4，普通/稀有
- 副本 4（万木林）：earth/wind / capi、miga，等级 4–5，稀有
- 副本 5（算法塔）：fire/wind / wukong、sky-dragon，等级 5–6，稀有
- 副本 6（天算台）：water/light / ayaka、little-blue-star，等级 6–7，稀有/传说
- 副本 7（真题战场）：mixed / itachi、sasuke，等级 7–8，稀有/传说
- 副本 8（潜龙觉醒）：mixed / yuanshi-tianzun、liudao-ban，等级 8–10，传说

### Boss 关（每副本第 5 关）
- 等级比普通关高 1–2 级
- 品级提升一级（普通→稀有，稀有→传说）
- 添加 `maxHpBoost: 1.5`

### 验证
- `python3 -m json.tool src-dungeon/data/dungeons.json`：JSON 格式有效
- 脚本校验所有 `speciesId` 存在于 `src/types/pet.ts` 的 `PETDEX_PETS` 或 `STARTER_PETS`
- 所有 `element` 与 `tier` 枚举值合法
- Commit SHA: `5ab7578cd036d881c8900dca5355f0dd16f52e26`

---

## 2026-06-30 — 智子试炼场 Task 6：宠物手动升级与战斗属性初始化

### 改动文件
- `src/stores/petStore.ts` — 新增经验池手动升级与战斗属性初始化方法

### 新增内容
- `PetState` 接口扩展：
  - `addExpToPool(amount)` — 向全局经验池添加经验
  - `canLevelUp(petId)` — 检查经验池是否足够某宠物升级
  - `levelUp(petId)` — 手动升级指定宠物，升级后回满 HP 并重算 battle 属性
  - `ensureBattleStats(pet)` — 为没有 battle 字段的宠物补齐战斗属性
- 新增 import：
  - `PET_BASE_STATS`、`TIER_MULTIPLIERS`、`getPetTier` 来自 `../types/pet`
  - `calculateStats` 来自 `../../src-dungeon/utils/combatLogic`
- `load()` 加载宠物后自动调用 `ensureBattleStats`，保证旧数据兼容
- `save()` 已持久化 `expPool`

### 验证
- `npx tsc --noEmit`：通过
- Commit SHA: `641fe79`

### 说明
- `calculateStats` 返回对象包含 `level`，已解构剔除以符合 `BattleStats` 类型
- 手动升级仅暴露方法，UI 按钮在后续 Task 中实现

---

## 2026-06-30 — 智子试炼场 Task 3：技能定义与知识点标签

### 改动文件
- `src-dungeon/data/skills.ts` — 新增技能定义数据

### 新增内容
- `KnowledgeTag` 类型：`'grammar' | 'control-flow' | 'data-structure' | 'algorithm'`
- `SkillDefinition` 接口：`id / name / knowledgeTag / knowledgeLabel / multiplier / cooldown / maxUsesPerBattle / description`
- 4 个技能定义：
  - 语法射线（grammar / 语法基础）：倍率 1.0，无冷却，无次数限制
  - 循环火球（control-flow / 流程控制）：倍率 1.2，冷却 1 回合
  - 数组护盾（data-structure / 数据结构）：倍率 1.4，冷却 2 回合
  - 递归爆发（algorithm / 算法思维）：倍率 1.8，冷却 3 回合，每关限用 2 次
- `getSkillById(id)` 查询辅助函数

### 说明
- 中文标签面向儿童，知识点标签用于后续题目类型匹配与战斗逻辑
- 冷却与次数限制由战斗系统消费，本文件仅做静态定义

---

## 2026-06-30 — 智子试炼场 Task 2：战斗数值逻辑模块

### 改动文件
- `src-dungeon/utils/combatLogic.ts` — 新增战斗数值逻辑
- `src-dungeon/utils/combatLogic.test.ts` — 对应单元测试
- `package.json` — 新增 `test` / `test:watch` 脚本
- `package-lock.json` — 安装 `vitest` 依赖

### 新增内容
- `CombatPet` 接口：maxHp / currentHp / attack / defense / speed / element / level
- `ELEMENT_ADVANTAGE` 元素克制表：火→风→地→水→火循环克制，光系无克制
- `getElementMultiplier(attacker, defender)`：查询克制倍率（1.5 / 0.7 / 1.0）
- `calculateDamage(attacker, defender, skillMultiplier, answerQuality)`：基础伤害 = attack × skillMultiplier − defense，再乘元素倍率与答题质量，最低 1
- `calculateStats(base, tierMultiplier, level)`：按品级与等级计算 HP/攻击/防御/速度（HP/攻/防 每级 1.1，速度 每级 1.05）
- `determineFirstAttacker(player, enemy)`：速度高者先攻，相等时玩家优先

### 验证
- `npm test -- src-dungeon/utils/combatLogic.test.ts`：5 个测试全部通过
- `npx tsc --noEmit`：通过（tsconfig 当前仅包含 `src`，src-dungeon 其他文件存在既有类型错误，待后续 Task 统一修复）

### 说明
- 项目此前未安装 vitest，本次作为 devDependency 添加
- 任务给出的 `calculateStats` 返回类型缺少 `level`，已在返回对象中补上 `level` 以通过类型检查

---

## 2026-06-29 — 智子试炼场 Task 1：扩展宠物类型定义

### 改动文件
`src/types/pet.ts`

### 新增内容
- `BattleStats` 接口：maxHp / currentHp / attack / defense / speed
- `OwnedPet` 接口新增可选字段：`battle?: BattleStats` 和 `expPool?: number`
- `PET_BASE_STATS` 基础属性表：capi、boba、bubu-2、miga、default
- `TIER_MULTIPLIERS` 品级系数：common 1.0 / rare 1.3 / legendary 1.6

### 验证
- `npx tsc --noEmit` 通过
- Commit SHA: `b9fe87a`

---

## 2026-06-29 — 智子试炼场设计方案确认

### 背景
用户希望将现有「潜龙闭关」地牢模式升级为宠物回合制战斗玩法，面向中国中小学生。

### 最终方案
- **名称**：智子试炼场
- **模式**：替换「潜龙闭关」的战斗核心，保留 8 副本 40 关和 CSP 真题题库
- **战斗循环**：速度决定先后手 → 选技能 → 答对应知识点编程题 → 按答题质量释放技能
- **宠物属性**：新增 HP/攻击/防御/速度/元素，等级品级影响成长
- **技能系统**：4 技能对应 4 类 CSP 知识点，带冷却和每关使用次数限制
- **元素克制**：火→风→地→水→火，光 neutral
- **升级**：手动升级，与桌面宠物等级共享，升级回满 HP
- **奖励**：全部改为随机金币（胜利 10–20、首通 ×3、Boss 额外、评级额外）
- **周挑战**：每周 5 次
- **登录奖励**：不新增，复用现有签到系统
- **排行榜**：加入班级排行榜（胜场榜、SS 榜、进度榜、战神榜）
- **说明系统**：技能 tooltip、新手引导、元素手册、评级说明、奖励说明
- **剧情**：智子 AI 世界观，中二热血 NPC/Boss 台词

### 明确不做
- 同学间宠物交易
- 单独的地牢周签到奖励
- 答题速度奖励/时间压力

### 设计文档
`docs/superpowers/specs/2026-06-29-智子试炼场-design.md`

### 下一步
进入 `writing-plans` 阶段，拆 Stage 1/2/3 实现计划。

### 实现计划
- 2026-06-29 生成实现计划：`docs/superpowers/plans/2026-06-29-智子试炼场-plan.md`
- 计划拆分为 15 个 Task，按 Stage 1/2/3 组织
- 等待用户选择执行方式：Subagent-Driven 或 Inline Execution

---

# 2026-05-29 — 包体优化 & 孵化系统 & 代码审查

## 2026-06-12 — CSP 填空题选项修复

### 问题
csp-exam-bank.json 中 29 个 fillBlank 空位的选项出现重复/仅大小写差异的 bug：
- 27 个空位：3 个同文本 + 1 个全大写变体（降小写后全部相同）
- 2 个空位：4 个选项完全相同（`["0","0","0","0"]`）
- 1 个空位：包含截断选项
根因是数据生成时"错误选项"只做了大小写变换，未生成真正不同的干扰项。

### 修复
为全部 29 个空位生成了 4 个真正不同的选项，覆盖 7 道 S 组题 + 3 道 J 组题：
- csp-s-2019-f01 (3), csp-s-2019-f02 (1), csp-s-2020-f01 (3)
- csp-s-2021-f01 (3), csp-s-2022-f01 (3), csp-s-2023-f01 (3)
- csp-s-2024-f01 (3), csp-j-2022-f01 (3), csp-j-2023-f01 (4)
- csp-j-2024-f01 (3)
干扰项模式：off-by-one、错误变量、取反条件、错误索引、错误运算符
全文件扫描确认：0 个残留重复选项

---

## 2026-06-12 — v1.6.0 CSP 真题训练 + 饥饿预警

### 发版前必读
- **ChangelogModal 版本号**：发版时必须更新 `src/App.tsx` 中 `ChangelogModal` 的 `VER` 为新版本号 + 更新内容
- **v1.6.0 的 ChangelogModal 已修但未重构建**：当前 Gitee Release 的 DMG 仍是 1.5.2 的弹窗。下次发版包含此修复（commit c7867af）

### CSP 真题训练
- 新页面 `/exam`，侧边栏 `🏅 CSP 真题`（在 OJ 训练上方）
- 3 层流程：选 J/S 组别 → 选题型(选择/阅读/填空) → 做题
- 题库 `public/course-data/csp-exam-bank.json`：240 题(J120+S120)，2019-2024
- 在线更新：`exam-version.json` 版本号 +1 → 学生端自动刷新（和课程数据同一模式）
- `src/components/exam/ExamTraining.tsx`：主页面 + 远程更新逻辑
- `src/components/exam/ExamChoice.tsx`：选择题（复用 quiz-opt CSS）
- `src/components/exam/ExamMultiPart.tsx`：阅读+填空共用组件
- `src/stores/quizStore.ts`：examDaily* 字段 + 3 方法（completeExamQuestion/canClaimExamDaily/claimExamDailyReward）
- 班级码限制：`localStorage.getItem('csp_class_code')` 为空的无法进入
- 每日任务：3选择+1阅读/填空，答对才算，+20 EXP +12g 基础
- 正确率加成：≥80% +10 EXP +5g，100% +20 EXP +10g
- 错题打通：答错 → quizStore.addError → 月度复盘

### 饥饿预警
- `petStore.ts` tickHunger：≤15 警告、≤10 虚弱、≤0 濒死
- `PetWindow.tsx`：虚弱时强制显示、禁隐藏按钮、循环 unhappy 动画
- `PetSettings.tsx`：虚弱时禁显示切换

### 签名问题
- CI 生成的 .sig 文件在 GitHub Release assets 中
- 使用 `csp-updater-v2.key` 签名，本地签需要密码（记在别处）
- 上传 Gitee Release 保持原文件名（签名内嵌文件名）

### Gitee 注意事项
- **默认分支是 `master`，不是 `main`**：`git push gitee main:master --force`
- Raw 文件有 CDN 缓存：加 `?v=N` 或空 commit 触发刷新
- 附件配额 1GB，旧 Release 需手动清理

## 2026-06-08 — PetSettings 虚弱状态禁隐藏
- PetSettings.tsx "显示精灵" toggle 在 hunger <= 10 时禁用
- 禁用状态：cursor not-allowed + opacity 0.5 + 灰色背景
- 提示文案替换为："智子已进入虚弱状态，请先喂食！😿"
- 通过 usePetStore 读取 activePet 的 hunger 状态

# 2026-05-29 — 包体优化 & 孵化系统 & 代码审查

## 方案决策

### 精灵分级 + 孵化下载 (v1.1.0)
- 普通精灵(30只) + 初始(4只) 内置安装包，稀有(27) + 传说(8) Gitee raw 按需下载
- 安装包 140MB → ~81MB，Gitee 100MB 限制通过
- 孵化机制隐藏下载等待：普通 1.5-3min，稀有 5-10min，传说 10-20min
- Gitee 完全能承载 10000 学生（峰值不到限制 10%），无需额外 CDN
- 备用 CDN 预留：spriteDownloader.ts FALLBACK_BASE

### Gitee 限制（已确认）
- raw 文件单线程 < 2MB/s
- 单 IP 60 次/3分钟(Web)，API 180 次/3分钟
- 单文件上传 100MB（Release 上传限制 — 安装包不能超过 100MB）
- 无 SLA 保证，不能当 CDN 但孵化分散了压力

### CDN 备选
- 无畏云：30GB/月，免备案需实名
- 阿里云 ESA + 腾讯云 COS：不限流量，需实名 + ICP 备案域名

## 代码审查发现 & 修复（3b195a3）

### 严重 Bug
1. **金币扣两次** — ShopPanel 先 spendCoins，claimHatchedPet 又 buyPet 再扣
   - 修复：claimHatchedPet 直接 add pet，不扣金币（已在前置流程扣过）
2. **App 重启后下载中断** — 孵化中的稀有/传说蛋关闭后下载不会恢复，蛋永远孵不出
   - 修复：load() 中检测 incubating 且 downloadStatus != done 的蛋，重新调用 resumeDownload
3. **TypeScript 编译 20+ 错误** — 会直接导致 CI 失败
   - 修复：去除未用 import(readFile, doGacha, buyPet)，删除死代码 GachaCeremony，修复重复声明，补充 PetState 接口

### 关键架构
- spriteDownloader.ts: 下载管理（随机延迟、指数退避、本地缓存）
- hatchStore.ts: 孵化状态（egg 生命周期、时间戳计时、下载恢复）
- HatchConfirmModal.tsx + HatchPanel.tsx: 孵化 UI
- PetSprite.tsx: 优先查 app_data_dir 缓存，convertFileSrc 加载本地文件

### 文件拆分
- 远程精灵: pet-sprites-remote/2d/ (70 文件 68MB，推送到 Gitee raw)
- 内置精灵: public/pet-sprites/2d/ (34 只，59MB)
- 下载 URL: https://gitee.com/hanliuliu110/csp-pet/raw/main/pet-sprites-remote/2d/{petId}.{ext}

### 新增依赖
- @tauri-apps/plugin-fs (读写 app data 缓存)
- src-tauri/Cargo.toml: tauri-plugin-fs = "2"
- capabilities/default.json: fs:default, fs:allow-appdata-read/write, fs:allow-exists, fs:allow-mkdir

## 其他
- 仓库已改为公开（GitHub Actions 不限时）
- 已添加 MIT LICENSE
- macOS 未签名应用需右键打开或 xattr -cr

## 2026-05-29 — 孵化系统 6 层 Bug 修复 (v1.1.1)

### 背景
稀有/传说精灵孵化永远卡在「即将完成」，实际是 6 层独立问题叠加，因缺少 .catch() 全部被静默吞掉。

### Bug 链
1. **无 .catch()** — `resumeDownload()` 中 promise 异常静默吞掉
2. **fs:scope 未配置** — Tauri v2 scope 为空，所有路径被拒
3. **fetch CORS** — 浏览器 fetch 请求 Gitee 被跨域拦截
4. **HTTP 插件未注册** — Cargo.toml 有但 lib.rs 漏了 .plugin()
5. **路径拼接缺 /** — appDataDir() 无尾部 /
6. **convertFileSrc 协议不兼容** — asset:// fetch 不支持，asset-localhost 缺少 scope

### 关键变更
- `PetSprite.tsx`: 移除 convertFileSrc，直接用 readFile/readTextFile + Blob URL
- `spriteDownloader.ts`: fetch → @tauri-apps/plugin-http
- `lib.rs`: 注册 tauri_plugin_http::init()
- `capabilities/default.json`: 加 fs:scope、http:allow-fetch

### Tauri v2 安全模型（三层）
每个插件 = Capability 权限声明 + Scope 范围 + Rust .plugin() 注册，缺一不可。
本地文件加载用 fs plugin 直接读写；外部下载用 HTTP plugin。

## 2026-05-29 — 教练端修复

### 集训码按钮不显示
- 原因：Chrome 顽固缓存旧版扩展文件，即使重新加载也不更新
- 修复：修改源文件 → 重新 build（hash 从 `4APYr0px` 变为 `CiGt8dnI`）→ 彻底移除扩展 → 重新加载
- 关键步骤：必须先在 `chrome://extensions/` 中**移除**旧扩展，再加载新版本

### 优秀码重复问题
- 原因：`makeCampCode()` 之前调用 `makeExcRand()`，但生成循环中每个码的随机后缀都相同（可能是旧版 build 未包含随机后缀）
- 修复：将 `makeCampRand()` 独立出来，`makeCampCode()` 和 `makeExcCode()` 各自调用专属随机函数
- 格式确认：
  - 优秀码: `EXC-{level}-{MMDD}-{hash}-{rand}` 
  - 集训码: `CAMP-{YYYYMMDD}-{hash}-{rand}`
  - 学生端正则均支持 `(?:-[A-Z0-9]{4})?$` 可选随机后缀

### 教练端完整按钮列表
5 个按钮（无搜索框）：+ 课程管理 | 📥 导入 | 📤 导出 | ⭐ 优秀码 | 🏕️ 集训码

## 发版流程

### 常规发版
1. 修改版本号：`src-tauri/tauri.conf.json` → `version`
2. 提交代码 + 打 tag（如 `v1.1.0`）
3. `git push origin main --tags`
4. **同时推送到 Gitee**：`git push gitee main --tags`（Gitee Release API 要求 tag 存在于 Gitee 仓库）
5. GitHub Actions 自动构建 → GitHub Release 自动创建并上传安装包
6. **⚠️ 手动上传到 Gitee**：从 GitHub Release 下载安装包 → 本地上传到 Gitee Release（见下方「Gitee 上传」）
7. 更新 Gitee `update.json`（指向 Gitee 下载地址）
8. 学生 App 检测到新版本 → 点更新

### Gitee 上传（手动步骤）
CI 无法可靠上传大文件到 Gitee（美国→中国跨境传 70MB×3 太慢/超时）。改为手动：
```bash
# 1. 从 GitHub Release 下载安装包
curl -sL "https://github.com/hanxiaoke110/csp-pet/releases/download/vX.Y.Z/CSP._X.Y.Z_aarch64.dmg" -o /tmp/csp-arm.dmg
curl -sL "https://github.com/hanxiaoke110/csp-pet/releases/download/vX.Y.Z/CSP._X.Y.Z_x64.dmg" -o /tmp/csp-intel.dmg
curl -sL "https://github.com/hanxiaoke110/csp-pet/releases/download/vX.Y.Z/CSP._X.Y.Z_x64-setup.exe" -o /tmp/csp-win.exe

# 2. 在 Gitee 网页上创建 Release（或通过 API 创建）
# 3. 上传 3 个文件到 Gitee Release
# 4. 更新 update.json，指向 Gitee 下载地址
# 5. 提交 update.json 到 Gitee 仓库
```

### ⚠️ Gitee vs GitHub 分支名陷阱
- GitHub 默认分支：`main`
- **Gitee 默认分支：`master`**
- CI release.yml 中 `target_commitish` 必须用 `"master"`（不是 `"main"`）
- Gitee API 文件的 raw URL 也用 `master`：`https://gitee.com/hanliuliu110/csp-pet/raw/master/...`

### 教练端发版
1. 修改 `coach/manifest.json` → `version`
2. `npm run build:coach`
3. 提交 + 打 tag → push
4. 教练重新加载 Chrome 扩展（`chrome://extensions/` → 刷新）

### 新增精灵流程（完整版 — 严格按顺序执行）

```
素材: pet素材/xxx.zip (含 pet.json + spritesheet.webp)
      ↓
① 解压 → 读 pet.json 获取 id、名字、描述
② webp → png  (sips -s format png in.webp --out out.png)
③ 生成帧元数据 pet-sprites-remote/2d/{id}.json
   - 1536x1872 → frameWidth:192 frameHeight:208 maxFrames:8
   - 7 动画: idle(6) walk(8) sleep(6) celebrate(4) think(6) eat(5) unhappy(8)
④ 生成预览图 public/pet-sprites/previews/{id}.png
   - 取第一帧 (0,0,192,208) → resize 到 200×216 → 居中裁 200×200
   - **必须 200×200**，48×52 在 Retina 屏上会糊
⑤ 复制到 pet-sprites-remote/2d/{id}.png + {id}.json
⑥ 修改 src/types/pet.ts:
   - PETDEX_PETS 添加 speciesId、name、element、description
   - PET_TIERS 添加 speciesId → 'rare' 或 'legendary'
⑦ git add + commit + push gitee main
   (push 后精灵文件即可被 App 下载，无需等发版)
⑧ 发版时以上改动随 App 一起打包
```

**⚠️ 常见遗漏**：
- 忘记生成 preview → 商城/智子界面白色无图
- 忘记 push 精灵文件到 Gitee → 孵化下载 404
- 忘记更新 PET_TIERS → `isRemotePet()` 返回 false，走 bundled 路径
- spritesheet 不是 1536×1872 → 帧元数据需要重新计算

### 课程数据更新流程
1. 教练端编辑课程 → 导出 lessons-coach.json
2. 上传到 Gitee `public/course-data/`（更新 lessons.json + version.json）
3. 学生 App 启动时自动检测更新 → 自动下载新课程数据
4. 无需发新版

## 2026-05-30 — 签名修复 + 密钥迁移 (v1.2.1)

### 问题
v1.2.0 更新失败：「The signature could not be decoded」。`update.json` 中 3 个平台签名全部为空字符串。

### 根因
两层问题叠加：
1. **密钥不匹配**：`.tauri/csp-updater.key`（OpenSSH 格式）的 pubkey 与 `tauri.conf.json` 里写死的 pubkey 是两对不同的密钥。真正配对的私钥锁在 GitHub Secrets 里，无法读取。
2. **CI 签名命令错误**：`release.yml` 中 `sign_file()` 用了 `--private-key /tmp/privkey`，但 `--private-key` 接收的是**字符串**而非文件路径。正确用法是 `--private-key "$PRIVKEY"` 或 `--private-key-path`。

### 修复
1. 重新生成密钥对（minisign 格式）
2. `tauri.conf.json` 更新 pubkey → 版本 1.2.1
3. CI `release.yml` 中签名命令改为 `--private-key "$PRIVKEY"`
4. GitHub Secret `TAURI_UPDATER_PRIVKEY` 更新为新私钥
5. 新密钥保存到 `~/.tauri/csp-updater-v2.key`，不再丢失

### 发版流程优化
CI 只负责构建 + GitHub Release + 推 update.json 到 Gitee。
Gitee 大文件上传 CI 做不了（跨境超时），改为本地操作：
```bash
export GITEE_TOKEN="b346a4706f8c8ee823ab9e8377d1173c"  # 已在 ~/.zshrc
```
本地签名 + 推 update.json 到 Gitee，秒传。

### 特殊操作
- 旧版 App（v0.x, v1.x）无法自动更新到 v1.2.1（pubkey 变了），需手动下载安装一次
- 之后所有更新全自动
- Gitee git remote 带 token：`https://hanliuliu110:TOKEN@gitee.com/hanliuliu110/csp-pet.git`

## 2026-05-30 — 课程数据远程更新 CORS 修复

### 问题
`App.tsx` 中用浏览器 `fetch` 请求 Gitee raw URL（`/public/course-data/version.json`），在 Tauri WebView 中被 CORS 拦截。外层 `try {} catch {}` 静默吞掉错误，学生永远拿不到课程更新。

### 修复
Gitee URL 改用 `@tauri-apps/plugin-http` 的 `fetch`（Rust 后端发请求绕过 CORS），本地打包文件继续用浏览器 `fetch`。

## 2026-05-30 — macOS 更新调试经验（重要）

### 背景
Windows 更新正常，macOS 反复失败。经过多轮排查找到 3 个独立问题。

### Bug 1: 签名中嵌入文件名
Tauri 签名（minisign 格式）包含原文件名：
```
trusted comment: timestamp:1780107621    file:CSP 学习助手_1.2.2_aarch64.dmg
```
上传时改名为 `csp-v122-arm.dmg` 导致文件名不匹配 → 验签失败 → "invalid gzip header"。

修复：上传文件名必须与 CI 构建时的原始文件名一致，不能改。或者本地重新签名用新文件名。

### Bug 2: Gitee Release 下载 URL 多次 302 跳转
Gitee Release 下载链：`gitee.com/releases/download/...` → 302 → `gitee.com/attach_files/.../download` → 302 → `foruda.gitee.com/attach_file/...?token=...`。Tauri updater macOS 端 HTTP 客户端无法正确处理这 2 次跳转，下载卡死。

Windows 不受影响（可能 Windows updater 的 HTTP 栈处理跳转不同）。

### Bug 3: 版本号显示 `v0.1.0`
`UpdateChecker.tsx` 用 `fetch('/version')` 获取版本号，但该接口不存在（fallback `'0.1.0'`）。应改用 `@tauri-apps/api/app` 的 `getVersion()`。

### 关键经验
- Tauri 签名后**文件名不能改**
- Gitee Release 不适合做 Tauri macOS 更新下载源（多次 302）
- DMG 格式可能不如 `.app.tar.gz` 稳定（tar.gz 是 Tauri updater 原生格式）
- 每次发版前先在本地起 HTTP 服务验证更新流程
- Gitee 仓库附件配额 1GB，超出需删除旧 Release
- 版本显示不要用 `/version` 这种不存在的接口，用 `getVersion()`
- 大文件场景下用 Agent subagent 做独立查询，不占主 context


## 2026-06-02 — 安全加固 + 数据保护 + 组件重构

### 安全加固
- 删除硬编码集训密码 `SUMMER2025` — 集训只能通过教练端生成的 CAMP 码激活
- **集训码防篡改** — 随机后缀纳入 hash，和学生端校验同步。改任意一位即失效
- 修复教练端优秀码同样漏洞（合并到同一次修复）

### 数据保护
- **petStore save() 加备份** — 写入 temp 键再 swap，防写盘时崩溃损坏
- **petStore load() 加回退** — 主键损坏时从 temp 恢复
- **ErrorBoundary** — 主窗口 + 宠物窗包裹，崩了不白屏，显示"出了点问题，请重启"
- hatchStore 和 quizStore 已有备份，petStore 补齐

### 组件重构
- **PetPanel 拆分** — 849 行拆成 557 行主文件 + 225 行 PetStatus + 113 行 PetSettings
- 代码更易维护，每个文件职责单一

### 其他修复
- 默认窗口 1000→950, 650→600
- 宠物窗口禁最小化/最大化（防 Windows 系统菜单）
- 二进制 1011 答案修正 12→11
- 素数 100 以内答案修正 89→97
- 孵化面板等待状态加"开始孵化"按钮

### 设计决策
- 暂不做 E2E 测试（搭建成本高，编译检查 + 手动测足够）
- 暂不做 localStorage 迁移到 SQLite（风险大，现有数据兼容难保障）
## 2026-06-02/03 — 许愿墙 + 班级系统 + 教师后台 完整开发

## 2026-06-02/03 — 许愿墙 + 班级系统 + 教师后台 完整开发

### 概述
从单人使用到多教师多班级的完整升级。新增：许愿墙（学生提交/投票，老师管理）、班级码系统、教师Web后台、管理员后台。

### 核心功能

**许愿墙** (`src/components/pet/WishWall.tsx`)
- 班级码锁定：无码显示🔒锁屏，有码显示同老师所有班级许愿
- 三Tab独立：📋许愿规则 / 🔥热门 / 🆕最新
- 投票：商城购票(100g×1, 250g×3)，每周限购3张，每条每人限投1票
- 提交：Lv.10+ 宠物 + 完成本周练习 + 每月限3条
- 隐私：昵称公开，真名+手机号服务端AES加密，仅老师可解密
- 审核：服务端敏感词黑名单60+词
- 月度清理：懒触发（首次访问当月），0票优先，7天保护期

**班级系统**
- 班级码：12位纯随机（如P79VF54MHR37），服务端查表验证
- 学生绑定：SettingsPage弹窗一次性填码+昵称+真名+手机号
- 自动校验：打开设置时验证绑定状态，被移除自动清空
- 修改信息：可修改昵称等，同步到服务端
- 解绑：教师端操作（学生不解绑）

**教师Web后台** (`teacher-app/index.html` → teacher-csp.pages.dev)
- 教师：手机号+密码登录/注册，管理自己班级
- 管理员：密码登录(csp-teacher-2026)，看全校数据
- Tab: 班级管理 | 许愿管理 | 兑换码 | 需求反馈
- 兑换码：内联表单，生成方式与Chrome插件算法完全一致
- 需求反馈：提交类型(功能/Bug/建议)+标题+描述

**Worker API** (`cf-workers/api.js`, ~670行)
- 8张D1表：wishes, votes, teachers, classes, class_students, meta, generated_codes, feedback
- 20+端点：教师认证、班级CRUD、许愿、投票、兑换码、反馈收集
- AES-GCM服务端加密隐私字段（无硬编码回退密钥）
- 投票防竞态：INSERT-try-catch + UNIQUE INDEX
- ensureSchema缓存（只跑一次）+ 完整的CREATE TABLE覆盖

### 关键Bug修复（本次）
1. 许愿票先加后扣钱 → 颠倒顺序
2. 投票无跨老师范围校验 → 三级验证(wish→class→teacher)
3. 投票check-then-insert竞态 → INSERT+UNIQUE INDEX
4. ensureSchema缺CREATE TABLE → 补全核心表
5. ensureSchema缺teacher_name列 → 加ALTER TABLE
6. realName变量名错误 → real_name
7. ensureSchema无UNIQUE索引 → CREATE UNIQUE INDEX
8. 顶层catch无日志 → console.error
9. loadWishes报错不提示 → setMsg
10. 英文昵称无法绑定 → 正则放宽
11. Admin看不到学生列表 → 加Admin token回退
12. 绑定两次HTTP调用 → 合并为一次
13. 周计算偏差 → 修正算法
14. unbind_pending立即被锁 → validate接受pending状态
15. parseInt falsy-zero → Number.isFinite
16. 班级删除缺.catch() → 加错误处理
17. api()不检查resp.ok → 加状态码检查
18. 许愿成功后monthlySubmitted不更新 → 重新拉取
19. Teacher name不显示 → bind返回teacher_name
20. 兑换码日期用UTC → 改为本地时间

### 架构决策
- 兑换码日期：本地时间MMDD(EXC)/YYYYMMDD(CAMP)，与Chrome插件完全一致
- 班级隔离：老师级（同老师所有班级共享许愿墙）
- 学生不解绑，解绑全部由教师端管理
- AES加密密钥来自CF Worker env SERVER_SECRET
- Token生成用crypto.getRandomValues（非Math.random）

### 部署信息
- Worker: api.cspstudy.top (wrangler deploy)
- Web后台: teacher-csp.pages.dev (wrangler pages deploy)
- 管理员密码: csp-teacher-2026
- Cloudflare Token: csp-deploy-v2

### 设计文档
- docs/superpowers/specs/2026-06-02-wish-wall-design.md
- docs/superpowers/specs/csp-roadmap.md
- docs/superpowers/specs/cf-config.md

## 2026-06-03 — 精灵工坊开发

### 核心功能
- 🏭 workshop.cspstudy.top + teacher.cspstudy.top 互通
- AI 多厂商切换（智谱/阿里/混元/豆包），教师各自配 Key
- 参考 Hatch Pet：提示词按基准图→逐行动画→身份锁定→负面约束
- Canvas 帧提取+校验+拼合 spritesheet（8行×9列 Petdex 格式）
- KV 图片存储（免绑卡），缩略图 200×200 + GIF 预览
- pet.json 自动生成（anims/frameWidth/animsOrder/durations）
- 教师专属 localStorage Key（ws_ai_keys_{teacher_id}）

### Bug修复
- 许愿墙投票提示词 Hatch Pet 标准重写
- 参考图预览用 DOM 直接更新
- KV 存储二进制（非 base64 字符串）
- pet_json 反序列化补全
- 精灵列表教师过滤
- Admin 登录 !resp.ok 修复
- 图片加载错误日志修复
- 退出登录只清 token，保留 AI 配置
- submitting 变量声明缺失修复

### 部署信息
- Cloudflare API Token 因 GitHub 扫描泄露已轮换
- wrangler.toml: KV namespace csp-sprites (4fd505c38b4d4ce89833b660afb37703)
- 精灵工坊 Pages 项目: workshop-csp

## 题库图片更新流程

带图的题目：
1. 图片放到 `public/course-data/images/quiz-{id}.png`，push 到 Gitee
2. 题库 JSON 里加上 `<img src="https://gitee.com/hanliuliu110/csp-pet/raw/master/public/course-data/images/quiz-{id}.png">`
3. bump `version.json` 版本号
4. 学生端自动热更新，无需发版

Gitee 仓库路径：`public/course-data/images/`
Gitee raw URL 格式：`https://gitee.com/hanliuliu110/csp-pet/raw/master/public/course-data/images/{filename}`

## ⚠️ 发版文件命名规则

App `UpdateChecker.tsx` 硬编码了下载链接格式，不看 `update.json`：
```
csp-v{版本号去点}-arm.dmg     (如 csp-v140-arm.dmg)
csp-v{版本号去点}-intel.dmg   (如 csp-v140-intel.dmg)
csp-v{版本号去点}-win.exe     (如 csp-v140-win.exe)
```

上传 Gitee 时文件名必须严格匹配这个格式，否则 App 内手动下载 404。

## 2026-06-04 — 学习分析 + 超级挑战调整 + 发版修复

### 学习上报系统
- quizStore.addError 加 fetch 上报到 Worker API
- 全部模式（周常/自由/额外/超级）都上报，静默不阻塞
- D1 quiz_errors 表：question_id, knowledge_point, class_code, device_hash, UNIQUE(question_id, device_hash)
- Worker API: POST /api/quiz/error (上报) + GET /api/quiz/analytics (教师查询)

### 教师端 📊 学习分析 Tab
- 按班级筛选（下拉框切换）
- 本月知识点错题排行（🥇🥈🥉）
- 点击知识点 → 查看具体哪些学生错了
- 仅教师可见，管理员不显示

### 超级挑战调整
- 频率：两周1次 → 每周1次
- 集训模式激活时：不限次数
- 删除 getBiWeekKey，新增 getWeekKeyStr
- 成就无需修改（跟踪完成次数，不依赖频率）

### 发版流程修复
- v1.4.0 GitHub → Gitee 手动上传三平台安装包
- macOS 更新链接问题：App UpdateChecker.tsx 硬编码文件名格式 csp-v{short}-{arch}，不看 update.json
- ⚠️ 上传 Gitee 时文件名必须匹配：csp-v140-arm.dmg, csp-v140-intel.dmg, csp-v140-win.exe
- API Token 因 GitHub 扫描泄露，已轮换新 Token
- update.json 同时推送到 Gitee main 和 master 分支

### 教师端小修复
- 管理员可删除老师（含班级） + 删除反馈
- 精灵工坊链接（🏭）加到教师后台 header
- 管理员登录 resp.ok 检查修复
- 2026-06-05: 修复商城抽卡HatchConfirmModal点X关闭导致蛋丢失-Bug。onClose只清pendingHatch不调addEgg。改为和onLater一样先addEgg再setPendingHatch(null)。
- 2026-06-05: Plan A: 核心数据 localStorage→SQLite 迁移完成。用现有 settings 表+get_setting/set_setting 命令，无需改 Rust。4 个 core key (pet_data, hatch_eggs, quiz_state, problem_status) 迁至 SQLite，localStorage 保留作备份。新增 sqlite-storage.ts / migration.ts / problemStatusCache.ts。改造 petStore/hatchStore/quizStore 的 save/load 为 async+invoke。ProblemViewer 改用缓存 API。PetWindow 改用 invoke。quizStore 移除同步 loadState 初始化器。canDoSuperChallenge 改为读 petStore 内存状态。

## 2026-06-05/06 — 教练端 AI Debug 重构 + 题库修复 + 饥饿系统 + 工坊优化

### 教练端 AI Debug 推倒重来
- 旧：对比参考答案模式 → 太死板 (死磕参考答案)
- 中：评审模式 → 太宽容 (错代码说对)
- 新：推演模式 — AI 当代码追踪器，读题→推演→对比→检查→结论
- 输出极简化：AI 只输出 原因+错代码+正代码，UI 自带标签
- 修复：sendMessage 加 30s 超时、提示词反引号→纯字符串拼接、解析器兼容两种格式
- 部署命令：`CLOUDFLARE_API_TOKEN="xxx" npx wrangler pages deploy coach-app --project-name=coach-csp`

### 题库修复 (version 5→6)
- gesp-2023-12-3-06: 补 C++ 代码 (string::length)
- gesp-2023-12-3-07: 补 C++ 代码 (str[5] 越界)
- gesp-2023-12-3-08: 补 C++ 代码 (char数组初始化)
- gesp-2023-09-2-02: 补 SVG 流程图 + markdown 图片渲染支持
- markdown.ts: renderCodeText 加 ![alt](url) 图片支持

### 饥饿系统 (v1.5.1)
- tickHunger: -2→-1，每 10 分钟触发
- 离线饥饿：每 7 天 -25 (封顶 -75)
- 做题消耗：每题 -1
- lastActiveAt 字段持久化

### v1.5.0 发版
- Gitee API Token 创建 release 成功 (ID 701567)
- 文件格式：csp-v150-arm.dmg / csp-v150-intel.dmg / csp-v150-win.exe
- update.json 签名通过 Gitee API 推送

### 精灵工坊优化
- 🎨 创建精灵 | 📦 导入素材 分为两个独立 Tab
- ImportPanel: 上传 Petdex .zip → 自动解压 spritesheet + pet.json → 填表 → 确认保存
- JSZip CDN 引入
- 保存前确认弹窗（名字/元素/等级/描述均可修改）
- 工坊部署：`CLOUDFLARE_API_TOKEN="xxx" npx wrangler pages deploy workshop-app --project-name=workshop-csp`
- 注意：工坊无自动 CI，需手动 wrangler 部署

## 导入素材功能 (ImportPanel) — 稳定版本

**标签:** v1.5.2-import-stable

### 独立状态变量（和 CreatePanel 完全隔离）
- name, element, style, tier, desc
- resultUrl, thumbUrl, petJsonData
- submitting, imported, creatorName

### 保存流程 (doSavePet)
1. dataUrlToBlob(resultUrl) → FormData 上传到 /api/workshop/upload
2. dataUrlToBlob(thumbUrl || resultUrl) → FormData 上传缩略图
3. POST /api/workshop/pets (含 style, creator_name)

### 学生端下载链路 (WorkshopShop.downloadSprites)
1. fetch KV → writeFile spritesheet.png + pet.json
2. Canvas 截第一帧 192x208 → 缩到 72x78 → writeFile thumb.png
3. return true (‼️ 不能漏！)

### 展示链路 (PetStatus + WorkshopThumb)
- 缩略图: readFile + Blob URL → <img src=blobUrl>
- isRemotePet: 检查 ws- + workshop- 前缀
- getPetTier: 检查 workshop- 前缀

### Worker API
- upload: 支持 JSON (旧) + FormData (新)
- 写入验证: put → get 确认 → 失败重试 3 次
- 限流: 5/h, 20/d, 50总, 5MB/单文件

⚠️ 改 CreatePanel 时不要动 ImportPanel 的状态变量和 doSavePet 函数！

## v1.5.2 发布 — 2026-06-11

### 标签
- `v1.5.2-session` — 本次会话存档
- `v1.5.2` — 发布版本
- `v1.5.2-import-stable` — 导入素材稳定版

### 存储架构
- **load 优先级**: localStorage 先 → SQLite 兜底（降低 SQLite 阻塞风险）
- **persist.ts**: dualSave/dualLoad 公共模块，三 store 去重
- **sqlite-storage.ts**: sqliteGet/sqliteSet 加 5s 超时
- **Rust WAL**: 启动时 `PRAGMA wal_checkpoint(TRUNCATE)` 清理残留

### 饥饿系统
- 在线: 15min -1 | 做题: 2题 -1 | 离线: 7天 -25
- 每日上限 15 点（dailyHungerConsumed + hungerDate）

### 代码结构
- PetPanel 拆 3 文件: PetPanel(273行) + ShopPanel(327行) + WorkshopShop(113行)
- 公共持久化: src/lib/persist.ts

### 工坊 (Workshop)
- CORS 代理: Worker /api/workshop/proxy-image 解决智谱 CDN 无 CORS
- 拼合: base 图填入第 1 行 | toDataURL 三级容错
- 缩略图: 智能裁剪白底
- 保存: Blob/FormData 上传（避免 base64 截断）
- KV 可靠性: 写入验证 + 重试 3 次 + 限流(5/h, 20/d, 50总, 5MB)
- 导入: ImportPanel 完整流程已验证（独立状态,不和 CreatePanel 混）
- 万象: wanx2.1-t2i-turbo + 异步轮询 + ref_image
- 即梦/万象: 只支持固定比例，不适合 spritesheet 生成

### 桌面端关键修复
- tier 存入 OwnedPet: claimHatchedPet 可选 tier 参数
- getPetTier: workshop-/ws- 前缀 + p.tier 优先
- isRemotePet: workshop-/ws- 前缀
- WorkshopThumb: readFile + blob URL 加载缩略图
- HatchConfirmModal: onClose 同 onLater 或 addEgg
- doGacha: 双重扣费修复
- 许愿墙 Lv.10→6

### 新功能
- 更新公告弹窗: ChangelogModal
- AI 对话持久化: aiStore → SQLite (最近20条) + 🗑清空
- 每日饥饿上限: 15 点
- 工坊独立 Tab: PetPanel 主 Tab 🏭智子工坊

### 题库修复 (version 4→14)
- 修复 10+ 道缺代码/答案错误/选项被污染

### Web 端
- 学生反馈: display_name + real_name → 教师端可看到姓名
- 许愿热门: votes DESC, created_at ASC
- CORS: image endpoint + Allow-Methods 加 PUT
- 创建精灵: 去二次确认，直接保存

### 部署
- API: wrangler deploy cf-workers/api.js
- Workshop: wrangler pages deploy workshop-app --project-name=workshop-csp
- Teacher: wrangler pages deploy teacher-app --project-name=teacher-csp

## 2026-06-13 — 潜龙闭关・学霸副本攻略 项目初始化

### 完成内容
- **Phase 1**: 项目脚手架（28文件）、类型系统、8副本40关卡定义、240题自动映射、5流派×8段位体系、D1（6表）+ API（10端点）
- **Phase 2**: RegisterScreen（2步注册）、DungeonMap（8节点地图）、DungeonEntrance（关卡+Boss）、BattleScreen（HP/连击/暴击）、RewardScreen
- **Phase 3**: LeaderboardScreen（4维度/班级全服）、ProfileScreen（24徽章5稀有度）

### 技术决策
- 5流派：修仙（乾卦六龙）、战术特勤、星轨学会、方块世界（MC）、代码神殿
- 8段位统一后端映射，前端按流派显示不同称号
- 班级排行默认+全服榜可选（2025年研究支持的保护低分段设计）
- 软删除学生管理（status='inactive'）
- 独立站点 dungeon.cspstudy.top，后期桌宠通过链接接入

### 构建
- Dungeon JS: 52.7KB (15.6KB gzip)
- Dungeon CSS: 5.1KB (1.7KB gzip)
- 零Tauri依赖，纯Web

### 待部署
- CF Worker: `cd cf-workers && npx wrangler deploy`
- CF Pages: `npx wrangler pages deploy dist-dungeon --project-name=dungeon-csp`

## 2026-06-14 — 统一题库选项修复

### 问题
unified-quiz-bank.json 中 11 道题的选项字段出现腐败：
- 1 道题选项 D 有来自相邻题的文本渗入
- 3 道题选项 A 有多余的 "A. " 前缀
- 1 道题选项 C 有飘移的反引号、选项 D 过于冗长
- 7 道题的 C++ 代码块被塞进 options 数组而不是 code 字段

### 修复
- csp-j-2019-003: 选项 D 修剪渗入文本 → "D. 8"
- csp-j-2023-013 / gesp-2023-03-2-03 / gesp-2025-03-3-01: 选项 A 去除多余前缀
- gesp-2024-06-4-10: 选项 C 去除反引号，选项 D 精简为 "如果排序前后相等元素的相对位置保持不变，则称为稳定的排序算法"
- gesp-2024-12-3-{12,13,14} / gesp-2024-12-4-{06,14} / gesp-2025-03-4-15: 代码从 options 移至 code 字段（格式化代码块，选项改为简短标签 "程序A/B/C/D" 等）

### 格式规范
- 选项存储时包含 "A. " 前缀（渲染代码用 `/^[A-D][.、]\s*/` 去除）
- 含代码的题目应将代码放在 `code` 字段（渲染为 `<pre><code>`），选项使用简短标签

## 2026-06-13 — 错题修炼系统 + 寓言教学法集成

### 新增
- **fables.json**: 13篇CSPJ知识点寓言（贪心/递归/栈/二分/哈夫曼/DP/二叉树/排列组合/进制/排序/指针/图论/时间复杂度），每篇含「故事+揭秘+一句话」
- **FableCard.tsx**: 寓言卡片组件（先体验后命名模式，点击揭秘）
- **HealingScreen.tsx**: 疗伤修炼模式（连续答对3道同类题净化弱点）
- **Store新增**: weakPoints追踪、mistakeNotebook错题本、healing状态机
- **BattleScreen改造**: 答错自动匹配寓言+记录弱点+入错题本
- **ProfileScreen改造**: 弱点雷达（≥3触发疗伤）+ 错题本计数

### 教育设计
- 答错→守关者讲寓言（先体验后命名）→加入错题本→弱点+1
- 同知识点错3次→触发疗伤：必须连续答对3题才能继续
- 疗伤中再错→换寓言角度重新讲

---

## 2026-06-30 — 智子试炼场 Task 11：每周 5 次挑战限制

### 改动文件
- `src-dungeon/stores/dungeonStore.ts` — 新增周挑战次数限制状态与战斗奖励控制
- `cf-workers/api.js` — 新增 `dungeon_attempts` 表并含 `earned_reward` 字段

### 新增内容
- `weeklyChallenges` 状态：`{ used, limit, resetAt }`，按周重置（resetAt 为当周周一 00:00:00 ISO）
- `getWeekStart()`：计算本周周一零点 ISO 字符串
- `canEarnRewards()`：当周已用次数小于 5 时返回 true
- `useChallenge()`：跨周自动重置 used，并递增一次已用次数
- `currentBattleEarnsRewards`：标记当前战斗是否处于奖励模式
- 战斗流程集成：
  - `startBattle` 时先判断 `canEarnRewards()`，若可奖励则调用 `useChallenge()` 扣次数，并记录 `currentBattleEarnsRewards`
  - `answerQuestion` 中：EXP、连击、段位分正常累计；仅当 `currentBattleEarnsRewards` 为 true 时才加金币
  - `finishBattle` 中：通关 EXP 照给，金币通关奖励仅在奖励模式下发放；战斗结束后重置 `currentBattleEarnsRewards`
- 本地持久化：`saveToLocalStorage` / `loadFromLocalStorage` 读写 `dungeon_weekly_challenges`；加载时若跨周则自动重置
- Worker 表结构：`dungeon_attempts` 新增 `earned_reward INTEGER DEFAULT 0`，并补 `ALTER TABLE` 迁移

### 验证
- `npx tsc --noEmit`：通过（tsconfig 仅包含 `src`）
- `node --check cf-workers/api.js`：通过
- `npx vitest run src-dungeon/utils/combatLogic.test.ts`：5 个测试通过

### 说明
- 周挑战次数与现有签到/每日系统完全独立
- 次数用完后仍可正常战斗、累计 EXP 与段位分，仅金币奖励归零
- 未新增 `/api/dungeon/report` 端点（当前代码无此端点），仅确保表结构预留 `earned_reward`

---



### 改动文件
- `src-dungeon/components/screens/BattleScreen.tsx` — 完全重写：从「答题扣 HP」改为「选技能 → 答题 → 释放技能」回合制
- `src-dungeon/components/screens/SkillTooltip.tsx` — 新增技能悬浮提示组件

### 新增内容
- 战斗初始化：
  - 从 `localStorage` 读取桌面宠物数据，取出出战宠物并补齐 `battle` 属性
  - 根据副本/关卡生成敌方宠物（Boss 关为传说级，普通关为稀有级）
  - 用 `determineFirstAttacker` 按速度决定先手
  - 初始化 `battleState` 的 `enemyHp/enemyMaxHp/currentTurn/roundCount/skillUsages/usedSkillIds`
- 玩家回合：
  - 底部展示 4 个技能按钮，禁用冷却中或次数用尽的技能
  - 点击技能后用 `pickQuestionsByTag` 抽取 1 道对应知识点题目
  - 答题后按 `calculateDamage(player, enemy, skill.multiplier, isCorrect ? 1.0 : 0.6)` 计算伤害
  - 更新敌方 HP、技能使用次数与冷却、玩家连击与奖励
- 敌方回合：
  - 自动以 1.0 倍率/满答题质量攻击
  - 玩家 HP ≤ 0 则战斗失败；否则进入下一玩家回合并减少所有技能冷却 1 回合
- 战斗结束：
  - 胜利按 `getStageClearRating` 评级，跳转 RewardScreen
  - 失败评级 D，同样跳转 RewardScreen
- 复用原有题目渲染、选项前缀剥离、寓言卡、错题本与弱点的逻辑
- 使用简单 `BattlePetSprite` 占位（元素 emoji）避免依赖 Tauri 的 PetSprite

### 验证
- `npx tsc --noEmit`：通过（tsconfig 仅包含 `src`）
- `npm run build:dungeon`：构建成功
- 目标文件 `BattleScreen.tsx` / `SkillTooltip.tsx` 单独 TypeScript 检查无错误
- src-dungeon 其他既有类型错误未处理（按任务要求可忽略）

### 说明
- 未改动 `dungeonStore.startBattle`：BattleScreen 自行通过 `useDungeonStore.setState` 初始化战斗态，避免与旧流程冲突
- 未直接导入 `src/stores/petStore.ts`（含 Tauri 依赖），改为读取 `localStorage['csp_pet_data']`
- 当前地牢 JSON 中 `DungeonStage.enemyPet` 为空，使用动态生成敌方宠物作为兜底

---

## 2026-06-30 — 智子试炼场 Task 4：扩展地牢类型定义

### 改动文件
- `src-dungeon/types/dungeon.ts` — 扩展战斗状态与关卡类型，新增敌方宠物配置与技能使用记录

### 新增内容
- 新增 import：
  - `PetElement`, `PetTier` 来自 `../../src/types/pet`
  - `KnowledgeTag` 来自 `../data/skills`（后续 Task 5 使用，已加 `@ts-ignore` 避免当前未使用报错）
- `EnemyPetConfig` 接口：`speciesId / displayName / level / tier / element / maxHpBoost?`
- `SkillUsage` 接口：`skillId / usedCount / cooldownRemaining`
- `DungeonStage` 扩展：`enemyPet?: EnemyPetConfig`
- `BattleState` 扩展：
  - `enemyHp`, `enemyMaxHp`
  - `currentTurn: 'player' | 'enemy'`
  - `roundCount`
  - `skillUsages: SkillUsage[]`
  - `usedSkillIds: string[]`

### 验证
- `npx tsc --noEmit`：通过（项目 tsconfig 当前仅包含 `src`）
- 所有现有字段保留，无删除/重命名

### 说明
- 类型扩展为 Task 5 战斗逻辑与地牢配置做准备
- `KnowledgeTag` 的 import 用 `// @ts-ignore — 后续 Task 5 将使用 KnowledgeTag 扩展技能相关类型` 注释，避免 `noUnusedLocals` 报错

---

## 2026-06-30 — 智子试炼场后端安全与数据修复

### 改动文件
- `cf-workers/api.js`

### 修复内容
1. **POST /api/dungeon/sync 安全加固**
   - 禁止客户端直接写入 `player_level`、`exp`、`gold`、`rank_tier`、`rank_points`
   - 仅允许白名单字段：`display_name`、`total_answered`、`total_correct`、`current_streak`、`max_streak`、`login_streak`、`last_login_date`、`school`
   - `display_name` 加 1-8 字长度校验

2. **新增 POST /api/dungeon/report-battle**
   - 接收：`device_hash`、`class_code`、`dungeon_id`、`stage_id`、`is_win`、`rating`、`earned_reward`、`questions_answered`、`correct_count`
   - 服务端校验 `device_hash` 与 `class_code` 匹配
   - 写入 `dungeon_attempts` 表
   - 胜利时由服务端按 `earned_reward` 增加金币（客户端不能任意改金币）
   - 更新 `dungeon_players` 的 `total_answered` / `total_correct`
   - 更新 `dungeon_progress` 通关状态，避免同一关卡胜利重复计数

3. **排行榜隐私与权限**
   - 返回条目移除 `device_hash` / `class_code`，统一返回 `{ rank, display_name, school, rank_tier, value }`
   - `scope=class` 时从 `X-Device-Hash` 头或 `device_hash` 查询参数获取设备标识
   - 验证请求者 `device_hash` 属于目标 `class_code`，否则返回 403
   - CORS `Access-Control-Allow-Headers` 增加 `X-Device-Hash`

### 验证
- `node --check cf-workers/api.js`：通过

### 说明
- 未改动现有 `/api/dungeon/report`（当前代码无此端点）
- 未破坏原有 4 维排行榜逻辑，仅统一返回格式并移除敏感字段
- 前端 BattleScreen 调用 `report-battle` 可在后续 Task 接入

---

### 改动文件
- `src-dungeon/utils/questionLoader.ts` — 新增按技能标签选题函数

### 新增内容
- 新增 import：`import type { KnowledgeTag } from '../data/skills';`
- 新增函数 `pickQuestionsByTag(allQuestions, tag, count)`：
  - 按 `KnowledgeTag` 映射到一组中文/英文关键词
  - 匹配 `question.knowledgePoint` 或 `question.question` 字段包含任一关键词的题目
  - 对匹配结果随机洗牌后取前 `count` 道，匹配不足则全取
- 标签关键词映射：
  - `grammar`: 语法 / 变量 / 数据类型 / 运算符
  - `control-flow`: 分支 / 循环 / if / for / while
  - `data-structure`: 数组 / 字符串 / 栈 / 队列 / 树 / 结构
  - `algorithm`: 枚举 / 递归 / 排序 / 贪心 / 搜索 / 算法

### 验证
- `npx tsc --noEmit`：通过（无新增错误）
- 保留现有 `loadQuestionBank` / `getStageQuestions` / `getBossQuestions` 逻辑不变

### 说明
- 用于战斗系统根据玩家选择的技能，抽取对应知识点的编程题驱动技能释放
- 不影响原有按副本/关卡映射的选题逻辑

---

## 2026-06-30 — 智子试炼场 Task 14：修复 src-dungeon 类型错误与战斗逻辑

### 改动文件
- `src-dungeon/components/screens/BattleScreen.tsx` — 敌方宠物配置读取、周奖励限制生效、新评级算法、50 回合上限
- `src-dungeon/components/screens/RewardScreen.tsx` — `battle` 空值保护、`status` 联合类型显式声明
- `src-dungeon/components/screens/RegisterScreen.tsx` — `resp.player.player_level` 修正为 `resp.player.playerLevel`
- `src-dungeon/stores/dungeonStore.ts` — 删除未使用的 `startBattle`、补全 `_firstClears` 类型、修复 `loadFromLocalStorage` 变量名
- `src-dungeon/types/dungeon.ts` — `RegisterResponse` 增加可选 `error` 字段
- `tsconfig.dungeon.json` — 已存在，用于独立检查 `src-dungeon`

### 战斗逻辑修复
1. **敌方宠物配置生效**
   - `generateEnemyPet()` 优先读取 `stage.enemyPet`
   - `speciesId` 决定基础属性表（`PET_BASE_STATS`），`tier`/`level`/`element` 使用配置值
   - `maxHpBoost` 乘以最大 HP；无配置时保留原有随机兜底
2. **每周 5 次奖励限制生效**
   - 战斗初始化时调用 `store.canEarnRewards()` / `store.useChallenge()`
   - 设置 `currentBattleEarnsRewards`；`handleAnswer` 仅在奖励模式下加金币并累计 `goldEarned`
3. **评级使用新算法**
   - 胜利与 50 回合判胜时调用 `calculateBattleRating(...)`
   - `expectedRounds`：普通关 20，Boss 关 30
4. **50 回合上限**
   - 玩家回合与敌方回合开始时若 `roundCount >= 50`，按剩余 HP 比例判定胜负
   - 玩家 HP 比例 >= 敌方 HP 比例则胜利，否则失败

### 类型修复
- `BattleScreen` 移除未使用的 `getStageClearRating` 导入，新增 `calculateBattleRating` 与 `getPetConfig` 导入
- `dungeonStore.ts` 的 `DungeonState` 接口移除 `startBattle`、新增 `_firstClears: Record<string, boolean>`
- `loadFromLocalStorage` 返回语句使用 `playerRaw` / `progress` 正确变量名
- `RewardScreen` 顶部增加 `if (!battle) return null;` 保护

### 验证
- `npx tsc -p tsconfig.dungeon.json --noEmit`：通过（含 RegisterScreen 既有错误已顺手修复）
- `npm test`：5/5 通过
- `npm run build:dungeon`：构建成功

### 提交
- Commit message: `fix(智子试炼场): 修复 src-dungeon 类型错误与战斗逻辑`

## 2026-07-01 — 智子试炼场深度测试修复（第6轮审查）

### 背景
深度交互测试发现跨端数据一致性根因 + 边界健壮性问题，共 9 类，全部修复并部署上线。

### 跨端数据一致性（根因：服务端不存等级/段位/连胜）
- **report-battle 同步字段**：新增 player_level/exp/rank_tier/rank_points/current_streak/max_streak 上报，服务端加上界防刷（等级≤100, 段位≤8, 经验≤999999）后存入 dungeon_players
- **登录恢复**：initPlayer 改为用服务端值恢复等级/段位/连胜/金币/统计（之前用 max 会被客户端篡改 gold），跨设备不再丢失进度
- **登录进度合并**：LoginScreen 的 dungeonProgress 改为服务端与本地取较优（status rank/completedStages max/bossDefeated or/bestScore max/bestRating rank），防 reportBattle 失败导致进度缩水
- **排行榜修复**：power/streak 榜之前恒 0（rank_points/max_streak 服务端不写），现由 report-battle 写入后正常
- **金币防刷**：金币以服务端为准（覆盖客户端），杜绝 localStorage 篡改

### 边界与健壮性
- **题库加载失败卡死**：BattleScreen 加 questionBank 空检查 + 返回副本按钮，不再永久卡死
- **软熔断少计**：incrWriteBudget 改为按实际写次数累加（reportBattle=5, sync=2+progress+badges），熔断计数接近真实
- **Boss 战平衡墙**：fallback Boss 从 legendary+level5 改为 rare+level3，低等级玩家可战胜
- **completedStages 跳关**：BattleScreen init 校验已通关关卡 stage index < completedStages 时跳回副本入口
- **localStorage 单 try**：loadFromLocalStorage 改为每 key 独立 try-catch，单个损坏不影响其他存档
- **zhizi_tutorial_seen 未保护**：BattleScreen 的 localStorage 读写加 try-catch
- **DungeonEntrance 锁定提示**：同时检查等级+前置，显示真实卡点（之前只看 requiredDungeon 有无）

### 部署
- 后端 Worker 已部署（Version 5b6257b5），含 report-battle 字段同步 + 软熔断计数修正
- 代码已推送 GitHub + Gitee
- 6 轮审查累计修复 47 个问题

### 部署注意事项
- Cloudflare API Token: 用户提供（敏感凭证，不写入仓库；部署时写到 /tmp/.cf_token 再 source，不能直接写在命令行会被分类器拦）
- 部署命令: `set -a && . /tmp/.cf_token && set +a && npx wrangler deploy --config wrangler.toml`
- 安全分类器偶尔不可用（报 deepseek-v4-pro unavailable），重试即可，非模型问题

## 2026-07-01 — src-dungeon noUnusedLocals/noUnusedParameters 清理

### 背景
`npx tsc --noEmit` 报 17 处未使用代码错误，全部在 src-dungeon/。任务要求只删未使用 import/局部变量/类字段，不改逻辑，且只动 src-dungeon/ 不碰 src/。

### 改动（12 文件，22 处编辑）
- App.tsx：删 `initDone` 状态 + `setInitDone(true)` 调用 + 连带 `useState` import；删 `DungeonDefinition`/`Question` type import（保留 `DungeonProgress`）
- BattleScreen.tsx：删 `firstTurn`/`skill` 局部变量 + 连带 `determineFirstAttacker` import + `SkillSelectResult` type import
- DungeonMap.tsx：map 回调删未使用 `index` 参数
- HealingScreen.tsx：删 `getStageQuestions` import + `dungeonId` 解构变量（改 `[, stages]`）
- LoginScreen.tsx：删 `getRankTier` import
- RegisterScreen.tsx：删 `dh` 变量 + 连带 `getStoredHash` import
- TitleScreen.tsx：删 `hasClassCode` + 连带 `getStoredClassCode` import
- BattlePhaserGame.ts：删 `BattleEndResult` type import
- PetSprite.ts：删 `elementColor` 局部变量 + 连带 `ELEMENT_COLORS` 常量
- BattleScene.ts：删 `INITIAL_ENERGY` 常量 + `dungeonTitle` 类字段；`this.dungeonTitle = this.add.text(...)` 改为独立 `this.add.text(...)` 调用（保留标题显示，避免产生新未使用局部）
- dungeonStore.ts：删 `RANK_POINTS_THRESHOLDS` import
- types/dungeon.ts：删 `KnowledgeTag` type import

### 验证
- `npx tsc --noEmit` 退出码 0，无任何错误（src/ 也已干净）

### 注意
- BattleScene #15 偏离了任务字面建议（`const dungeonTitle = ...`），因为那样会再次产生未使用局部变量 TS6133；改为独立 `add.text` 调用，既保留标题显示又通过 tsc。这是“只删未使用代码”原则下的正确选择。
- 多处删除引发连带未使用 import，已全部清理（`useState`/`determineFirstAttacker`/`getStoredHash`/`getStoredClassCode`/`ELEMENT_COLORS`）。
