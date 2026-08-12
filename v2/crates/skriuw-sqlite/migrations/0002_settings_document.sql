INSERT OR IGNORE INTO app_state(key, value_json)
SELECT 'settings', json_group_object(substr(key, 9), json(value_json))
FROM app_state
WHERE key LIKE 'setting:%'
HAVING count(*) > 0;

DELETE FROM app_state
WHERE key LIKE 'setting:%';
