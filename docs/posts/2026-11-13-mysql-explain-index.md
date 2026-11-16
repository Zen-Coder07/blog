---
title: EXPLAIN：索引明明加了，为什么还是没走
date: 2026-11-16
tags: [MySQL, 索引, 排障]
draft: false
---

# EXPLAIN：索引明明加了，为什么还是没走

> **一句话结论：** 先看 `EXPLAIN` 的 `type` 和 `key`，再确认是不是「隐式转换 / 函数包字段 / 不满足最左前缀」这三类问题。

## 现象

一条百万行表上的慢查询：单条 `SELECT` 要 1.8 秒，字段上明明有索引。

| 项 | 值 |
|---|---|
| 表数据量 | 100 万行 |
| 耗时 | 1.8 s |
| 索引 | 普通单列索引 `idx_phone(phone)` |
| `EXPLAIN` 结果 | `type=ALL`、`key=NULL`、`rows≈1000000`、`Extra=Using where` |

```sql
SELECT * FROM user WHERE phone = 13800013800;
```

`phone` 是 `varchar`，条件里给的却是数字。列上有索引，`EXPLAIN` 的 `type` 仍然是 `ALL`，`key` 是 `NULL`——索引没被用上。

## 怎么读 EXPLAIN

只盯实际会改变判断的几列：

| 列 | 我在意什么 | 好 / 坏 |
|---|---|---|
| `type` | 访问方式 | `const` / `eq_ref` / `ref` / `range` 好，`ALL` 坏 |
| `key` | 实际用了哪个索引 | `NULL` = 没走索引 |
| `rows` | 预估扫描行数 | 越大越可疑，接近表行数基本就是全表扫描 |
| `Extra` | 额外动作 | `Using filesort` / `Using temporary` 要留意 |

`type` 从好到差：`system` > `const` > `eq_ref` > `ref` > `range` > `index` > `ALL`。

## 索引失效的六种常见情况

每一类都配一个反例和改法：

| 原因 | 反例 | 改写 |
|---|---|---|
| 字段上套了函数 | `where date(create_time) = '2026-11-16'` | `where create_time >= '2026-11-16' and create_time < '2026-11-17'` |
| 隐式类型转换 | `phone` 是 varchar，写成 `where phone = 13800013800` | `where phone = '13800013800'` |
| 不满足最左前缀 | 联合索引 `idx_a_b_c(a, b, c)`，只查 `where b = 1` | 条件里补上 `a`，或按真实查询重建索引 |
| `LIKE` 以 `%` 开头 | `where name like '%张三'` | 普通索引无法快速定位；改用全文索引，或在业务上改成前缀匹配 |
| `OR` 两侧只有一侧有索引 | `where a = 1 or b = 2`，只有 `a` 有索引 | 拆成两条 SQL 做 `union`，或给 `b` 也建索引 |
| 优化器判断全表更快 | 条件命中的行数占比很高（比如超过 20%） | 缩小返回行数、用覆盖索引，或让筛选条件更有选择性 |

## 最终做法

定位流程固定成 6 步：

1. 拿出慢 SQL，先 `EXPLAIN` 一次
2. 检查条件字段：有没有套函数、做运算
3. 检查字段类型：等号两端的数据类型是否一致，排除隐式转换
4. 如果是联合索引，核对最左前缀是否满足
5. 看预估 `rows`：命中占比高时，多半是优化器主动放弃索引
6. 改 SQL 或调索引，再 `EXPLAIN` 一次验证

## 怎么验证真的变快了

```sql
-- 加引号后再 EXPLAIN 一次，对比 type / key / rows
SELECT * FROM user WHERE phone = '13800013800';
```

结果：`type` 从 `ALL` 变成 `ref`，`key` 出现 `idx_phone`，`rows` 从约 100 万降到 1。

## 坑

- 索引没建成功：`ALTER TABLE` 报错、建到了别的库/表，或只写了注释没执行语句
- 索引选择性太差：重复值很多（状态、性别这类），优化器宁愿全表扫描
- 优化器参数干扰：`eq_range_index_dive_limit` 等参数会影响估算，偶尔选错执行计划
