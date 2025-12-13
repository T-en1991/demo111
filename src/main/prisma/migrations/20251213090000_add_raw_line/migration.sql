-- 增加历史记录表的原始元数据字段
ALTER TABLE "history" ADD COLUMN "raw_line" TEXT;
