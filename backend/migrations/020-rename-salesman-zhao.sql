-- 020-rename-salesman-zhao.sql
-- 将所有销售员为"岳宏大"的机会改为"赵丰华"（岳宏大的项目转由赵丰华跟进）
UPDATE sales_opportunities SET salesman = '赵丰华' WHERE salesman = '岳宏大';
