-- 007-add-user-settings.sql
-- 用户设置持久化：销售分析页面的年度目标/GP3等
CREATE TABLE IF NOT EXISTS user_settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        VARCHAR(100) NOT NULL,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_key ON user_settings(user_id, key);

COMMENT ON TABLE user_settings IS '用户个性化设置（年度目标、GP3等），按 user_id+key 唯一';
