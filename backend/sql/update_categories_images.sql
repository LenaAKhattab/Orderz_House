-- Update image_url values to match local files in backend/images/categories/
UPDATE categories SET image_url = '/images/categories/programming.jpg' WHERE slug = 'programming';
UPDATE categories SET image_url = '/images/categories/design.jpg' WHERE slug = 'design';
UPDATE categories SET image_url = '/images/categories/contentwriting.jpg' WHERE slug = 'content-writing';

