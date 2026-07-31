-- 023-fix-opp-salesman-consistency.sql
-- 机会销售员与客户销售员一致性：气箱点拼工装属于"思源中压"（客户销售员=刘宝文），
-- 但其机会销售员误设为赵丰华，改为客户销售员
UPDATE sales_opportunities SET salesman = '刘宝文'
WHERE sales_no = 'A2026-07-006-S' AND client_name = '思源中压';
