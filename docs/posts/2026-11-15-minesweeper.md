---
title: 用 Java 写一个控制台扫雷：首击安全、BFS 展开和 8 个调试教训
date: 2026-11-15
tags: [Java, 算法, 项目复盘]
draft: false
---

# 用 Java 写一个控制台扫雷：首击安全、BFS 展开和 8 个调试教训

> **一句话结论：** 扫雷的规则很简单，难的是把「状态判断的顺序」和「输入输出的边界」写对——这两处错了，程序不会报错，只会安静地给出错误结果。

## 项目是什么

一个跑在终端里的扫雷：9×9 棋盘、10 颗雷，支持翻开、插旗、首击安全、空白区域自动展开、彩色数字和整局计时。没有第三方依赖，5 个 Java 文件，代码不到 400 行。

源码和运行说明：[github.com/Zen-Coder07/Minesweeper](https://github.com/Zen-Coder07/Minesweeper)

```text
Minesweeper/
└── src/
    ├── MinesweeperMain.java   # 入口：读指令、主循环、计时
    ├── GameBoard.java         # 棋盘模型：布雷、算雷数、BFS、胜负
    ├── Cell.java              # 格子状态
    ├── GameUI.java            # 渲染、帮助、二次确认
    └── color.java             # 数字与 ANSI 颜色的映射
```

分层没有做得很重，但职责是分开的：

| 类 | 只负责 | 不碰 |
|---|---|---|
| `Cell` | 自己的状态：是雷、是否翻开、是否插旗、周围雷数 | 棋盘、输入输出 |
| `GameBoard` | 规则：布雷、算雷数、展开、判胜负 | 读输入、打印棋盘 |
| `GameUI` | 渲染、提示、确认 | 改游戏状态 |
| `MinesweeperMain` | 解析指令、串联流程、计时 | 具体规则实现 |
| `color` | 雷数到颜色的映射 | 一切别的东西 |

## 几个先定下来的设计

**首击安全。** 开局不布雷，玩家第一次有效翻开后才随机布雷，并且跳过首击格。这样第一下永远不会踩雷，也不需要在开局时做「把雷挪走」的修补。

**坐标从 1 开始。** 界面表头是 1~9，输入也用 1~9，只有进入模型时才减 1。少一层「用户看到的」和「程序内部用的」之间的换算，报错就少一半。

**用 BFS 展开空白。** 翻开周围雷数为 0 的格子时，把 8 邻域里未翻开、未插旗、不是雷的格子一起翻开，直到碰到数字格。用队列逐层扩散，每个格子最多入队一次，复杂度 O(行 × 列)。

**颜色用 ANSI 转义。** 1 蓝、2 绿、3 红、4 紫、5 黄、6 青、7 灰、8 红。`switch` 表达式返回颜色常量，渲染时拼在数字前后。需要 JDK 14+ 和 UTF-8 终端。

## 核心一：首击之后才布雷

```java
public void placeMine(int firstR, int firstC) {
    Random rand = new Random();
    int placed = 0;
    while (placed < mineNum) {
        int r = rand.nextInt(rows);
        int c = rand.nextInt(cols);
        if ((r == firstR && c == firstC) || grid[r][c].isMine()) {
            continue;
        }
        grid[r][c].setMine(true);
        placed++;
    }
    calcAllAroundMine();
}
```

这段代码里有两个容易被忽略的点：

- **重复抽到同一格要跳过**，否则 `placed` 会多算，最后雷数不够。
- **构造时要校验雷数范围**：`0 <= mineNum < rows * cols`。如果允许 `mineNum` 等于格子总数，`placeMine` 会永远找不到可放的格子，死循环。

雷布完之后统一算一遍周围雷数：

```java
private final int[][] dirs = {
    {0,1},{0,-1},{1,0},{-1,0},{1,1},{-1,-1},{1,-1},{-1,1}
};

for (int[] dir : dirs) {
    int nr = i + dir[0];
    int nc = j + dir[1];
    if (inBounds(nr, nc) && grid[nr][nc].isMine()) {
        cnt++;
    }
}
```

8 个方向写成一个数组，比八条 `if` 好检查，也不容易漏掉对角方向。

## 核心二：BFS 级联展开

```java
Queue<int[]> queue = new LinkedList<>();
queue.add(new int[]{r, c});
cell.setRevealed();          // 入队前就标记，避免重复入队
safeNum--;

while (!queue.isEmpty()) {
    int[] cur = queue.poll();
    int cr = cur[0], cc = cur[1];
    Cell curr = grid[cr][cc];

    // 数字格只翻开，不再向外扩散
    if (curr.getAroundMineCount() != 0) {
        continue;
    }

    for (int[] dir : dirs) {
        int nr = cr + dir[0];
        int nc = cc + dir[1];
        if (!inBounds(nr, nc)) {
            continue;
        }
        Cell next = grid[nr][nc];
        if (!next.isRevealed() && !next.isFlagged() && !next.isMine()) {
            next.setRevealed();  // 入队前标记
            safeNum--;
            queue.add(new int[]{nr, nc});
        }
    }
}
```

这里有四个必须同时成立的条件，少一个就会出问题：

1. **入队前标记已访问。** 如果等出队再标记，同一个格子会被多个邻居重复入队，`safeNum` 会被多减，胜利条件提前满足。
2. **先判空再出队。** `poll()` 在空队列返回 `null`，直接 `cur[0]` 就是空指针。
3. **不要用 `for` 遍历队列。** BFS 过程中队列长度一直在变，只能 `while + poll()`。
4. **扩散条件写全**：未翻开 + 未插旗 + 不是雷。插旗格不能因为级联被翻开。

`LinkedList` 能当队列用，但只做队列时 `ArrayDeque` 更快，也不允许存 `null`，是更稳的选择。这里为了直观用了 `LinkedList`，知道取舍就行。

## 核心三：判断顺序就是规则

`openCell()` 里的判断顺序不是随便排的：

```java
if (gameOver) return;                    // 游戏已结束
if (!inBounds(r, c)) { ... return; }     // 越界
if (cell.isRevealed()) { ... return; }   // 已翻开
if (cell.isFlagged()) { ... return; }    // 已插旗（确认由调用方处理）
if (isFirst) { placeMine(r, c); isFirst = false; }
if (cell.isMine()) { gameOver = true; ... return; }
BFS(r, c, cell);
```

我必须把「已插旗」放在「是否雷」前面。否则玩家点一个插了旗的雷，程序会直接判定踩雷，根本没机会问「确定要掀开吗」。**多个状态并列时，先想清楚哪个条件应该先拦截，这本身就是规则的一部分。**

## 8 个调试教训

这些都是实际写的时候踩到的，按印象深浅排：

### 1. `nextLine()` 和 `nextInt()` 不能混用

`nextInt()` 只读数字，不消费行尾的换行符，下一次 `nextLine()` 会先读到一个空串；而 `nextLine()` 读的是整行 `"o 3 4"`，也不能直接和 `"o"` 比较。

统一按行读，再自己拆：

```java
String line = sc.nextLine().trim();
String[] arr = line.split("\\s+");
if (arr.length != 3) throw new IllegalArgumentException("格式有误");
int r = Integer.parseInt(arr[1]) - 1;
int c = Integer.parseInt(arr[2]) - 1;
```

### 2. 一个输入源只用一个 Scanner

一开始 `GameBoard` 里也 `new Scanner(System.in)`，结果主循环偶尔会「吞掉」玩家输入。原因是多个 Scanner 同时包装 `System.in`，各自的缓冲区会提前读取。

模型类不应该读输入。提示和读取放在 `GameUI` / `MinesweeperMain`，确认完再把结果传回模型。

### 3. 分支里的 `break` 只跳出循环，循环外的代码照样执行

插旗格选 `no` 之后仍然被掀开；选 `yes` 时又被翻开两次、安全格计数多减一次。原因是 `if` 里的 `break` 只跳出了 `while`，而 `while` 外面还有一句公共的 `BFS(...)`，两个分支都会走到。

改成「先算要不要开，再只执行一次」：

```java
boolean shouldOpen = true;
if (board.isFlagged(r, c)) {
    shouldOpen = ui.confirmOpenFlag(sc);
    if (shouldOpen) {
        board.clearFlag(r, c);
    }
}
if (shouldOpen) {
    board.openCell(r, c);
}
```

看到 `break` / `continue` 时，顺着控制流把块外的代码再走一遍。

### 4. 改方法之后，检查所有调用点

删掉 `revealAllMines()` 后 `openCell()` 还在调用，编译直接报找不到符号；删掉 `openCell()` 末尾的 `BFS(...)` 后，普通格子翻开没有任何反应。

每轮改完先编译，再跑一遍最小流程：翻开普通格 → 插旗 → 踩雷 → 胜利。不要只靠「看代码觉得对」。

### 5. 胜利条件差一个等号，就永远赢不了

`safeNum` 的初值是「总格数 − 雷数」，每翻开一个安全格减一。所有安全格翻开时它恰好等于 0，所以判断必须是：

```java
public boolean checkWin() {
    return safeNum <= 0;
}
```

写成 `< 0` 看起来只差一点，实际是从头到尾赢不了。

### 6. 状态和显示分开

踩雷后我一度直接在 `GameBoard` 里复制了一份打印棋盘的代码，结果和 `GameUI` 的输出慢慢不一致。正确做法是模型只改状态：

```java
public void revealAllMines() {
    for (...) {
        if (grid[i][j].isMine()) {
            grid[i][j].setRevealed();
        }
    }
}
```

主循环结束后统一 `ui.renderBoard(board)`。状态归模型，显示归 UI。

### 7. 越界和坏输入必须有反馈

坐标越界、坐标不是数字、指令少参数，都要给提示，而不是静默返回。否则玩家会以为「指令生效了但没反应」。

```java
try {
    // 解析 + 执行
} catch (NumberFormatException e) {
    System.out.println("行列必须为数字！");
} catch (Exception e) {
    System.out.println(e.getMessage());
}
```

### 8. EOF 要能正常退出

`Scanner` 读到输入流结尾时，`hasNextLine()` 返回 `false`。如果循环不处理这个情况，程序会一直空转。主循环里加一句：

```java
if (!sc.hasNextLine()) break;
```

## 还值得做的

- 难度选择（初级 9×9/10 雷，中级 16×16/40 雷，高级 16×30/99 雷）
- 显示剩余雷数、最佳成绩
- 中文/emoji 在终端里的宽度对齐（现在依赖等宽字体，部分终端会错位）
- 把 `Cell` 的状态改成枚举，避免三个 boolean 组合出非法状态

## 运行

```bash
javac -encoding UTF-8 -d out src/*.java
java -cp out MinesweeperMain
```

指令：

```text
o 行 列    翻开
f 行 列    插旗 / 取消插旗
```

完整源码：[github.com/Zen-Coder07/Minesweeper](https://github.com/Zen-Coder07/Minesweeper)

## 小结

扫雷的逻辑不复杂，但它是很好的「状态 + 边界」练习：

- 布阵要处理重复和非法参数
- 展开要处理访问标记和扩散条件
- 状态判断的顺序决定行为对不对
- 输入输出要分层，EOF、越界、格式错误都要有出口
- 改完先编译，再跑一遍完整流程

这几条和用什么语言关系不大，换成别的项目也一样成立。
