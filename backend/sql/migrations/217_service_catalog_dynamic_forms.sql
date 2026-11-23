-- 217_service_catalog_dynamic_forms
-- Smart Orders S2: configurable service catalog layered on the EXISTING categories, versioned
-- declarative form schemas, and an immutable per-order form snapshot.
--
--   categories (unchanged, canonical order category)
--     -> catalog_services          (stable service_code, visibility, price-mode metadata, current_version)
--          -> catalog_service_versions  (append-only: localized names, quantity unit/rules, fields)
--   orders -> order_form_snapshots  (service identity + version + field definitions + submitted values)
--
-- Nothing existing is renamed, renumbered or rewritten. Historical orders get NO snapshot (unknown stays
-- unknown). Services are never deleted (deactivate instead; snapshots reference them ON DELETE RESTRICT).
-- Seed: an initial catalog mapped onto the existing Production categories (programming, design,
-- content-writing, special-requests) — no new public categories are created.
--
-- Additive only. Rollback (ops manual, only while no snapshot exists): drop order_form_snapshots,
-- catalog_service_versions, catalog_services (+ the two trigger functions) and clear schema_migrations
-- row 217_service_catalog_dynamic_forms.

BEGIN;

CREATE TABLE IF NOT EXISTS catalog_services (
  id BIGSERIAL PRIMARY KEY,
  service_code VARCHAR(60) NOT NULL,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  sub_subcategory_id BIGINT NULL REFERENCES sub_subcategories(id) ON DELETE SET NULL,
  -- public = clients + Admin; admin_only = Admin order creation only.
  visibility VARCHAR(12) NOT NULL DEFAULT 'public',
  -- Metadata only (S2 does not price anything): fixed / per_unit / package / manual_quote / range.
  price_mode VARCHAR(16) NOT NULL DEFAULT 'manual_quote',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_services_code_chk CHECK (service_code ~ '^[a-z][a-z0-9_]{2,59}$'),
  CONSTRAINT catalog_services_visibility_chk CHECK (visibility IN ('public', 'admin_only')),
  CONSTRAINT catalog_services_price_mode_chk CHECK (price_mode IN ('fixed', 'per_unit', 'package', 'manual_quote', 'range')),
  CONSTRAINT catalog_services_version_chk CHECK (current_version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_services_code_uidx ON catalog_services (service_code);
CREATE INDEX IF NOT EXISTS catalog_services_active_cat_idx
  ON catalog_services (category_id, sort_order, id) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS catalog_service_versions (
  id BIGSERIAL PRIMARY KEY,
  service_id BIGINT NOT NULL REFERENCES catalog_services(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL,
  -- Normalised by the server (allowlisted types/keys/units/locales). Never executable.
  schema JSONB NOT NULL,
  change_note VARCHAR(300) NULL,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_service_versions_version_chk CHECK (version >= 1),
  CONSTRAINT catalog_service_versions_schema_chk CHECK (jsonb_typeof(schema) = 'object'),
  CONSTRAINT catalog_service_versions_uq UNIQUE (service_id, version)
);

CREATE TABLE IF NOT EXISTS order_form_snapshots (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  service_id BIGINT NOT NULL REFERENCES catalog_services(id) ON DELETE RESTRICT,
  service_code VARCHAR(60) NOT NULL,
  service_version INTEGER NOT NULL,
  category_id BIGINT NOT NULL,
  -- Copy of the version definition (names, unit, fields, option labels) at order time.
  definition JSONB NOT NULL,
  -- Normalised submitted values keyed by field key.
  field_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  quantity NUMERIC(14,2) NULL,
  quantity_unit VARCHAR(20) NOT NULL,
  quantity_unspecified BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_form_snapshots_qty_chk CHECK (
    (quantity_unspecified = TRUE AND quantity IS NULL) OR (quantity_unspecified = FALSE AND (quantity IS NULL OR quantity > 0))
  )
);

-- One snapshot per order (multi-item orders are a later phase; the table is per-order by design
-- and a future order_items table can carry its own snapshot rows).
CREATE UNIQUE INDEX IF NOT EXISTS order_form_snapshots_order_uidx ON order_form_snapshots (order_id);
CREATE INDEX IF NOT EXISTS order_form_snapshots_service_idx ON order_form_snapshots (service_id, service_version);

-- Immutability: versions and snapshots are append-only (DELETE stays possible only through the
-- orders cascade / ops, e.g. purging an unpaid client draft).
CREATE OR REPLACE FUNCTION catalog_forbid_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only table: % rows cannot be updated', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_service_versions_no_update ON catalog_service_versions;
CREATE TRIGGER catalog_service_versions_no_update
  BEFORE UPDATE ON catalog_service_versions FOR EACH ROW EXECUTE FUNCTION catalog_forbid_update();

DROP TRIGGER IF EXISTS order_form_snapshots_no_update ON order_form_snapshots;
CREATE TRIGGER order_form_snapshots_no_update
  BEFORE UPDATE ON order_form_snapshots FOR EACH ROW EXECUTE FUNCTION catalog_forbid_update();

-- ---------------------------------------------------------------------------
-- Initial catalog (generated from declarative definitions; normalised by serviceCatalogSchema.js)
-- ---------------------------------------------------------------------------

-- research_writing
INSERT INTO catalog_services (service_code, category_id, visibility, price_mode, sort_order, current_version)
SELECT 'research_writing', c.id, 'public', 'manual_quote', 10, 1
  FROM categories c WHERE c.slug = 'content-writing'
ON CONFLICT (service_code) DO NOTHING;
INSERT INTO catalog_service_versions (service_id, version, schema, change_note)
SELECT cs.id, 1, '{"name":{"ar":"كتابة بحث / محتوى أكاديمي","en":"Research / academic writing","de":"Recherche / wissenschaftliches Schreiben","nl":"Onderzoek / academisch schrijven","ro":"Cercetare / redactare academică"},"description":{},"quantity":{"unit":"pages","required":true,"allowUnspecified":true,"decimals":false,"min":1,"max":500},"fields":[{"key":"topic","type":"text","label":{"ar":"الموضوع","en":"Topic","de":"Thema","nl":"Onderwerp","ro":"Subiect"},"placeholder":{},"help":{},"required":true,"maxLength":300},{"key":"language","type":"select","label":{"ar":"اللغة","en":"Language","de":"Sprache","nl":"Taal","ro":"Limba"},"placeholder":{},"help":{},"required":true,"options":[{"value":"ar","label":{"ar":"العربية","en":"Arabic","de":"Arabisch","nl":"Arabisch","ro":"Arabă"}},{"value":"en","label":{"ar":"الإنجليزية","en":"English","de":"Englisch","nl":"Engels","ro":"Engleză"}},{"value":"other","label":{"ar":"لغة أخرى","en":"Other language","de":"Andere Sprache","nl":"Andere taal","ro":"Altă limbă"}}]},{"key":"audience","type":"text","label":{"ar":"الجمهور / المقرر","en":"Audience / course","de":"Zielgruppe / Kurs","nl":"Doelgroep / vak","ro":"Public / curs"},"placeholder":{},"help":{},"required":false,"maxLength":200},{"key":"citation_style","type":"select","label":{"ar":"نمط التوثيق","en":"Citation style","de":"Zitierstil","nl":"Citatiestijl","ro":"Stil de citare"},"placeholder":{},"help":{},"required":false,"options":[{"value":"apa","label":{"ar":"APA","en":"APA","de":"APA","nl":"APA","ro":"APA"}},{"value":"mla","label":{"ar":"MLA","en":"MLA","de":"MLA","nl":"MLA","ro":"MLA"}},{"value":"harvard","label":{"ar":"هارفارد","en":"Harvard","de":"Harvard","nl":"Harvard","ro":"Harvard"}},{"value":"chicago","label":{"ar":"شيكاغو","en":"Chicago","de":"Chicago","nl":"Chicago","ro":"Chicago"}},{"value":"none","label":{"ar":"بدون توثيق","en":"No citations","de":"Keine Zitate","nl":"Geen citaties","ro":"Fără citări"}}]},{"key":"reference_count","type":"number","label":{"ar":"عدد المراجع","en":"Number of references","de":"Anzahl der Quellen","nl":"Aantal bronnen","ro":"Număr de surse"},"placeholder":{},"help":{},"required":false,"min":0,"max":200},{"key":"instructions","type":"textarea","label":{"ar":"تعليمات إضافية","en":"Additional instructions","de":"Zusätzliche Anweisungen","nl":"Aanvullende instructies","ro":"Instrucțiuni suplimentare"},"placeholder":{},"help":{},"required":false,"maxLength":3000},{"key":"reference_files","type":"file","label":{"ar":"ملفات مرجعية","en":"Reference files","de":"Referenzdateien","nl":"Referentiebestanden","ro":"Fișiere de referință"},"placeholder":{},"help":{},"required":false,"max":5}]}'::jsonb, 'initial catalog (migration 217)'
  FROM catalog_services cs WHERE cs.service_code = 'research_writing'
ON CONFLICT (service_id, version) DO NOTHING;

-- translation
INSERT INTO catalog_services (service_code, category_id, visibility, price_mode, sort_order, current_version)
SELECT 'translation', c.id, 'public', 'manual_quote', 20, 1
  FROM categories c WHERE c.slug = 'content-writing'
ON CONFLICT (service_code) DO NOTHING;
INSERT INTO catalog_service_versions (service_id, version, schema, change_note)
SELECT cs.id, 1, '{"name":{"ar":"ترجمة","en":"Translation","de":"Übersetzung","nl":"Vertaling","ro":"Traducere"},"description":{},"quantity":{"unit":"words","required":true,"allowUnspecified":true,"decimals":false,"min":1,"max":500000},"fields":[{"key":"source_language","type":"select","label":{"ar":"اللغة المصدر","en":"Source language","de":"Ausgangssprache","nl":"Brontaal","ro":"Limba sursă"},"placeholder":{},"help":{},"required":true,"options":[{"value":"ar","label":{"ar":"العربية","en":"Arabic","de":"Arabisch","nl":"Arabisch","ro":"Arabă"}},{"value":"en","label":{"ar":"الإنجليزية","en":"English","de":"Englisch","nl":"Engels","ro":"Engleză"}},{"value":"other","label":{"ar":"لغة أخرى","en":"Other language","de":"Andere Sprache","nl":"Andere taal","ro":"Altă limbă"}}]},{"key":"target_language","type":"select","label":{"ar":"اللغة الهدف","en":"Target language","de":"Zielsprache","nl":"Doeltaal","ro":"Limba țintă"},"placeholder":{},"help":{},"required":true,"options":[{"value":"ar","label":{"ar":"العربية","en":"Arabic","de":"Arabisch","nl":"Arabisch","ro":"Arabă"}},{"value":"en","label":{"ar":"الإنجليزية","en":"English","de":"Englisch","nl":"Engels","ro":"Engleză"}},{"value":"other","label":{"ar":"لغة أخرى","en":"Other language","de":"Andere Sprache","nl":"Andere taal","ro":"Altă limbă"}}]},{"key":"domain","type":"select","label":{"ar":"مجال المستند","en":"Document domain","de":"Fachgebiet","nl":"Vakgebied","ro":"Domeniu"},"placeholder":{},"help":{},"required":false,"options":[{"value":"general","label":{"ar":"عام","en":"General","de":"Allgemein","nl":"Algemeen","ro":"General"}},{"value":"academic","label":{"ar":"أكاديمي","en":"Academic","de":"Akademisch","nl":"Academisch","ro":"Academic"}},{"value":"legal","label":{"ar":"قانوني","en":"Legal","de":"Juristisch","nl":"Juridisch","ro":"Juridic"}},{"value":"medical","label":{"ar":"طبي","en":"Medical","de":"Medizinisch","nl":"Medisch","ro":"Medical"}},{"value":"technical","label":{"ar":"تقني","en":"Technical","de":"Technisch","nl":"Technisch","ro":"Tehnic"}},{"value":"marketing","label":{"ar":"تسويقي","en":"Marketing","de":"Marketing","nl":"Marketing","ro":"Marketing"}}]},{"key":"terminology_notes","type":"textarea","label":{"ar":"ملاحظات المصطلحات","en":"Terminology notes","de":"Hinweise zur Terminologie","nl":"Terminologienotities","ro":"Note de terminologie"},"placeholder":{},"help":{},"required":false,"maxLength":2000},{"key":"reference_files","type":"file","label":{"ar":"ملفات مرجعية","en":"Reference files","de":"Referenzdateien","nl":"Referentiebestanden","ro":"Fișiere de referință"},"placeholder":{},"help":{},"required":false,"max":5}]}'::jsonb, 'initial catalog (migration 217)'
  FROM catalog_services cs WHERE cs.service_code = 'translation'
ON CONFLICT (service_id, version) DO NOTHING;

-- digital_marketing
INSERT INTO catalog_services (service_code, category_id, visibility, price_mode, sort_order, current_version)
SELECT 'digital_marketing', c.id, 'public', 'manual_quote', 30, 1
  FROM categories c WHERE c.slug = 'content-writing'
ON CONFLICT (service_code) DO NOTHING;
INSERT INTO catalog_service_versions (service_id, version, schema, change_note)
SELECT cs.id, 1, '{"name":{"ar":"تسويق رقمي","en":"Digital marketing","de":"Digitales Marketing","nl":"Digitale marketing","ro":"Marketing digital"},"description":{},"quantity":{"unit":"posts","required":false,"allowUnspecified":true,"decimals":false,"min":1,"max":1000},"fields":[{"key":"deliverable","type":"select","label":{"ar":"المطلوب","en":"Deliverable","de":"Leistung","nl":"Oplevering","ro":"Livrabil"},"placeholder":{},"help":{},"required":true,"options":[{"value":"plan","label":{"ar":"خطة تسويق","en":"Marketing plan","de":"Marketingplan","nl":"Marketingplan","ro":"Plan de marketing"}},{"value":"seo","label":{"ar":"تحسين محركات البحث","en":"SEO","de":"SEO","nl":"SEO","ro":"SEO"}},{"value":"ad_copy","label":{"ar":"كتابة إعلانات","en":"Ad copywriting","de":"Werbetexte","nl":"Advertentieteksten","ro":"Texte publicitare"}},{"value":"content","label":{"ar":"إدارة محتوى","en":"Content management","de":"Content-Management","nl":"Contentbeheer","ro":"Gestionare conținut"}}]},{"key":"platforms","type":"multiselect","label":{"ar":"المنصات","en":"Platforms","de":"Plattformen","nl":"Platforms","ro":"Platforme"},"placeholder":{},"help":{},"required":false,"options":[{"value":"instagram","label":{"ar":"إنستغرام","en":"Instagram","de":"Instagram","nl":"Instagram","ro":"Instagram"}},{"value":"facebook","label":{"ar":"فيسبوك","en":"Facebook","de":"Facebook","nl":"Facebook","ro":"Facebook"}},{"value":"tiktok","label":{"ar":"تيك توك","en":"TikTok","de":"TikTok","nl":"TikTok","ro":"TikTok"}},{"value":"linkedin","label":{"ar":"لينكدإن","en":"LinkedIn","de":"LinkedIn","nl":"LinkedIn","ro":"LinkedIn"}},{"value":"google","label":{"ar":"جوجل","en":"Google","de":"Google","nl":"Google","ro":"Google"}}]},{"key":"website","type":"url","label":{"ar":"رابط الموقع أو الصفحة","en":"Website or page link","de":"Website- oder Seitenlink","nl":"Link naar website of pagina","ro":"Link site sau pagină"},"placeholder":{},"help":{},"required":false},{"key":"instructions","type":"textarea","label":{"ar":"تعليمات إضافية","en":"Additional instructions","de":"Zusätzliche Anweisungen","nl":"Aanvullende instructies","ro":"Instrucțiuni suplimentare"},"placeholder":{},"help":{},"required":false,"maxLength":3000}]}'::jsonb, 'initial catalog (migration 217)'
  FROM catalog_services cs WHERE cs.service_code = 'digital_marketing'
ON CONFLICT (service_id, version) DO NOTHING;

-- logo_design
INSERT INTO catalog_services (service_code, category_id, visibility, price_mode, sort_order, current_version)
SELECT 'logo_design', c.id, 'public', 'manual_quote', 10, 1
  FROM categories c WHERE c.slug = 'design'
ON CONFLICT (service_code) DO NOTHING;
INSERT INTO catalog_service_versions (service_id, version, schema, change_note)
SELECT cs.id, 1, '{"name":{"ar":"تصميم شعار","en":"Logo design","de":"Logodesign","nl":"Logo-ontwerp","ro":"Design logo"},"description":{},"quantity":{"unit":"concepts","required":true,"allowUnspecified":false,"decimals":false,"min":1,"max":10},"fields":[{"key":"brand_name","type":"text","label":{"ar":"اسم العلامة","en":"Brand name","de":"Markenname","nl":"Merknaam","ro":"Numele mărcii"},"placeholder":{},"help":{},"required":true,"maxLength":120},{"key":"industry","type":"text","label":{"ar":"المجال","en":"Industry","de":"Branche","nl":"Branche","ro":"Domeniu de activitate"},"placeholder":{},"help":{},"required":false,"maxLength":120},{"key":"style","type":"select","label":{"ar":"النمط","en":"Style","de":"Stil","nl":"Stijl","ro":"Stil"},"placeholder":{},"help":{},"required":false,"options":[{"value":"modern","label":{"ar":"حديث","en":"Modern","de":"Modern","nl":"Modern","ro":"Modern"}},{"value":"classic","label":{"ar":"كلاسيكي","en":"Classic","de":"Klassisch","nl":"Klassiek","ro":"Clasic"}},{"value":"minimal","label":{"ar":"بسيط","en":"Minimal","de":"Minimalistisch","nl":"Minimalistisch","ro":"Minimalist"}},{"value":"playful","label":{"ar":"مرح","en":"Playful","de":"Verspielt","nl":"Speels","ro":"Jucăuș"}}]},{"key":"colors","type":"text","label":{"ar":"الألوان المفضلة","en":"Preferred colors","de":"Bevorzugte Farben","nl":"Voorkeurskleuren","ro":"Culori preferate"},"placeholder":{},"help":{},"required":false,"maxLength":200},{"key":"formats","type":"multiselect","label":{"ar":"الصيغ المطلوبة","en":"Required formats","de":"Benötigte Formate","nl":"Gewenste formaten","ro":"Formate necesare"},"placeholder":{},"help":{},"required":true,"options":[{"value":"png","label":{"ar":"PNG","en":"PNG","de":"PNG","nl":"PNG","ro":"PNG"}},{"value":"svg","label":{"ar":"SVG","en":"SVG","de":"SVG","nl":"SVG","ro":"SVG"}},{"value":"pdf","label":{"ar":"PDF","en":"PDF","de":"PDF","nl":"PDF","ro":"PDF"}},{"value":"ai","label":{"ar":"AI (مصدر)","en":"AI (source)","de":"AI (Quelldatei)","nl":"AI (bronbestand)","ro":"AI (sursă)"}}]},{"key":"visual_references","type":"file","label":{"ar":"مراجع بصرية","en":"Visual references","de":"Visuelle Referenzen","nl":"Visuele referenties","ro":"Referințe vizuale"},"placeholder":{},"help":{},"required":false,"max":5}]}'::jsonb, 'initial catalog (migration 217)'
  FROM catalog_services cs WHERE cs.service_code = 'logo_design'
ON CONFLICT (service_id, version) DO NOTHING;

-- social_media_design
INSERT INTO catalog_services (service_code, category_id, visibility, price_mode, sort_order, current_version)
SELECT 'social_media_design', c.id, 'public', 'manual_quote', 20, 1
  FROM categories c WHERE c.slug = 'design'
ON CONFLICT (service_code) DO NOTHING;
INSERT INTO catalog_service_versions (service_id, version, schema, change_note)
SELECT cs.id, 1, '{"name":{"ar":"تصاميم سوشيال ميديا / بوستر","en":"Social media / poster design","de":"Social-Media- / Plakatdesign","nl":"Social media- / posterontwerp","ro":"Design social media / afiș"},"description":{},"quantity":{"unit":"designs","required":true,"allowUnspecified":false,"decimals":false,"min":1,"max":200},"fields":[{"key":"platform","type":"select","label":{"ar":"المنصة","en":"Platform","de":"Plattform","nl":"Platform","ro":"Platformă"},"placeholder":{},"help":{},"required":true,"options":[{"value":"instagram","label":{"ar":"إنستغرام","en":"Instagram","de":"Instagram","nl":"Instagram","ro":"Instagram"}},{"value":"facebook","label":{"ar":"فيسبوك","en":"Facebook","de":"Facebook","nl":"Facebook","ro":"Facebook"}},{"value":"tiktok","label":{"ar":"تيك توك","en":"TikTok","de":"TikTok","nl":"TikTok","ro":"TikTok"}},{"value":"print","label":{"ar":"طباعة","en":"Print","de":"Druck","nl":"Druk","ro":"Tipar"}}]},{"key":"dimensions","type":"text","label":{"ar":"المقاس","en":"Dimensions","de":"Abmessungen","nl":"Afmetingen","ro":"Dimensiuni"},"placeholder":{},"help":{},"required":false,"maxLength":80},{"key":"text_content","type":"textarea","label":{"ar":"النص المطلوب","en":"Text content","de":"Textinhalt","nl":"Tekstinhoud","ro":"Conținut text"},"placeholder":{},"help":{},"required":false,"maxLength":2000},{"key":"language","type":"select","label":{"ar":"اللغة","en":"Language","de":"Sprache","nl":"Taal","ro":"Limba"},"placeholder":{},"help":{},"required":false,"options":[{"value":"ar","label":{"ar":"العربية","en":"Arabic","de":"Arabisch","nl":"Arabisch","ro":"Arabă"}},{"value":"en","label":{"ar":"الإنجليزية","en":"English","de":"Englisch","nl":"Engels","ro":"Engleză"}},{"value":"other","label":{"ar":"لغة أخرى","en":"Other language","de":"Andere Sprache","nl":"Andere taal","ro":"Altă limbă"}}]},{"key":"reference_files","type":"file","label":{"ar":"ملفات مرجعية","en":"Reference files","de":"Referenzdateien","nl":"Referentiebestanden","ro":"Fișiere de referință"},"placeholder":{},"help":{},"required":false,"max":5}]}'::jsonb, 'initial catalog (migration 217)'
  FROM catalog_services cs WHERE cs.service_code = 'social_media_design'
ON CONFLICT (service_id, version) DO NOTHING;

-- presentation_design
INSERT INTO catalog_services (service_code, category_id, visibility, price_mode, sort_order, current_version)
SELECT 'presentation_design', c.id, 'public', 'manual_quote', 30, 1
  FROM categories c WHERE c.slug = 'design'
ON CONFLICT (service_code) DO NOTHING;
INSERT INTO catalog_service_versions (service_id, version, schema, change_note)
SELECT cs.id, 1, '{"name":{"ar":"عرض تقديمي (بوربوينت)","en":"Presentation (PowerPoint)","de":"Präsentation (PowerPoint)","nl":"Presentatie (PowerPoint)","ro":"Prezentare (PowerPoint)"},"description":{},"quantity":{"unit":"slides","required":true,"allowUnspecified":false,"decimals":false,"min":1,"max":300},"fields":[{"key":"content_readiness","type":"radio","label":{"ar":"جاهزية المحتوى","en":"Content readiness","de":"Inhalt vorhanden?","nl":"Is de inhoud klaar?","ro":"Conținut pregătit?"},"placeholder":{},"help":{},"required":true,"options":[{"value":"ready","label":{"ar":"المحتوى جاهز","en":"Content is ready","de":"Inhalt ist fertig","nl":"Inhoud is klaar","ro":"Conținutul este gata"}},{"value":"partial","label":{"ar":"جاهز جزئيًا","en":"Partly ready","de":"Teilweise fertig","nl":"Gedeeltelijk klaar","ro":"Parțial gata"}},{"value":"needed","label":{"ar":"مطلوب كتابة المحتوى","en":"Content must be written","de":"Inhalt muss erstellt werden","nl":"Inhoud moet geschreven worden","ro":"Conținutul trebuie scris"}}]},{"key":"presentation_type","type":"select","label":{"ar":"نوع العرض","en":"Presentation type","de":"Art der Präsentation","nl":"Type presentatie","ro":"Tipul prezentării"},"placeholder":{},"help":{},"required":true,"options":[{"value":"academic","label":{"ar":"أكاديمي","en":"Academic","de":"Akademisch","nl":"Academisch","ro":"Academic"}},{"value":"business","label":{"ar":"تجاري","en":"Business","de":"Geschäftlich","nl":"Zakelijk","ro":"De afaceri"}},{"value":"pitch_deck","label":{"ar":"Pitch Deck","en":"Pitch deck","de":"Pitch-Deck","nl":"Pitch deck","ro":"Pitch deck"}},{"value":"training","label":{"ar":"تدريبي","en":"Training","de":"Schulung","nl":"Training","ro":"Instruire"}}]},{"key":"brand_identity","type":"checkbox","label":{"ar":"يوجد هوية بصرية يجب الالتزام بها","en":"Brand identity must be followed","de":"Corporate Design ist vorgegeben","nl":"Huisstijl moet worden gevolgd","ro":"Identitatea vizuală trebuie respectată"},"placeholder":{},"help":{},"required":false},{"key":"charts","type":"checkbox","label":{"ar":"يتضمن مخططات ورسومًا بيانية","en":"Includes charts","de":"Enthält Diagramme","nl":"Bevat grafieken","ro":"Include grafice"},"placeholder":{},"help":{},"required":false},{"key":"language","type":"select","label":{"ar":"اللغة","en":"Language","de":"Sprache","nl":"Taal","ro":"Limba"},"placeholder":{},"help":{},"required":true,"options":[{"value":"ar","label":{"ar":"العربية","en":"Arabic","de":"Arabisch","nl":"Arabisch","ro":"Arabă"}},{"value":"en","label":{"ar":"الإنجليزية","en":"English","de":"Englisch","nl":"Engels","ro":"Engleză"}},{"value":"other","label":{"ar":"لغة أخرى","en":"Other language","de":"Andere Sprache","nl":"Andere taal","ro":"Altă limbă"}}]},{"key":"output_formats","type":"multiselect","label":{"ar":"صيغ التسليم","en":"Output formats","de":"Ausgabeformate","nl":"Uitvoerformaten","ro":"Formate de livrare"},"placeholder":{},"help":{},"required":true,"min":1,"options":[{"value":"pptx","label":{"ar":"PPTX","en":"PPTX","de":"PPTX","nl":"PPTX","ro":"PPTX"}},{"value":"pdf","label":{"ar":"PDF","en":"PDF","de":"PDF","nl":"PDF","ro":"PDF"}}]},{"key":"reference_files","type":"file","label":{"ar":"ملفات مرجعية","en":"Reference files","de":"Referenzdateien","nl":"Referentiebestanden","ro":"Fișiere de referință"},"placeholder":{},"help":{},"required":false,"max":5}]}'::jsonb, 'initial catalog (migration 217)'
  FROM catalog_services cs WHERE cs.service_code = 'presentation_design'
ON CONFLICT (service_id, version) DO NOTHING;

-- video_editing
INSERT INTO catalog_services (service_code, category_id, visibility, price_mode, sort_order, current_version)
SELECT 'video_editing', c.id, 'public', 'manual_quote', 40, 1
  FROM categories c WHERE c.slug = 'design'
ON CONFLICT (service_code) DO NOTHING;
INSERT INTO catalog_service_versions (service_id, version, schema, change_note)
SELECT cs.id, 1, '{"name":{"ar":"مونتاج وإنتاج فيديو","en":"Video editing & production","de":"Videoschnitt & -produktion","nl":"Videobewerking & -productie","ro":"Editare și producție video"},"description":{},"quantity":{"unit":"minutes","required":true,"allowUnspecified":false,"decimals":true,"min":0.5,"max":600},"fields":[{"key":"raw_material","type":"radio","label":{"ar":"المواد الخام","en":"Raw material","de":"Rohmaterial","nl":"Ruw materiaal","ro":"Material brut"},"placeholder":{},"help":{},"required":true,"options":[{"value":"provided","label":{"ar":"سأرسل المواد","en":"I will provide it","de":"Ich stelle es bereit","nl":"Ik lever het aan","ro":"Îl voi furniza"}},{"value":"needed","label":{"ar":"مطلوب توفيرها","en":"Must be sourced","de":"Muss beschafft werden","nl":"Moet worden verzorgd","ro":"Trebuie procurat"}}]},{"key":"dimensions","type":"select","label":{"ar":"الأبعاد","en":"Dimensions","de":"Format","nl":"Formaat","ro":"Dimensiuni"},"placeholder":{},"help":{},"required":false,"options":[{"value":"landscape","label":{"ar":"أفقي 16:9","en":"Landscape 16:9","de":"Querformat 16:9","nl":"Liggend 16:9","ro":"Orizontal 16:9"}},{"value":"vertical","label":{"ar":"عمودي 9:16","en":"Vertical 9:16","de":"Hochformat 9:16","nl":"Staand 9:16","ro":"Vertical 9:16"}},{"value":"square","label":{"ar":"مربع 1:1","en":"Square 1:1","de":"Quadratisch 1:1","nl":"Vierkant 1:1","ro":"Pătrat 1:1"}}]},{"key":"captions","type":"checkbox","label":{"ar":"ترجمة / نص على الفيديو","en":"Captions / subtitles","de":"Untertitel","nl":"Ondertiteling","ro":"Subtitrări"},"placeholder":{},"help":{},"required":false},{"key":"caption_language","type":"select","label":{"ar":"لغة الترجمة","en":"Caption language","de":"Untertitelsprache","nl":"Taal ondertiteling","ro":"Limba subtitrării"},"placeholder":{},"help":{},"required":false,"options":[{"value":"ar","label":{"ar":"العربية","en":"Arabic","de":"Arabisch","nl":"Arabisch","ro":"Arabă"}},{"value":"en","label":{"ar":"الإنجليزية","en":"English","de":"Englisch","nl":"Engels","ro":"Engleză"}},{"value":"other","label":{"ar":"لغة أخرى","en":"Other language","de":"Andere Sprache","nl":"Andere taal","ro":"Altă limbă"}}],"showIf":{"field":"captions","in":[true]}},{"key":"voiceover","type":"checkbox","label":{"ar":"تعليق صوتي","en":"Voice-over","de":"Sprecherstimme","nl":"Voice-over","ro":"Voce din off"},"placeholder":{},"help":{},"required":false},{"key":"effects_notes","type":"textarea","label":{"ar":"المؤثرات والملاحظات","en":"Effects & notes","de":"Effekte & Hinweise","nl":"Effecten & opmerkingen","ro":"Efecte și note"},"placeholder":{},"help":{},"required":false,"maxLength":2000}]}'::jsonb, 'initial catalog (migration 217)'
  FROM catalog_services cs WHERE cs.service_code = 'video_editing'
ON CONFLICT (service_id, version) DO NOTHING;

-- website_development
INSERT INTO catalog_services (service_code, category_id, visibility, price_mode, sort_order, current_version)
SELECT 'website_development', c.id, 'public', 'manual_quote', 10, 1
  FROM categories c WHERE c.slug = 'programming'
ON CONFLICT (service_code) DO NOTHING;
INSERT INTO catalog_service_versions (service_id, version, schema, change_note)
SELECT cs.id, 1, '{"name":{"ar":"تطوير موقع إلكتروني","en":"Website development","de":"Website-Entwicklung","nl":"Websiteontwikkeling","ro":"Dezvoltare site web"},"description":{},"quantity":{"unit":"pages","required":false,"allowUnspecified":true,"decimals":false,"min":1,"max":500},"fields":[{"key":"user_types","type":"text","label":{"ar":"أنواع المستخدمين","en":"User types","de":"Benutzertypen","nl":"Gebruikerstypen","ro":"Tipuri de utilizatori"},"placeholder":{},"help":{},"required":false,"maxLength":300},{"key":"admin_panel","type":"radio","label":{"ar":"لوحة إدارة","en":"Admin panel","de":"Admin-Bereich","nl":"Beheerpaneel","ro":"Panou de administrare"},"placeholder":{},"help":{},"required":true,"options":[{"value":"yes","label":{"ar":"نعم","en":"Yes","de":"Ja","nl":"Ja","ro":"Da"}},{"value":"no","label":{"ar":"لا","en":"No","de":"Nein","nl":"Nee","ro":"Nu"}}]},{"key":"site_languages","type":"multiselect","label":{"ar":"لغات الموقع","en":"Site languages","de":"Sprachen der Website","nl":"Talen van de website","ro":"Limbile site-ului"},"placeholder":{},"help":{},"required":true,"options":[{"value":"ar","label":{"ar":"العربية","en":"Arabic","de":"Arabisch","nl":"Arabisch","ro":"Arabă"}},{"value":"en","label":{"ar":"الإنجليزية","en":"English","de":"Englisch","nl":"Engels","ro":"Engleză"}},{"value":"other","label":{"ar":"لغة أخرى","en":"Other language","de":"Andere Sprache","nl":"Andere taal","ro":"Altă limbă"}}]},{"key":"payments","type":"radio","label":{"ar":"دفع إلكتروني","en":"Online payments","de":"Online-Zahlungen","nl":"Online betalingen","ro":"Plăți online"},"placeholder":{},"help":{},"required":true,"options":[{"value":"yes","label":{"ar":"نعم","en":"Yes","de":"Ja","nl":"Ja","ro":"Da"}},{"value":"no","label":{"ar":"لا","en":"No","de":"Nein","nl":"Nee","ro":"Nu"}}]},{"key":"integrations","type":"textarea","label":{"ar":"التكاملات المطلوبة","en":"Required integrations","de":"Benötigte Integrationen","nl":"Vereiste integraties","ro":"Integrări necesare"},"placeholder":{},"help":{},"required":false,"maxLength":2000},{"key":"domain_hosting","type":"select","label":{"ar":"الدومين والاستضافة","en":"Domain & hosting","de":"Domain & Hosting","nl":"Domein & hosting","ro":"Domeniu și găzduire"},"placeholder":{},"help":{},"required":false,"options":[{"value":"have","label":{"ar":"متوفران لدي","en":"I already have them","de":"Bereits vorhanden","nl":"Heb ik al","ro":"Le am deja"}},{"value":"needed","label":{"ar":"مطلوب توفيرهما","en":"Must be arranged","de":"Muss eingerichtet werden","nl":"Moet geregeld worden","ro":"Trebuie asigurate"}}]},{"key":"reference_site","type":"url","label":{"ar":"موقع مرجعي","en":"Reference website","de":"Referenz-Website","nl":"Referentiewebsite","ro":"Site de referință"},"placeholder":{},"help":{},"required":false}]}'::jsonb, 'initial catalog (migration 217)'
  FROM catalog_services cs WHERE cs.service_code = 'website_development'
ON CONFLICT (service_id, version) DO NOTHING;

-- mobile_app_development
INSERT INTO catalog_services (service_code, category_id, visibility, price_mode, sort_order, current_version)
SELECT 'mobile_app_development', c.id, 'public', 'manual_quote', 20, 1
  FROM categories c WHERE c.slug = 'programming'
ON CONFLICT (service_code) DO NOTHING;
INSERT INTO catalog_service_versions (service_id, version, schema, change_note)
SELECT cs.id, 1, '{"name":{"ar":"تطوير تطبيق جوال","en":"Mobile app development","de":"App-Entwicklung","nl":"App-ontwikkeling","ro":"Dezvoltare aplicație mobilă"},"description":{},"quantity":{"unit":"screens","required":false,"allowUnspecified":true,"decimals":false,"min":1,"max":500},"fields":[{"key":"platforms","type":"multiselect","label":{"ar":"المنصات","en":"Platforms","de":"Plattformen","nl":"Platforms","ro":"Platforme"},"placeholder":{},"help":{},"required":true,"options":[{"value":"android","label":{"ar":"أندرويد","en":"Android","de":"Android","nl":"Android","ro":"Android"}},{"value":"ios","label":{"ar":"iOS","en":"iOS","de":"iOS","nl":"iOS","ro":"iOS"}}]},{"key":"auth","type":"radio","label":{"ar":"تسجيل دخول المستخدمين","en":"User sign-in","de":"Benutzeranmeldung","nl":"Inloggen van gebruikers","ro":"Autentificare utilizatori"},"placeholder":{},"help":{},"required":true,"options":[{"value":"yes","label":{"ar":"نعم","en":"Yes","de":"Ja","nl":"Ja","ro":"Da"}},{"value":"no","label":{"ar":"لا","en":"No","de":"Nein","nl":"Nee","ro":"Nu"}}]},{"key":"notifications","type":"radio","label":{"ar":"إشعارات","en":"Push notifications","de":"Push-Benachrichtigungen","nl":"Pushmeldingen","ro":"Notificări push"},"placeholder":{},"help":{},"required":false,"options":[{"value":"yes","label":{"ar":"نعم","en":"Yes","de":"Ja","nl":"Ja","ro":"Da"}},{"value":"no","label":{"ar":"لا","en":"No","de":"Nein","nl":"Nee","ro":"Nu"}}]},{"key":"apis","type":"textarea","label":{"ar":"واجهات API والتكاملات","en":"APIs & integrations","de":"APIs & Integrationen","nl":"API''s & integraties","ro":"API-uri și integrări"},"placeholder":{},"help":{},"required":false,"maxLength":2000},{"key":"design_source","type":"select","label":{"ar":"مصدر التصميم","en":"Design source","de":"Designquelle","nl":"Bron van het ontwerp","ro":"Sursa designului"},"placeholder":{},"help":{},"required":false,"options":[{"value":"provided","label":{"ar":"التصميم جاهز","en":"Design provided","de":"Design vorhanden","nl":"Ontwerp aangeleverd","ro":"Design furnizat"}},{"value":"needed","label":{"ar":"مطلوب التصميم","en":"Design needed","de":"Design benötigt","nl":"Ontwerp nodig","ro":"Design necesar"}}]}]}'::jsonb, 'initial catalog (migration 217)'
  FROM catalog_services cs WHERE cs.service_code = 'mobile_app_development'
ON CONFLICT (service_id, version) DO NOTHING;

-- excel_data
INSERT INTO catalog_services (service_code, category_id, visibility, price_mode, sort_order, current_version)
SELECT 'excel_data', c.id, 'public', 'manual_quote', 30, 1
  FROM categories c WHERE c.slug = 'programming'
ON CONFLICT (service_code) DO NOTHING;
INSERT INTO catalog_service_versions (service_id, version, schema, change_note)
SELECT cs.id, 1, '{"name":{"ar":"Excel وتحليل البيانات","en":"Excel & data","de":"Excel & Daten","nl":"Excel & data","ro":"Excel și date"},"description":{},"quantity":{"unit":"worksheets","required":true,"allowUnspecified":false,"decimals":false,"min":1,"max":200},"fields":[{"key":"data_size","type":"select","label":{"ar":"حجم البيانات","en":"Data size","de":"Datenumfang","nl":"Omvang van de data","ro":"Volumul datelor"},"placeholder":{},"help":{},"required":false,"options":[{"value":"small","label":{"ar":"أقل من 1000 صف","en":"Under 1,000 rows","de":"Unter 1.000 Zeilen","nl":"Minder dan 1.000 rijen","ro":"Sub 1.000 de rânduri"}},{"value":"medium","label":{"ar":"1000–100000 صف","en":"1,000–100,000 rows","de":"1.000–100.000 Zeilen","nl":"1.000–100.000 rijen","ro":"1.000–100.000 de rânduri"}},{"value":"large","label":{"ar":"أكثر من 100000 صف","en":"Over 100,000 rows","de":"Über 100.000 Zeilen","nl":"Meer dan 100.000 rijen","ro":"Peste 100.000 de rânduri"}}]},{"key":"features","type":"multiselect","label":{"ar":"المطلوب","en":"Required work","de":"Benötigte Arbeiten","nl":"Gevraagd werk","ro":"Lucrări necesare"},"placeholder":{},"help":{},"required":true,"options":[{"value":"formulas","label":{"ar":"صيغ ومعادلات","en":"Formulas","de":"Formeln","nl":"Formules","ro":"Formule"}},{"value":"pivot","label":{"ar":"جداول محورية","en":"Pivot tables","de":"Pivot-Tabellen","nl":"Draaitabellen","ro":"Tabele pivot"}},{"value":"dashboard","label":{"ar":"لوحة مؤشرات","en":"Dashboard","de":"Dashboard","nl":"Dashboard","ro":"Tablou de bord"}},{"value":"power_query","label":{"ar":"Power Query","en":"Power Query","de":"Power Query","nl":"Power Query","ro":"Power Query"}},{"value":"vba","label":{"ar":"VBA / ماكرو","en":"VBA / macros","de":"VBA / Makros","nl":"VBA / macro''s","ro":"VBA / macrocomenzi"}},{"value":"cleaning","label":{"ar":"تنظيف البيانات","en":"Data cleaning","de":"Datenbereinigung","nl":"Data opschonen","ro":"Curățarea datelor"}}]},{"key":"source_data","type":"file","label":{"ar":"البيانات الأصلية","en":"Source data","de":"Quelldaten","nl":"Brongegevens","ro":"Date sursă"},"placeholder":{},"help":{},"required":false,"max":5},{"key":"instructions","type":"textarea","label":{"ar":"تعليمات إضافية","en":"Additional instructions","de":"Zusätzliche Anweisungen","nl":"Aanvullende instructies","ro":"Instrucțiuni suplimentare"},"placeholder":{},"help":{},"required":false,"maxLength":3000}]}'::jsonb, 'initial catalog (migration 217)'
  FROM catalog_services cs WHERE cs.service_code = 'excel_data'
ON CONFLICT (service_id, version) DO NOTHING;

-- custom_service
INSERT INTO catalog_services (service_code, category_id, visibility, price_mode, sort_order, current_version)
SELECT 'custom_service', c.id, 'admin_only', 'manual_quote', 10, 1
  FROM categories c WHERE c.slug = 'special-requests'
ON CONFLICT (service_code) DO NOTHING;
INSERT INTO catalog_service_versions (service_id, version, schema, change_note)
SELECT cs.id, 1, '{"name":{"ar":"خدمة مخصصة","en":"Custom service","de":"Individuelle Leistung","nl":"Maatwerkdienst","ro":"Serviciu personalizat"},"description":{},"quantity":{"unit":"units","required":false,"allowUnspecified":true,"decimals":true},"fields":[{"key":"scope","type":"textarea","label":{"ar":"نطاق العمل","en":"Scope of work","de":"Leistungsumfang","nl":"Omvang van het werk","ro":"Domeniul lucrării"},"placeholder":{},"help":{},"required":true,"maxLength":4000},{"key":"reference_files","type":"file","label":{"ar":"ملفات مرجعية","en":"Reference files","de":"Referenzdateien","nl":"Referentiebestanden","ro":"Fișiere de referință"},"placeholder":{},"help":{},"required":false,"max":5}]}'::jsonb, 'initial catalog (migration 217)'
  FROM catalog_services cs WHERE cs.service_code = 'custom_service'
ON CONFLICT (service_id, version) DO NOTHING;

-- Catalog management permission: super_admin role gets it; delegated admins only when a super admin
-- assigns it explicitly (catalog edits change what every new order asks for).
INSERT INTO permissions (key, module, display_name, description)
VALUES ('dashboard.admin.service_catalog', 'dashboard', 'لوحة الإدارة — كتالوج الخدمات',
        'إدارة الخدمات ونماذجها الديناميكية ونسخها.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key = 'dashboard.admin.service_catalog'
 WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('217_service_catalog_dynamic_forms')
ON CONFLICT (version) DO NOTHING;

COMMIT;
