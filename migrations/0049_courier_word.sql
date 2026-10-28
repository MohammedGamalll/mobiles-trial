UPDATE whatsapp_templates
SET body_ar = REPLACE(body_ar, 'التيار', 'الطيار')
WHERE body_ar LIKE '%التيار%';
