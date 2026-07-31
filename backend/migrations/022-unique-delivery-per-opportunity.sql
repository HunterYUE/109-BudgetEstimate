-- 022-unique-delivery-per-opportunity.sql
-- 转交付防重复：同一机会只能有一个交付项目（数据库级约束，防止绕过前端校验重复创建）
ALTER TABLE delivery_projects ADD CONSTRAINT uq_delivery_opportunity UNIQUE (opportunity_id);
