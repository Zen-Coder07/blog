---
title: 1600 行写一个奶茶店点单系统：11 个 bug 和它们教我的事
date: 2026-11-15
tags: [Java, JDBC, MySQL, 项目复盘]
draft: false
---

# 1600 行写一个奶茶店点单系统：11 个 bug 和它们教我的事

> **一句话结论：** 功能写完只算一半。真正卡住我的是 `uft8mb4` 这种一个字母的错误，以及把「编译通过」当成「能跑」。

> **2026-11-19 复查：** 项目后来又过了一轮「重新完善」——11 个修复点都在代码原处留了注释（写明原来错在哪），界面补了下单确认页和散客入口。带「复查」的段落是这次逐行对照代码补的，11 个 bug 的复盘本身没变。

## 项目是什么

一个奶茶店的点单与管理系统，控制台交互，没有前端框架，也没有 Spring。功能不复杂，但该有的链路都有：

| 模块 | 功能 |
|---|---|
| 登录注册 | 店员账号登录、注册新账号 |
| 商品管理 | 查看在售奶茶、新增、改价改库存、下架、库存预警 |
| 会员管理 | 按手机号查询、新增会员、查看全部会员 |
| 下单结算 | 会员/散客识别、按杯数下单、库存校验、事务扣库存、会员加积分 |
| 订单查询 | 按订单号查订单主表和明细 |
| 数据统计 | 本月销量榜 TOP 3、本月营业额、库存预警 |

技术栈：Java 21 + 原生 JDBC + MySQL + Maven。17 个 Java 文件，加上初始化脚本一共约 1600 行。

[下载源码（zip）](/files/milktea-saga.zip)

## 分层：先把边界划清楚

```text
milktea-saga/
├── pom.xml
├── sql/init.sql                  # 建库、建表、测试数据
└── src/main/java/com/tea/
    ├── Main.java                 # 菜单、输入输出、流程编排
    ├── entity/                   # 数据载体
    ├── dao/                      # SQL、参数绑定、ResultSet 映射
    ├── service/                  # 业务校验、规则、事务边界
    └── util/DbUtil.java          # 连接工具
```

依赖方向只有一条：

```text
Main → Service → DAO → DbUtil → MySQL
          ↑
       Entity（在各层之间传递）
```

最容易犯的错是把 SQL 写进 `Main`，或者在 DAO 里开事务。我的约定是：

| 层 | 只做 | 不做 |
|---|---|---|
| `Main` | 菜单、输入、输出 | 写 SQL、开事务 |
| Service | 校验、业务规则、事务 | 拼 SQL、打印菜单 |
| DAO | SQL、参数绑定、结果映射 | 业务判断、提交事务 |
| Entity | 传数据 | 访问数据库 |

**事务放在 Service 层**，因为一次下单要跨 3 张表，DAO 只负责把一条 SQL 执行掉，它不知道整笔业务什么时候算完成。

## 数据模型

```text
member 1 ────── * tea_order 1 ────── * order_item * ────── 1 drink
   │                  │
   │                  └─ member_id 可为 NULL（散客）
   └─ points 积分
```

几个当时想清楚了的点：

- **金额用 `DECIMAL`，Java 侧用 `BigDecimal`。** `double` 连 `0.1 + 0.2` 都算不对，更别说对账。
- **`order_item` 存价格快照。** 下单时把 `unit_price` 写进明细，之后商品改价不会让历史订单金额失真。
- **商品用软删除。** `is_active = 0` 表示下架，历史订单还能 JOIN 到商品名。
- **订单状态是字符串。** 现在够用，但后面会讲，这其实是个隐患。

## 核心：一次下单

调用链是这样的：

```text
Main.placeOrder()
  ├─ MemberService.findByPhone()      # 识别会员 / 散客
  ├─ DrinkService.findById()          # 校验存在、在售、库存
  ├─ 组装 List<OrderItem>              # 价格快照 + 小计
  └─ OrderService.placeOrder()
       ├─ 事务前库存校验（为了友好提示）
       ├─ setAutoCommit(false)
       ├─ INSERT tea_order            # 拿回自增主键
       ├─ for each item:
       │    ├─ INSERT order_item
       │    └─ UPDATE drink 扣库存
       ├─ UPDATE member 加积分（散客跳过）
       ├─ commit()
       └─ 异常 rollback()
```

关键代码：

```java
Connection conn = DbUtil.getConnection();
conn.setAutoCommit(false);
try {
    Long orderId = teaOrderDao.insertWithConn(conn, order);

    for (OrderItem item : items) {
        item.setOrderId(orderId);
        orderItemDao.insertWithConn(conn, item);
        decrementStock(conn, item.getDrinkId(), item.getQuantity());
    }

    if (memberId != null) {
        pointsAfter = addPointsInTx(conn, memberId, total.intValue());
    }

    conn.commit();
    return new PlaceOrderResult(orderId, total, pointsAfter);
} catch (Exception e) {
    conn.rollback();
    throw new RuntimeException("下单失败，已回滚：" + e.getMessage(), e);
} finally {
    conn.setAutoCommit(true);
    conn.close();
}
```

两个细节决定了它到底对不对：

**第一，事务里必须复用同一个 `Connection`。** 如果 DAO 方法内部各自 `DbUtil.getConnection()`，三条 SQL 会落在三个连接、三个事务里，回滚只回滚最后一条。所以 DAO 提供的是 `insertWithConn(conn, ...)` 这种接收连接的重载。

**第二，防超卖不能「先查再扣」。**

```java
String sql = "UPDATE drink SET stock = stock - ? WHERE id = ? AND stock >= ?";
ps.setInt(1, quantity);
ps.setLong(2, drinkId);
ps.setInt(3, quantity);

int n = ps.executeUpdate();
if (n != 1) {
    throw new SQLException("扣库存失败（可能超卖）：drinkId=" + drinkId);
}
```

`stock >= ?` 放在 `WHERE` 里，判断和扣减在同一条语句里完成，MySQL 会加行锁；再检查影响行数，0 行就说明库存不够，抛异常让整个事务回滚。事务前那次库存查询只是为了给用户一句「仅剩 3 杯」，不是并发保护。

### 复查补充：下单前先出一张确认单

现在的 `Main.placeOrder()` 不是边输入边写库，而是先在内存里攒出 `List<OrderItem>`，打印清单、合计和预计积分，用户按 `y` 才进事务：

```text
========= 订单清单确认 =========
会员：王同学（13800138001）
  ─────────────────────────────
  珍珠奶茶   × 2   = ¥24.00
  芋圆奶茶   × 1   = ¥15.00
  ─────────────────────────────
 合计         ¥39.00
 预计积分 +39
==============================
确定下单？（y/n）
```

这么做有三个好处：

- **空单不写库。** 一杯都没加就直接返回，事务根本不会开。
- **错误在写库前暴露。** 总价、杯数、会员都在眼前，点错了当场就能取消。
- **输错字不崩程序。** 奶茶 ID 和杯数的 `parseLong/parseInt` 都包在 `try/catch (NumberFormatException)` 里，输错只提示「请输入数字」再继续循环。

但它**不是幂等**：确认页只防「手滑」，不防「连按两次回车生成两单」。真幂等要靠客户端请求 ID + 数据库唯一索引，这部分还没做。

## 11 个致命 bug

功能写完到真正跑通，中间修了 11 个会让流程直接断掉的错误：

| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 1 | 初始化脚本失败，数据库 0 张表 | `CHARSET=uft8mb4` 拼错 | 改成 `utf8mb4` |
| 2 | 按 ID 查奶茶必报错 | `PreparedStatement` 漏了 `setLong(1, id)` | 补参数绑定 |
| 3 | 会员查询报「表不存在」 | SQL 写 `members`，实际表名 `member` | 统一表名 |
| 4 | 订单查询报「未知列」 | SQL 写 `create_at`，实际列 `created_at` | 统一列名 |
| 5 | 销量榜报 1064 | JOIN 键写成 `oi.order_id = d.id`，还多了个右括号 | 改成 `oi.drink_id = d.id` |
| 6 | 营业额报 1064 | `CUNT`、`AUG`、`period` 后多逗号 | 改 `COUNT`、`AVG`，删逗号 |
| 7 | 查看商品/下单必崩 | `printf("【%d】", 字符串)` | 占位符改 `%s` |
| 8 | 销量榜有数据也不显示 | 判断写成 `if (list == null)` | 改 `list.isEmpty()` |
| 9 | 会员下单永远不加积分 | `if (pointsAfter != null)` 是死条件 | 改判断 `memberId` |
| 10 | 积分逻辑一执行就回滚整单 | SQL 多了不存在的 `memberId` 列，占位符数量也不对 | 删多余列和占位符 |
| 11 | 合法手机号反而不能注册会员 | 正则判断漏了 `!` | 补上取反 |

现在这份代码在**每个修复点原处都留了一行注释**，写明「原来错在哪」，例如：

```java
// 原为 %d，但分类是 String，会抛 IllegalFormatConversionException；
// 而"查看商品/下单"第一步都会调用本方法，导致整个流程必崩
System.out.printf("【%s】", currentCat);
```

```java
// 原代码漏了 ps.setLong(1, id) 就执行查询，
// 会抛 "No value specified for parameter 1"，导致按 ID 查奶茶全部失败
ps.setLong(1, id);
```

好处是以后回头「优化」这段代码时，能一眼看到这行为什么长这样，不至于把修复又改回去。代价是注释得克制——每条只写一句结论，不写故事，否则代码会变成散文。

### 1. 一个字母，让数据库变成空的

```sql
-- 错
) ENGINE=InnoDB DEFAULT CHARSET=uft8mb4;

-- 对
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`uft8mb4` 不存在，MySQL 直接报：

```text
ERROR 1115 (42000): Unknown character set: 'uft8mb4'
```

更坑的是 `mysql` 客户端在批处理模式下默认遇到第一个错误就停，所以后面的建表、插入一条都没跑。最终结果不是「某个功能坏了」，而是**数据库里 0 张表**。登录时执行 `SELECT ... FROM admin`，报 `Table 'milktea_saga.admin' doesn't exist`，但这层错误在 DAO 里被包装成了「店员查询失败」，界面上只看到「无法登录」。

一个拼写错误，伪装成了「登录功能坏了」。

### 2. 看到 `?` 就要确认它绑定了

```java
// 错：先 executeQuery，参数还没绑
PreparedStatement ps = conn.prepareStatement(sql);
ResultSet rs = ps.executeQuery();
// No value specified for parameter 1

// 对
PreparedStatement ps = conn.prepareStatement(sql);
ps.setLong(1, id);
try (ResultSet rs = ps.executeQuery()) { ... }
```

记住两点：**参数下标从 1 开始**，以及**每个 `?` 都必须有值**。报错信息其实说得很清楚，只是当时没细看。

### 3. 三处「看着没问题」的代码

**格式化占位符类型不对：**

```java
String category = "奶茶";
System.out.printf("【%d】", category);
// IllegalFormatConversionException: d != java.lang.String
```

`%d` 只接整数。而 `listDrinks()` 是查看商品和下单的第一步，所以整个程序一进菜单就崩。

**把「空集合」当成 `null`：**

```java
// 错
if (list == null) {
    for (int i = 0; i < list.size(); i++) { ... }
}

// 对
if (list.isEmpty()) {
    System.out.println("暂无数据");
} else {
    for (int i = 0; i < list.size(); i++) { ... }
}
```

DAO 永远返回 `List`，没数据时是空列表。集合返回值应该优先返回空集合而不是 `null`，调用方则用 `isEmpty()` 判断。

**死条件：**

```java
Integer pointsAfter = null;
if (pointsAfter != null) {          // 永远为 false
    pointsAfter = addPointsInTx(...);
}
```

变量在判断前刚被赋成 `null`，这段代码永远不执行，会员下单自然不加积分。这种 bug 编译不报错、运行不报错，只是「功能静默失效」，只能靠读代码和验收发现。

### 4. 校验条件的方向

```java
// 错：合法手机号反而抛异常
if (phone == null || phone.matches("^1[3-9]\\d{9}$")) {
    throw new IllegalArgumentException("请输入正确的11位手机号");
}

// 对
if (phone == null || !phone.matches("^1[3-9]\\d{9}$")) {
    throw new IllegalArgumentException("请输入正确的11位手机号");
}
```

校验的写法通常是「不合法才抛异常」，加条件前先念一遍这句话，能挡掉一半反向错误。

## 排查顺序比技术更重要

这次最值钱的教训不是某个 API，而是排查顺序：

```text
环境 → 数据库 → SQL → Java 代码
```

具体做法：

1. **先确认服务在**：MySQL 能不能连，库在不在。
2. **再确认表和数据在**：`SHOW TABLES`、`SELECT COUNT(*)`，而不是假设初始化脚本跑成功了。
3. **把 SQL 单独拿到客户端跑**：语法错、表名错、JOIN 错，在这里就会暴露。
4. **最后才看 Java**：看完整的异常 cause 链，不只看最外层消息。
5. **最小复现**：写一个只查一张表的小 `main`，比在 400 行菜单里加日志快。

还有一条：**异常包装不要丢 cause**。

```java
// 不够好：界面只打印外层消息时，根因丢了
throw new RuntimeException("店员查询失败", e);

// 更好
throw new RuntimeException("店员查询失败：" + e.getMessage(), e);
```

`Table doesn't exist` 和「店员查询失败」之间差的是半小时。

## 安全问题

这个项目是照着「能跑」写的，安全上有几处明显不合格，我自己列出来：

| 问题 | 现状 | 应该怎么做 |
|---|---|---|
| 密码存储 | 明文 | BCrypt / Argon2 哈希 |
| 数据库凭据 | 硬编码在 `DbUtil` | 环境变量 / 配置文件，且不进版本库 |
| 权限 | 登录后所有操作都能做 | 角色 + 最小权限 |
| 审计 | 无日志 | 记录关键写操作 |
| SQL 注入 | 全部使用 `PreparedStatement` | 保持，不要拼字符串 |

公开的下载版里，我把数据库密码换成了占位符；本地那份仍然要自己注意，不要连着真实密码一起推到公开仓库。

## 还没做的

- 没有单元测试，改完只能手工回归
- 每个 DAO 方法新建连接，没有连接池
- 没有日志，线上出问题只能靠猜
- 没有数据库迁移，表结构变更靠 `init.sql`
- 订单状态用字符串，写错一个字母不会报错
- 下单没有幂等键，重复提交会生成多单
- 控制台中文表格对不齐（显示问题，不影响数据）

这些不影响它作为练习项目跑起来，但决定了它离「能上线」还有多远。

复查时又把代码逐行对了一遍，还剩下这些「能跑、但不对」的地方：

| 位置 | 现状 | 应该怎么做 |
|---|---|---|
| `DrinkService` 与 `Main.lowStock()` | 阈值常量是 `100`，界面标题却写「<10 杯」 | 阈值只留一处，界面直接引用常量 |
| `Main.addDrink/updateDrink/deactivateDrink` | `parseLong`、`new BigDecimal` 写在 `try` 外面，输错字直接抛异常 | 解析和业务一起包进 `try/catch` |
| `Main.placeOrder()` | 会员识别那句提示的引号转义写错，会把 `" + member.getName() + "` 原样打印出来 | 去掉多余的转义引号 |
| `DrinkService.updateDrink()` | 改价、改库存不校验，可以写成负数 | 和 `addDrink` 共用同一套校验 |
| `AdminService.register()` | 查重用未 `trim` 的用户名，插入用 `trim` 后的 | 先规范化，再查重 |
| `MemberDao.insert()` | 异常消息写成「更新积分失败」 | 消息写对，否则排查时被带偏 |
| `TeaOrder` | 实体里塞了 `listOrdersByMemberId()` 这种 DAO 方法 | 挪回 `TeaOrderDao` |
| `Admin` | 多了一个 `getCreatedAt(LocalDateTime)` 的 setter | 删掉或改名 `setCreatedAt` |

这些都不会让程序崩，只会在某个输入下给出错误结果或错误提示——和正文那 11 个 bug 是同一种性格：**不报错，但不对。**

## 下载和运行

[下载完整源码（zip）](/files/milktea-saga.zip)

下载包就是修复后的这一版代码（每个修复点旁带注释，含下单确认页），数据库密码已替换为占位符 `YOUR_DB_PASSWORD`。

```bash
# 1. 初始化数据库（会 DROP 并重建 milktea_saga）
mysql -u root -p --default-character-set=utf8mb4 < sql/init.sql

# 2. 修改 DbUtil 里的用户名和密码（下载版是占位符）

# 3. 编译运行
mvn compile
mvn dependency:build-classpath -Dmdep.outputFile=cp.txt
java -cp "target/classes;$(cat cp.txt)" com.tea.Main
```

Windows 的 classpath 分隔符是 `;`，Linux/macOS 是 `:`。也可以直接在 IntelliJ IDEA 里运行 `Main`。

测试账号：`xiaoli / 123456`、`xiaowang / 123456`、`linboss / 888888`（仅教学用途）。

## 小结

如果重写一遍，我会先做这五件事：

1. 先跑通 `init.sql`，并且用 `SHOW TABLES` 验证，而不是假设它成功了。
2. 所有异常包装都保留 cause，界面消息里带上 `e.getMessage()`。
3. 每个 `?` 绑定后立刻检查，`executeUpdate()` 的返回值必须判断。
4. 事务统一放 Service，事务内所有 DAO 复用同一个 `Connection`。
5. 所有写入口都做校验，包括「修改」而不只是「新增」。

代码量不大，但这 11 个 bug 基本覆盖了 JDBC 初学者会踩的坑：字符集、参数绑定、schema 一致性、SQL 语法、格式化、空集合、死代码、布尔方向、事务连接、影响行数、并发更新。

写业务代码最难受的地方也在这里——**很多东西错了不会立刻报错，只会安静地给出错误结果。**
