ALTER TABLE surveys ADD COLUMN access TEXT NOT NULL DEFAULT 'public';
ALTER TABLE surveys ADD COLUMN submit_label TEXT NOT NULL DEFAULT '提交答卷';
ALTER TABLE surveys ADD COLUMN success_mode TEXT NOT NULL DEFAULT 'message';
ALTER TABLE surveys ADD COLUMN success_content TEXT NOT NULL DEFAULT '<h2>提交成功</h2><p>感谢填写，你的答卷已记录。</p>';
ALTER TABLE surveys ADD COLUMN success_redirect_url TEXT NOT NULL DEFAULT '';
