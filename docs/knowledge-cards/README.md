# 智子知识卡 · 生图清单

> **总进度：需生图 8 张 | 预计覆盖新增 ~200 题**

---

## 📋 快速生图清单

| # | 文件名 | 标题 | 阶段 | 覆盖题数 | 卡片说明 |
|---|--------|------|:---:|:---:|------|
| 1 | `kp-computer-hardware.webp` | 计算机硬件基础 | C1 | 89 | 冯·诺依曼五部件、输入输出设备、存储金字塔 |
| 2 | `kp-cpp-basics.webp` | C++语言基础 | C1 | 64 | 变量、数据类型、运算符、cin/cout |
| 3 | `kp-sorting.webp` | 排序算法 | C2 | 11+ | 冒泡/选择/插入排序动画对比 |
| 4 | `kp-enumeration.webp` | 枚举与模拟 | C2 | 8+ | 暴力枚举框架、模拟法、剪枝优化 |
| 5 | `kp-linked-list.webp` | 链表 | C2 | 3+ | 数组vs链表对比、插入删除操作 |
| 6 | `kp-string.webp` | 字符串处理 | C2 | — | 字符数组vs string类、常用函数 |
| 7 | `kp-searching.webp` | 查找算法 | C2 | — | 顺序查找vs二分查找对比 |
| 8 | `kp-struct-and-class.webp` | 结构体与类 | C2 | 7 | struct打包、成员访问、构造函数 |

---

## 📁 文件夹结构

```
docs/knowledge-cards/
├── README.md                    ← 本文件
├── _shared/
│   └── design-spec.md           ← 通用设计规范（尺寸、配色、字体、智子形象）
├── C1-基础入门/
│   ├── computer-hardware.md     ← 计算机硬件基础
│   └── cpp-basics.md           ← C++语言基础
├── C2-进阶基础/
│   ├── sorting.md              ← 排序算法
│   ├── enumeration.md          ← 枚举与模拟
│   ├── linked-list.md          ← 链表
│   ├── string.md               ← 字符串处理
│   ├── searching.md            ← 查找算法
│   └── struct-and-class.md     ← 结构体与类
├── C3-算法初步/                 ← 已有知识卡（后续补充图片版）
└── C4-高级算法/                 ← 已有知识卡（后续补充图片版）
```

---

## 🎨 每张卡的 spec 文件包含

1. **卡片内容**：标题、核心要点（5条）、一句话总结、智子气泡文案
2. **生图指引**：主视觉参考（画什么）、配色方案、参考题例（帮助理解难度）
3. **元数据**：ID、阶段标签、覆盖题数、前置知识

---

## 🔗 相关文件

- 通用设计规范：[`_shared/design-spec.md`](_shared/design-spec.md)
- 已有知识卡数据：`public/course-data/knowledge-points.json`（21 条）
- 题目-知识卡映射：`public/course-data/question-knowledge-mapping.json`
- 智子形象参考：`pet-sprites-remote/2d/blue-qilin.png`
