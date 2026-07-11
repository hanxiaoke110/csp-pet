#!/bin/bash
# 创建 21 份知识卡文档并输出 document_id 列表
# 用法：bash scripts/create-knowledge-cards.sh

NAV_URL="https://scncdgmg7m6w.feishu.cn/docx/IPpTdbqBmoRJ0mx2INqcjnWDnOg"

declare -A CARDS
CARDS=(
  ["binary-and-bitwise"]="二进制与位运算|用二进制表示信息，掌握与、或、非、异或和移位运算。理解补码、原码、反码的转换。|C2"
  ["number-theory"]="初等数论|素数判断、质因数分解、最大公约数（gcd）、最小公倍数（lcm）、同余与模运算。|C2"
  ["data-types-and-units"]="数据类型与存储单位|整型、浮点型、字符型、布尔型的取值范围与存储方式。位、字节、KB、MB、GB 的换算。|C1"
  ["stack-and-queue"]="栈与队列|后进先出（LIFO）与先进先出（FIFO）。栈在表达式求值、函数调用中的应用。|C2"
  ["expression-evaluation"]="表达式求值|前缀、中缀、后缀表达式的转换与计算。运算符优先级与结合性。逻辑表达式的短路求值。|C2"
  ["tree"]="树|二叉树的基本概念与遍历（先序、中序、后序）。二叉搜索树、堆、哈夫曼编码。|C3"
  ["graph"]="图|图的基本概念（有向/无向、度、连通）。邻接矩阵与邻接表。深度优先搜索（DFS）与广度优先搜索（BFS）。|C3"
  ["complexity"]="时间复杂度与算法复杂度|大 O 表示法。最好、最坏、平均时间复杂度。常见复杂度级别的直观含义。|C3"
  ["recursion"]="递归与递推|递归的基本思想：基准条件与递归条件。递推关系的建立。递归树与递归深度。|C2"
  ["greedy"]="贪心算法|贪心策略：每步选局部最优。适用范围与证明方法。典型问题：找零钱、活动选择。|C3"
  ["binary-search"]="二分查找与二分答案|二分查找的前提与实现。边界条件的处理。二分答案：在单调性上二分枚举答案。|C3"
  ["flood-fill"]="洪水填充与搜索|DFS 与 BFS 的搜索框架。洪水填充算法的二维应用。连通块计数、迷宫路径。|C3"
  ["encoding-and-decoding"]="编码与解码|ASCII 编码表的使用。字符与数字的转换。Base64、URL 编码的基本概念。|C1"
  ["dynamic-programming"]="动态规划|DP 的核心思想：最优子结构与重叠子问题。记忆化搜索与递推。经典问题：背包、最长子序列。|C4"
  ["computer-networks"]="计算机网络基础|IP 地址、域名、DNS。局域网与广域网。TCP/IP 协议栈。HTTP 与 HTTPS。|C1"
  ["computer-history"]="计算机发展史|计算机的发展阶段。冯·诺依曼结构。图灵与图灵机。中国计算机发展。|C1"
  ["programming-languages"]="编程语言与编译原理|编译型 vs 解释型语言。C++ 编译过程。常见编程语言分类。|C2"
  ["array-and-string"]="数组与字符串|一维与二维数组的定义和访问。字符数组与 string。下标与越界。|C2"
  ["control-structures"]="控制结构|if-else、switch 分支。for、while、do-while 循环。break 与 continue。循环嵌套。|C1"
  ["combinatorics"]="组合数学与概率|排列、组合、阶乘。加法原理与乘法原理。概率的基本计算。鸽巢原理。|C3"
  ["program-reading"]="程序阅读与分析|阅读 C++ 程序，跟踪变量变化，推导输出结果。识别常见程序模式。|C2"
)

OUTPUT_FILE="reports/feishu-knowledge-card-ids.json"
echo "{" > "$OUTPUT_FILE"
echo '  "created": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",' >> "$OUTPUT_FILE"
echo '  "cards": {' >> "$OUTPUT_FILE"

FIRST=true
for KP_ID in "${!CARDS[@]}"; do
  IFS='|' read -r NAME SUMMARY STAGE <<< "${CARDS[$KP_ID]}"
  
  CONTENT=$(cat <<MD
# 知识卡｜${NAME}

> 📖 ${SUMMARY}

---

## 📋 1 分钟速懂

核心概念和关键图示将放在这里。

## ⚡ 最容易踩的一个坑

（待填入）

---

## 📚 想深入学习？

打开「专题讲义｜${NAME}」

---

← [返回总导航：智子学习资料库｜CSP 学习导航](${NAV_URL})

💡 收藏总导航链接，即使不打开桌宠也能随时学习。
MD
)

  echo "Creating: 知识卡｜${NAME} ..."
  
  RESULT=$(lark-cli docs +create --as user --doc-format markdown --title "知识卡｜${NAME}" --content "$CONTENT" --format json 2>&1)
  
  if echo "$RESULT" | grep -q '"ok": true'; then
    DOC_ID=$(echo "$RESULT" | grep -o '"document_id": "[^"]*"' | head -1 | cut -d'"' -f4)
    DOC_URL=$(echo "$RESULT" | grep -o '"url": "[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  ✅ ${DOC_ID}"
    
    # Append to JSON file
    if [ "$FIRST" = true ]; then FIRST=false; else echo ',' >> "$OUTPUT_FILE"; fi
    echo "    \"${KP_ID}\": {" >> "$OUTPUT_FILE"
    echo "      \"name\": \"${NAME}\"," >> "$OUTPUT_FILE"
    echo "      \"documentId\": \"${DOC_ID}\"," >> "$OUTPUT_FILE"
    echo "      \"url\": \"${DOC_URL}\"" >> "$OUTPUT_FILE"
    echo -n "    }" >> "$OUTPUT_FILE"
  else
    echo "  ❌ Failed: $(echo "$RESULT" | head -3)"
  fi
  
  sleep 0.5
done

echo "" >> "$OUTPUT_FILE"
echo "  }" >> "$OUTPUT_FILE"
echo "}" >> "$OUTPUT_FILE"

echo ""
echo "Done. IDs written to $OUTPUT_FILE"
