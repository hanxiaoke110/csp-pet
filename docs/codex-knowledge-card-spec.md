# Codex 任务规范：21 份知识卡生图 + 上传 + 权限验证

> **写给 Codex** — 由 Claude Code 准备，2026-07-10  
> **核心任务**：为 21 份飞书知识卡文档生成配图、上传、验证权限  
> **你的工具**：lark-cli（`--as user`，已登录，无需凭证）

---

## 一、背景

Claude Code 已完成所有工程工作：

| 完成项 | 状态 |
|--------|------|
| 21 份知识卡文档创建（飞书 Docx） | ✅ |
| 967/1023 题目→知识点映射 | ✅ |
| 桌宠 KnowledgePointHelp 组件（4 个答题入口） | ✅ |
| 救援索引页链接全部 21 张卡 | ✅ |
| 总导航结构调整（00→01→02→03→04） | ✅ |

**你需要做的**：为这 21 份知识卡文档生成配图、上传图片、填充内容、验证公开可读权限。

---

## 二、源素材

```
教学资料/CSP集训初赛补充物料/csp初赛重点知识卡片.xlsx
```

- 21 张竖版知识卡片源设计
- 约 40MB
- 9:16 竖版比例，暖色调（橙白为主）

---

## 三、生图规范

### 3.1 尺寸与风格

- **比例**：9:16 竖版（适合手机/平板竖屏浏览）
- **色调**：暖色系（橙、白为主），与桌宠整体风格一致
- **字体**：大号清晰字体（正文 ≥ 16pt，标题 ≥ 24pt）
- **代码**：统一使用等宽字体块（如 `Consolas`、`Source Code Pro`），**不要将代码做成图片**

### 3.2 内容结构（每张卡）

每张知识卡应包含：

1. **标题区**：知识点名称（如「二进制与位运算」）
2. **一句话摘要**：见下方表格中的 summary 字段
3. **核心概念图/示意图**：1 张主图（视觉化解释核心概念）
4. **关键公式/规则**：1-2 个最重要的公式或规则（文字，非图片）
5. **"最容易踩的坑"**：1 个最常见的易错点
6. **阶段标签**：C1/C2/C3/C4（小角标）

### 3.3 不要做的事

- ❌ 不要为每道题生成图片（只有 21 张主题卡需要配图）
- ❌ 如果 xlsx 中已有现成卡片图且覆盖该主题 → 直接复用，不要重画
- ❌ 不要把代码做成图片（代码用等宽文字渲染）
- ❌ 不要把整段文字做成图片（图片只放示意图/概念图）
- ❌ 算法主题（动态规划、贪心、二分等）必须标注难度级别

---

## 四、21 份文档清单（含 document_id + 内容指引）

| # | 知识点 | 阶段 | Document ID | 摘要 |
|---|--------|------|-------------|------|
| 1 | 二进制与位运算 | C2 | `R2XGdA7gzok7K2xVKJTclIr4nPh` | 用二进制表示信息，掌握与、或、非、异或和移位运算。理解补码、原码、反码的转换。 |
| 2 | 初等数论 | C2 | `DoZBds5MioeHjfxz3rqcjYWOnOg` | 素数判断、质因数分解、最大公约数（gcd）、最小公倍数（lcm）、同余与模运算。 |
| 3 | 数据类型与存储单位 | C1 | `ICwGdxbAzoYSmlxZOaAcFxN0nAc` | 整型、浮点型、字符型、布尔型的取值范围与存储方式。位、字节、KB、MB、GB 的换算。 |
| 4 | 栈与队列 | C2 | `Fx4Ldpsg5oiV1IxKawJcetNRnxg` | 后进先出（LIFO）与先进先出（FIFO）。栈在表达式求值、函数调用中的应用。队列在 BFS 中的应用。 |
| 5 | 表达式求值 | C2 | `UIE4dEp65oWNeVxYGtZc2ki4nBN` | 前缀、中缀、后缀表达式的转换与计算。运算符优先级与结合性。逻辑表达式的短路求值。 |
| 6 | 树 | C3 | `HhzsdN5hvoD5jLxuul3ckDN8nvf` | 二叉树的基本概念与遍历（先序、中序、后序）。二叉搜索树、堆、哈夫曼编码。 |
| 7 | 图 | C3 | `P9RBdFsAEomKGHxrkS2cusnYnJe` | 图的基本概念（有向/无向、度、连通）。邻接矩阵与邻接表存储。DFS 与 BFS。 |
| 8 | 时间复杂度与算法复杂度 | C3 | `Joamd7W7foFWlYxpMJMc0T87nOg` | 大 O 表示法。最好、最坏、平均时间复杂度。常见复杂度级别 O(1)、O(n)、O(n²)、O(log n) 的直观含义。 |
| 9 | 递归与递推 | C2 | `Kogod4koSouxgkx1UdicTEL4n9f` | 递归的基本思想：基准条件与递归条件。递推关系的建立。递归树与递归深度。尾递归优化。 |
| 10 | 贪心算法 | C3 | `DYMOdLnySoLxoQxsUXUcgM27nz2` | 贪心策略：每步选局部最优。适用范围与证明方法。典型问题：找零钱、活动选择、区间调度。 |
| 11 | 二分查找与二分答案 | C3 | `OiVedCjFeoETprxQd6ZcZMLfnJe` | 二分查找的前提与实现。边界条件的处理。二分答案：在单调性上二分枚举答案。 |
| 12 | 洪水填充与搜索 | C3 | `OQJhdbTqpoSZvGxmg8qc1US8nwe` | DFS 与 BFS 的搜索框架。洪水填充算法的二维应用。连通块计数、迷宫路径。 |
| 13 | 编码与解码 | C1 | `FE4Sdc39boOA4ZxNVLRcqcxInnc` | ASCII 编码表的使用。字符与数字的转换。Base64、URL 编码的基本概念。哈夫曼编码的压缩原理。 |
| 14 | 动态规划 | C4 | `Gaefd6ZVvo4JBzxts6dc0xLGn7c` | DP 的核心思想：最优子结构与重叠子问题。记忆化搜索与递推。经典问题：背包、最长子序列、编辑距离。 |
| 15 | 计算机网络基础 | C1 | `UjdbdZ6VKoLjNCxFCGxc9aqEnbh` | IP 地址、域名、DNS。局域网与广域网。TCP/IP 协议栈。HTTP 与 HTTPS 的区别。 |
| 16 | 计算机发展史 | C1 | `B2UNdVgHgoh7uPx9I69cxK5snhd` | 计算机的发展阶段（电子管→晶体管→集成电路）。冯·诺依曼结构。图灵与图灵机。 |
| 17 | 编程语言与编译原理 | C2 | `KsN7df8SooVd7qxiUgtc4NDMnbb` | 编译型语言 vs 解释型语言。C++ 的编译过程（预处理、编译、汇编、链接）。常见编程语言分类。 |
| 18 | 数组与字符串 | C2 | `U3rZdXg13ovLQXxImldc0qNynCf` | 一维与二维数组的定义、初始化和访问。字符数组与 string。字符串的比较、拷贝、拼接。下标与越界。 |
| 19 | 控制结构 | C1 | `C9Lodp3hroJCtfxxVi6cSyVcnph` | if-else、switch 分支选择。for、while、do-while 循环。break 与 continue。循环嵌套与变量作用域。 |
| 20 | 组合数学与概率 | C3 | `FL4rdY9cvoErchxhw0dcV7vanfc` | 排列、组合、阶乘。加法原理与乘法原理。概率的基本计算。鸽巢原理。 |
| 21 | 程序阅读与分析 | C2 | `JDA9dsnGsoTsouxqGOYcXraMn5f` | 阅读 C++ 程序，跟踪变量变化，推导输出结果。识别常见程序模式（累加、计数、最值、逆序）。 |

---

## 五、操作步骤

### 对每一份文档，按顺序执行：

#### Step 1: 获取文档当前内容

```bash
lark-cli docs +fetch --as user --doc <document_id>
```

#### Step 2: 生成配图

根据上方表格中的「摘要」和知识点名称，生成 9:16 竖版知识卡配图。

#### Step 3: 上传图片到文档

```bash
lark-cli docs +update --as user --doc <document_id> --image <image_path>
```

#### Step 4: 更新文档正文

用 `lark-cli docs +update` 的 `str_replace` 功能替换占位符：

1. 将「核心概念和关键图示将放在这里。」替换为实际的图片引用 + 核心概念文字说明
2. 将「（待填入）」替换为具体的 1 个最常见易错点
3. 保留「📚 想深入学习？」部分的占位（讲义链接等下一步）
4. 保留「← 返回总导航」链接

```bash
# 替换示例
lark-cli docs +update --as user --doc <document_id> \
  str_replace "核心概念和关键图示将放在这里。" \
  "![核心概念图](<image_url>)\n\n**核心概念**：<具体说明>"
```

#### Step 5: 验证公开可读权限

```bash
lark-cli docs +fetch --as user --doc <document_id> --check-permission
```

确认文档设置为「互联网公开只读」（internet public read-only），即：
- 任何人通过链接可直接查看
- 无需登录飞书账号
- 不可编辑

#### Step 6: 验证返回导航链接

确认文档末尾的「← 返回总导航」链接可正常跳转到：

```
智子学习资料库｜CSP 学习导航
https://scncdgmg7m6w.feishu.cn/docx/IPpTdbqBmoRJ0mx2INqcjnWDnOg
```

---

## 六、关键链接

| 名称 | 链接 |
|------|------|
| 总导航文档 | `https://scncdgmg7m6w.feishu.cn/docx/IPpTdbqBmoRJ0mx2INqcjnWDnOg` |
| 真题知识点救援索引 | `https://scncdgmg7m6w.feishu.cn/docx/GxWbddqOno4LcVxKD7LcqalrnTb` |
| 总导航文件夹 | `https://scncdgmg7m6w.feishu.cn/drive/folder/UIqef45D2lc458dpuOqcu8CCnHe` |

---

## 七、安全约束（重要！）

> ⚠️ **Codex 你在操作飞书时必须遵守以下约束，这是 Lark 安全机制的要求：**

### 7.1 凭证安全
- **严禁**在 bash 命令中直接写入 App ID、App Secret 或任何 API 凭证
- **严禁**将凭证写入脚本文件或 .env 文件
- **只使用 `lark-cli --as user`** 进行操作（已通过用户身份登录，无需额外凭证）
- `lark-cli` 二进制路径：`~/.npm-global/bin/lark-cli` v1.0.66

### 7.2 速率限制
- 文档创建/更新之间 **至少间隔 2-2.5 秒**
- 连续操作过快会触发 99991400 错误

### 7.3 内容约束
- 文本颜色值只支持 1-7（超过会触发 "field validation failed"）
- `divider` 块类型不能通过 children API 创建，用文本分隔符替代
- 块类型对照：text=2, heading1=3, heading2=4, bullet=12, code=14, callout=16

### 7.4 文件引用
- lark-cli 的 `--content "@file.md"` 必须使用**当前目录下的相对路径**
- 不支持绝对路径（如 `/tmp/nav-content.md` 会被拒绝）

---

## 八、完成标准

全部 21 份知识卡完成后，应满足：

1. ✅ 每份文档有一张配图（核心概念示意图）
2. ✅ 每份文档的「1 分钟速懂」部分有实质内容
3. ✅ 每份文档的「最容易踩的坑」已填入
4. ✅ 每份文档末尾的「返回总导航」链接可正常跳转
5. ✅ 每份文档权限设为「互联网公开只读」
6. ✅ 总导航 + 救援索引页中所有 21 个链接均可正常打开

---

## 九、产出物

完成后请更新并返回：

```
reports/feishu-knowledge-card-ids.json   ← 如有新增字段（如 image_url），更新此文件
public/course-data/knowledge-points.json ← 如有变化，更新 feishuCardUrl/feishuLectureUrl
```

---

**有问题随时问。** 🚀
