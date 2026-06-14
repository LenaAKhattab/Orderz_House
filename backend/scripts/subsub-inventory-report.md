# Sub-Sub Category Full Inventory Report

## Data Sources
- **Database**: PostgreSQL `sub_subcategories` joined with `subcategories`, `categories`
- **Order counts**: `orders.sub_subcategory_id` (real), `fake_orders.sub_subcategory_id` (training)
- **Public API**: `GET /api/public/sub-subcategories?page=&limit=` (same ordering as homepage)
- **Export script**: `backend/scripts/exportSubSubcategoryInventory.js`
- **Soft deletes**: None — deactivation uses `is_active = FALSE` only

## Summary Totals
| Metric | Count |
|--------|------:|
| Total Main Categories | 4 |
| Total Sub Categories | 9 |
| Total Sub-Sub Categories | 216 |
| Active Sub-Sub Categories | 216 |
| Inactive Sub-Sub Categories | 0 |
| Homepage-eligible (active chain) | 216 |

## Section 11 — Full Inventory (Grouped)

### خدمات البرمجة (`programming`, ID 1)

#### → خدمات برمجة الأعمال (`business-programming`, ID 1)

| ID | Name (AR) | Name (EN) | Slug | Status | Icon | Sort | Created | Updated | Real Orders | Training Orders |
|---:|---|---|---|:---:|:---:|---:|---|---|---:|---:|
| 145 | تطوير الواجهة الأمامية (Frontend) | Backend Development | `frontend-dev` | active | Database | 10 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 133 |
| 146 | تطوير الواجهة الخلفية (Backend) | Full Stack Development | `backend-dev` | active | Database | 20 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 69 |
| 147 | تطوير ويب متكامل (Full Stack) | Content Management Systems (CMS) | `full-stack-web` | active | Code2 | 30 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 148 | أنظمة إدارة المحتوى (CMS) | Custom Mobile App Development (iOS/Android) | `cms` | active | Smartphone | 40 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 149 | تطبيقات الجوال المخصصة (iOS/Android) | Cross-Platform App Development | `custom-mobile-apps` | active | Smartphone | 50 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 72 |
| 150 | تطبيقات عبر الأنظمة (Cross Platform) | Game Development (2D/3D) | `cross-platform-apps` | active | Smartphone | 60 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 151 | تطوير الألعاب (2D/3D) | Custom Software Development | `game-dev` | active | Code2 | 70 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 152 | برمجيات مخصصة (Custom Software) | Enterprise Software Development (ERP/CRM) | `custom-software` | active | Code2 | 80 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 1 | 0 |
| 153 | برمجيات مؤسسية (Enterprise Software – ERP/CRM) | API Development | `enterprise-software` | active | Code2 | 90 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 154 | تطوير واجهات برمجة التطبيقات (APIs) | System Integration Services | `api-dev` | active | Smartphone | 100 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 155 | دمج الأنظمة (Integration Services) | Cloud-Native Applications | `integration-services` | active | Code2 | 110 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 156 | تطبيقات سحابية (Cloud Native) | Serverless / BaaS Services | `cloud-native` | active | Smartphone | 120 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 157 | Serverless/BaaS | DevOps Services | `serverless-baas` | active | Code2 | 130 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 158 | خدمات DevOps | Artificial Intelligence (AI) | `devops` | active | Bot | 140 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 159 | الذكاء الاصطناعي | Machine Learning (ML) | `ai` | active | Bot | 150 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 160 | تعلم الآلة | Natural Language Processing (NLP) | `ml` | active | Code2 | 160 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 161 | معالجة اللغة الطبيعية (NLP) | Computer Vision | `nlp` | active | Code2 | 170 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 162 | الرؤية الحاسوبية (Computer Vision) | Cybersecurity Solutions | `computer-vision` | active | Code2 | 180 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 163 | الأمن السيبراني | Penetration Testing | `cybersecurity` | active | Code2 | 190 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 164 | اختبارات الاختراق | Encryption Services | `penetration-testing` | active | Code2 | 200 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 165 | التشفير | E-commerce Development | `encryption` | active | ShoppingCart | 210 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 166 | تطوير متاجر إلكترونية | Online Payment Integration | `ecommerce-dev` | active | ShoppingCart | 220 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 167 | أنظمة الدفع الإلكتروني | Database Programming | `payment-integration` | active | Database | 230 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 168 | برمجة قواعد البيانات | Data Migration | `db-programming` | active | Code2 | 240 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |

#### → خدمات البرمجة الأكاديمية (`academic-programming`, ID 2)

| ID | Name (AR) | Name (EN) | Slug | Status | Icon | Sort | Created | Updated | Real Orders | Training Orders |
|---:|---|---|---|:---:|:---:|---:|---|---|---:|---:|
| 169 | حل واجبات البرمجة | Programming Assignment Help | `programming-assignment-help` | active | Code2 | 10 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 170 | تنفيذ المشاريع الأكاديمية | Academic Project Development | `academic-project-development` | active | Code2 | 20 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 171 | تصحيح الأخطاء البرمجية | Bug Fixing | `bug-fixing` | active | Code2 | 30 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 172 | تحسين الكود | Code Optimization | `code-optimization` | active | Code2 | 40 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 173 | تصميم الخوارزميات | Algorithm Design | `algorithm-design` | active | Code2 | 50 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 174 | هياكل البيانات | Data Structures | `data-structures` | active | Code2 | 60 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 175 | برمجة قواعد البيانات | Database Programming | `academic-db-programming` | active | Database | 70 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 176 | تطوير الواجهة الأمامية | Frontend Development | `frontend-development` | active | Code2 | 80 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 177 | تطوير الواجهة الخلفية | Backend Development | `backend-development` | active | Database | 90 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 178 | تطوير تطبيقات سطح المكتب | Desktop Application Development | `desktop-application-development` | active | Smartphone | 100 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 179 | برمجة واجهات رسومية (GUI) | Graphical User Interface (GUI) Programming | `gui-programming` | active | Code2 | 110 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 180 | كتابة الوثائق التقنية | Technical Documentation | `technical-documentation` | active | Code2 | 120 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 181 | دعم كتابة الأبحاث التقنية | Research Paper Programming Support | `research-paper-programming-support` | active | Code2 | 130 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 182 | إعداد دراسات حالة | Case Study Development | `case-study-development` | active | Code2 | 140 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 183 | جلسات تعليمية برمجية | Code Review Sessions | `code-review-sessions` | active | Code2 | 150 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 184 | مراجعة الكود | Code Tutoring | `code-tutoring` | active | Code2 | 160 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 185 | دعم متكامل حسب الجامعة | University-Specific Project Support | `university-specific-support` | active | Code2 | 170 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 186 | التحديثات والصيانة الأكاديمية | Academic Code Maintenance | `academic-code-maintenance` | active | Code2 | 180 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 187 | مساعدة في مشاريع بحث الذكاء الاصطناعي | AI Research Project Development | `ai-research-project-development` | active | Bot | 190 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 188 | تطوير محاكاة تعليمية | Educational Simulation Development | `educational-simulation-development` | active | Code2 | 200 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 189 | كتابة خوارزميات متقدمة ونماذج بحثية | Advanced Algorithm & Model Writing | `advanced-algorithm-model-writing` | active | Code2 | 210 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 190 | تطوير واجهات رسومية تعليمية | GUI For Research Tools Development | `gui-research-tools-development` | active | Code2 | 220 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 191 | برمجة أدوات التحليل الإحصائي | Statistical Analysis Tool Development | `statistical-analysis-tools` | active | Code2 | 230 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 192 | تطوير أطر اختبار البرمجيات الأكاديمية | Academic Software Testing Frameworks | `academic-testing-frameworks` | active | Code2 | 240 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |

#### → خدمات البرمجة الشخصية (`personal-programming`, ID 3)

| ID | Name (AR) | Name (EN) | Slug | Status | Icon | Sort | Created | Updated | Real Orders | Training Orders |
|---:|---|---|---|:---:|:---:|---:|---|---|---:|---:|
| 193 | سكريبتات أتمتة المتصفح | Browser Automation Scripts | `browser-automation-scripts` | active | Code2 | 10 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 194 | سكريبتات حجز البيانات | Data Collection Scripts | `data-collection-scripts` | active | Code2 | 20 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 195 | بوتات محادثة | Chat Bots | `chat-bots` | active | Bot | 30 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 196 | تكامل واجهات API | Custom API Integration | `custom-api-integration` | active | Code2 | 40 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 197 | سكريبتات سحب وتحليل البيانات | Data Scraping and Parsing Scripts | `data-scraping-parsing-scripts` | active | Code2 | 50 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 198 | أدوات تتبع الأسعار | Price Tracking Tools | `price-tracking-tools` | active | Code2 | 60 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 199 | سكريبتات العمل المكتبي | Office Task Automation Scripts | `office-task-automation` | active | Code2 | 70 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 200 | Macros للـExcel وGoogle Sheets | Excel/Google Sheets Macros | `excel-google-sheets-macros` | active | Code2 | 80 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 201 | أدوات GUI مخصصة | Custom GUI Tools | `custom-gui-tools` | active | Code2 | 90 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 202 | أدوات سطح المكتب | Desktop Utility Applications | `desktop-utility-apps` | active | Code2 | 100 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 203 | امتدادات المتصفح | Browser Extensions | `browser-extensions` | active | Code2 | 110 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 204 | مواقع شخصية | Personal Websites | `personal-websites` | active | Code2 | 120 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 205 | أدوات مساعدة شخصية | Personal Assistant Tools | `personal-assistant-tools` | active | Code2 | 130 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 206 | مولدات سيرة ذاتية ومحافظ أعمال | Resume and Portfolio Generators | `resume-portfolio-generators` | active | Code2 | 140 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 207 | مشاريع تعليمية | Educational Projects | `educational-projects` | active | Code2 | 150 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 208 | ألعاب شخصية | Mini Games | `mini-games` | active | Code2 | 160 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 209 | بوتات Discord/Telegram | Discord/Telegram Bots | `discord-telegram-bots` | active | Bot | 170 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 210 | أدوات تعليم الذكاء الاصطناعي | AI Integration Tools | `ai-integration-tools` | active | Bot | 180 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 211 | سكريبتات مخصصة حسب الطلب | Custom Code Requests | `custom-code-requests` | active | Code2 | 190 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 212 | برمجة للهواة والمبتدئين | Hobby and Beginner Projects | `hobby-beginner-projects` | active | Code2 | 200 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 213 | برمجة تطبيقات الهواتف الشخصية | Personal Mobile App Development | `personal-mobile-app-development` | active | Smartphone | 210 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 214 | تطوير أدوات الإنتاجية الشخصية | Personal Productivity Automation Scripts | `personal-productivity-automation` | active | Code2 | 220 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 215 | بناء مواقع الويب الشخصية أو المدونات | Personal Website Dev | `personal-website-dev` | active | Code2 | 230 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 216 | تطوير روبوتات الدردشة لخدمة شخصية | Personal Chatbot Dev | `personal-chatbot-dev` | active | Bot | 240 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |

### خدمات التصميم (`design`, ID 2)

#### → خدمات التصميم في مجال الأعمال (`business-design`, ID 7)

| ID | Name (AR) | Name (EN) | Slug | Status | Icon | Sort | Created | Updated | Real Orders | Training Orders |
|---:|---|---|---|:---:|:---:|---:|---|---|---:|---:|
| 73 | هوية العلامة التجارية | Brand Identity | `brand-identity` | active | PenTool | 10 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 58 |
| 74 | تصميم الشعار | Logo Design | `logo-design` | active | PenTool | 20 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 75 | تطوير دليل هوية متكامل | Comprehensive Brand Style Guide | `comprehensive-brand-style-guide` | active | PenTool | 30 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 76 | تطوير استراتيجية العلامة التجارية البصرية | Visual Brand Strategy | `visual-brand-strategy` | active | PenTool | 40 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 77 | تصميم مواقع الويب | Website Design | `website-design` | active | Code2 | 50 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 80 |
| 78 | تصميم صفحات الهبوط | Landing Page Design | `landing-page-design` | active | Palette | 60 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 79 | تصميم واجهات التطبيقات | App UI Design | `app-ui-design` | active | Smartphone | 70 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 80 | تصميم الإعلانات الرقمية والمطبوعة | Digital and Print Advertising Design | `digital-print-advertising-design` | active | Palette | 80 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 48 |
| 81 | تصميم مواد حملة التسويق | Marketing Campaign Materials Design | `marketing-campaign-materials-design` | active | Palette | 90 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 82 | تصميم رسائل البريد الإلكتروني والنشرات | Email Marketing Graphics and Newsletters | `email-marketing-graphics-newsletters` | active | Palette | 100 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 83 | تصميم منشورات الوسائط الاجتماعية | Social Media Posts Design | `social-media-posts-design` | active | Palette | 110 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 84 | تصميم صور الغلاف لمنصات التواصل | Social Media Cover and Ad Images | `social-media-cover-ad-images` | active | Camera | 120 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 85 | تصميم التعبئة والتغليف والمنتجات | Packaging and Product Design | `packaging-product-design` | active | Palette | 130 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 86 | تصميم البضائع الترويجية | Promotional Merchandise Design | `promotional-merchandise-design` | active | Palette | 140 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 87 | تصميم بطاقات الأعمال والأوراق الرسمية | Business Cards and Stationery Design | `business-cards-stationery-design` | active | Brush | 150 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 88 | تصميم اللوحات الإرشادية واللافتات | Signage and Large Format Banners Design | `signage-banners-design` | active | Palette | 160 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 89 | تصميم الإنفوجرافيك والبيانات المرئية | Infographics and Data Visualization | `infographics-data-visualization` | active | Palette | 170 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 90 | تصميم الرسوم المتحركة | Motion Graphics Design | `motion-graphics-design` | active | Palette | 180 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 91 | تصميم الفيديوهات الترويجية | Promotional Video Design | `promotional-video-design` | active | Video | 190 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 92 | التصميم البيئي واللوحات Wayfinding | Environmental and Wayfinding Design | `environmental-wayfinding-design` | active | Palette | 200 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 93 | تصميم الرسوم التوضيحية | Illustration Design | `illustration-design` | active | Brush | 210 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 94 | تصميم الطباعة الاحترافية | Typography Design | `typography-design` | active | Palette | 220 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 95 | تصميم المواد التقديمية التجارية | Corporate Presentation Design | `corporate-presentation-design` | active | Presentation | 230 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 96 | تصميم محتوى مرئي رقمي | Visual Content for Blogs and Websites | `visual-content-blogs-websites` | active | Code2 | 240 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |

#### → خدمات التصميم في المجال الأكاديمي (`academic-design`, ID 8)

| ID | Name (AR) | Name (EN) | Slug | Status | Icon | Sort | Created | Updated | Real Orders | Training Orders |
|---:|---|---|---|:---:|:---:|---:|---|---|---:|---:|
| 97 | تصميم البوسترات الأكاديمية والمؤتمرات | Academic and Conference Poster Design | `academic-conference-poster-design` | active | Palette | 10 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 98 | إعداد ملفات جاهزة للطباعة أو العرض الإلكتروني | Print-Ready and Electronic File Preparation | `print-ready-electronic-prep` | active | Presentation | 20 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 99 | تصميم الرسوم والإنفوجرافيك التوضيحية | Illustrations and Infographics for Posters | `illustrations-infographics-posters` | active | Brush | 30 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 100 | مراجعة البوسترات وفق معايير المؤتمرات | Poster Review per Conference Standards | `poster-review-standards` | active | Palette | 40 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 101 | تصميم العروض التقديمية الأكاديمية | Academic Presentation Design | `academic-presentation-design` | active | Presentation | 50 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 102 | تصميم الجداول والمخططات والإنفوجرافيك | Table, Chart, and Infographic Design | `tables-charts-infographics-design` | active | Palette | 60 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 103 | دمج وسائط متعددة في العروض | Multimedia Integration in Presentations | `multimedia-integration-presentations` | active | Presentation | 70 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 104 | تصميم الملخصات والإنفوجرافيك التعليمية | Educational Summaries and Infographics | `educational-summaries-infographics` | active | Palette | 80 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 105 | توفير قوالب إنفوجرافيك قابلة للتعديل | Editable Infographic Templates | `editable-infographic-templates` | active | Palette | 90 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 106 | إعداد وتنسيق الرسائل والأطروحات | Thesis and Dissertation Formatting | `thesis-dissertation-formatting` | active | Palette | 100 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 107 | تصميم القوالب الأكاديمية | Academic Template Design | `academic-template-design` | active | Palette | 110 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 108 | تصميم الرسوم التوضيحية والخرائط العقلية | Illustrations and Mind Maps Design | `mind-maps-illustrations-design` | active | Brush | 120 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 109 | دعم التواصل العلمي | Scientific Communication Support | `scientific-communication-support` | active | Palette | 130 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 110 | تصميم الملخصات الرسومية للمقالات العلمية | Graphical Abstracts Design | `graphical-abstracts-design` | active | Palette | 140 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 111 | خدمات التنفيذ السريع والتعاوني | Fast and Collaborative Design Services | `fast-collaborative-design-services` | active | Palette | 150 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 112 | تصميم المجلات والكتب الأكاديمية | Academic Journal Layout Design | `academic-journal-layout` | active | Palette | 160 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 113 | تصميم منصة التعلم الإلكتروني وقالبها | e-Learning Platform Interface Design | `elearning-platform-interface` | active | Palette | 170 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 114 | تصميم نماذج التصوير العلمي والبياني | Scientific Visualization Design | `scientific-visualization-design` | active | Camera | 180 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 115 | تصميم الواقع المعزّز للتعليم | AR Educational Experience Design | `ar-educational-experience` | active | Palette | 190 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 116 | تصميم منشورات تفاعلية للبحث | Interactive Research Publication Design | `interactive-research-publication` | active | Palette | 200 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 117 | تصميم اللوحات المعروضة في المعارض الأكاديمية | Exhibit/Poster Booth Design | `exhibit-poster-booth-design` | active | Palette | 210 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 118 | تصميم الخرائط الفكرية الديناميكية | Dynamic Mind-Map Design | `dynamic-mind-map-design` | active | Palette | 220 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 119 | تصميم الواقع الافتراضي لمحاكاة مختبرية | VR Lab Simulation Design | `vr-lab-simulation-design` | active | Palette | 230 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 120 | تصميم محتوى الواقع المعزّز للمحاضرات | AR Lecture Content Design | `ar-lecture-content-design` | active | Palette | 240 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |

#### → خدمات التصميم الشخصية (`personal-design`, ID 9)

| ID | Name (AR) | Name (EN) | Slug | Status | Icon | Sort | Created | Updated | Real Orders | Training Orders |
|---:|---|---|---|:---:|:---:|---:|---|---|---:|---:|
| 121 | بناء العلامة الشخصية | Personal Branding Design | `personal-branding-design` | active | PenTool | 10 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 122 | تصميم شعار شخصي | Personal Logo Design | `personal-logo-design` | active | PenTool | 20 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 123 | دليل العلامة الشخصية | Personal Brand Style Guide | `personal-brand-style-guide` | active | PenTool | 30 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 124 | قوالب اجتماعية شخصية | Personal Social Media Templates | `personal-social-media-templates` | active | Palette | 40 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 125 | تصميم الموقع الشخصي أو المدونة | Personal Website / Portfolio Design | `personal-website-portfolio-design` | active | Code2 | 50 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 126 | تصميم الدعوات وبطاقات التهاني | Invitation and Greeting Card Design | `invitation-greeting-card-design` | active | Palette | 60 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 127 | تحسين وتنسيق الصور الشخصية | Personal Photo Editing and Retouching | `photo-editing-retouching` | active | Camera | 70 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 128 | تصميم Mockups | Mockups Design | `mockups-design` | active | Palette | 80 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 129 | رسومات توضيحية وفنية شخصية | Personal Illustrations and Artwork | `personal-illustrations-artwork` | active | Brush | 90 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 130 | تصميم المجلات والمطبوعات الشخصية | Personal Magazines and Print Materials | `personal-magazines-print-materials` | active | Palette | 100 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 131 | تصميم عروض تقديم شخصية | Personal Presentation Design | `personal-presentation-design` | active | Presentation | 110 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 132 | تصميم القوالب الرقمية | Digital Template Design | `digital-template-design` | active | Palette | 120 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 133 | جلسات تدريب وتصميم شخصي | Personal Design Coaching and Workshops | `personal-design-coaching` | active | Palette | 130 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 134 | خدمات تنفيذ سريع حسب الطلب | On-Demand Rapid Design Services | `on-demand-rapid-design` | active | Palette | 140 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 135 | تصميم الهوية الشخصية ثلاثية الأبعاد | 3D Personal Brand Identity | `3d-personal-brand-identity` | active | PenTool | 150 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 136 | تصميم صالحات الواقع المعزّز للمنشورات الشخصية | AR Personal Social Posts | `ar-personal-social-posts` | active | Palette | 160 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 137 | تصميم الخريطة الزمنية الشخصية | Personal Timeline Graphic Design | `personal-timeline-graphic` | active | Palette | 170 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 138 | تصميم فيديو شخصي احترافي | Personal Promo Video Design | `personal-promo-video` | active | Video | 180 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 139 | تصميم مجلة شخصية رقمية | Digital Personal Magazine Design | `digital-personal-magazine` | active | Palette | 190 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 140 | تصميم تطبيق محفظة هوية شخصي | Personal Digital Identity Wallet Design | `personal-digital-identity-wallet` | active | Smartphone | 200 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 141 | تصميم قسم المدونة أو البورتفوليو الشخصي بتجربة UI/UX | Personal Website UI/UX Design | `personal-website-uiux` | active | Code2 | 210 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 142 | تصميم الواقع الافتراضي أو محاكاة للسيرة الذاتية | VR Resume/Portfolio Design | `vr-resume-portfolio` | active | Palette | 220 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 143 | تصميم شريط الحياة أو الرسائل الاحتفالية المتحركة | Animated Life-Event Graphics | `animated-life-event-graphics` | active | Palette | 230 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 144 | تصميم سيرة ذاتية بشكل إنفوجرافيك | Infographic CV Design | `infographic-cv-design` | active | Palette | 240 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |

### خدمات كتابة المحتوى (`content-writing`, ID 3)

#### → خدمات كتابة الأعمال (`business-writing`, ID 4)

| ID | Name (AR) | Name (EN) | Slug | Status | Icon | Sort | Created | Updated | Real Orders | Training Orders |
|---:|---|---|---|:---:|:---:|---:|---|---|---:|---:|
| 1 | كتابة بروفايل الشركات | Company Profile Writing | `company-profile-writing` | active | FileText | 10 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 2 | كتابة الوصف الوظيفي | Job Description Writing | `job-description-writing` | active | FileText | 20 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 3 | كتابة السياسات والإجراءات | Policies and Procedures Writing | `policies-procedures-writing` | active | FileText | 30 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 4 | كتابة أدلة الموظفين | Employee Handbooks Writing | `employee-handbooks-writing` | active | FileText | 40 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 5 | كتابة المراسلات الرسمية | Official Correspondence Writing | `official-correspondence-writing` | active | Brush | 50 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 6 | كتابة الإعلانات | Ad Copywriting | `ad-copywriting` | active | Megaphone | 60 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 157 |
| 7 | كتابة محتوى المواقع الإلكترونية | Website Content Writing | `website-content-writing` | active | Code2 | 70 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 149 |
| 8 | كتابة المدونات والمقالات | Blogs and Articles Writing | `blogs-articles-writing` | active | PenLine | 80 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 9 | كتابة محتوى وسائل التواصل الاجتماعي | Social Media Content Writing | `social-media-content-writing` | active | Megaphone | 90 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 10 | كتابة النشرات الإخبارية | Newsletters Writing | `newsletters-writing` | active | FileText | 100 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 11 | كتابة تقارير الأعمال | Business Reports Writing | `business-reports-writing` | active | FileText | 110 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 12 | كتابة خطط العمل | Business Plans Writing | `business-plans-writing` | active | FileText | 120 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 13 | كتابة دراسات الجدوى | Feasibility Studies Writing | `feasibility-studies-writing` | active | FileText | 130 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 14 | كتابة التحليلات السوقية | Market Analysis Writing | `market-analysis-writing` | active | BarChart3 | 140 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 15 | كتابة العروض التقديمية | Presentations Writing | `presentations-writing` | active | Presentation | 150 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 16 | كتابة مقترحات المشاريع | Project Proposals Writing | `project-proposals-writing` | active | FileText | 160 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 17 | كتابة طلبات العروض (RFPs) | Requests for Proposals (RFPs) Writing | `rfps-writing` | active | FileText | 170 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 18 | كتابة أدلة الاستخدام | User Manuals Writing | `user-manuals-writing` | active | FileText | 180 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 19 | كتابة المواد التدريبية | Training Materials Writing | `training-materials-writing` | active | FileText | 190 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 164 |
| 20 | كتابة الأسئلة الشائعة | FAQs Writing | `faqs-writing` | active | FileText | 200 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 21 | كتابة البيانات الصحفية | Press Releases Writing | `press-releases-writing` | active | FileText | 210 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 22 | كتابة المقالات الصحفية | Press Articles Writing | `press-articles-writing` | active | PenLine | 220 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 23 | كتابة الخطابات الرسمية | Official Speeches Writing | `official-speeches-writing` | active | Brush | 230 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 24 | كتابة السير الذاتية للشركات | Corporate Bios Writing | `corporate-bios-writing` | active | Smartphone | 240 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |

#### → خدمات الكتابة الأكاديمية (`academic-writing`, ID 5)

| ID | Name (AR) | Name (EN) | Slug | Status | Icon | Sort | Created | Updated | Real Orders | Training Orders |
|---:|---|---|---|:---:|:---:|---:|---|---|---:|---:|
| 25 | كتابة الأبحاث العلمية | Research Papers Writing | `research-papers-writing` | active | FileText | 10 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 26 | كتابة المقالات الأكاديمية | Academic Articles Writing | `academic-articles-writing` | active | PenLine | 20 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 27 | كتابة الأبحاث الجامعية | University Essays Writing | `university-essays-writing` | active | FileText | 30 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 28 | المساعدة في رسائل الماجستير والدكتوراه | Thesis and Dissertation Assistance/Writing | `thesis-dissertation-assistance` | active | FileText | 40 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 29 | كتابة تقارير المختبر | Lab Reports Writing | `lab-reports-writing` | active | FileText | 50 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 30 | كتابة تقارير الأعمال الأكاديمية | Business/Technical Reports Writing | `business-technical-reports-writing` | active | FileText | 60 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 31 | كتابة مراجعات الأدبيات | Literature Reviews Writing | `literature-reviews-writing` | active | FileText | 70 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 32 | كتابة المراجعات النقدية | Book/Film Reviews Writing | `book-film-reviews-writing` | active | FileText | 80 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 33 | التحرير الأكاديمي | Academic Editing | `academic-editing` | active | FileText | 90 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 34 | التدقيق اللغوي | Proofreading | `proofreading` | active | FileText | 100 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 35 | إعداد وإدارة قائمة المصادر | Citation Management | `citation-management` | active | FileText | 110 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 36 | دعم النشر | Publication Support | `publication-support` | active | FileText | 120 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 37 | توضيح الأشكال والرسومات | Figure Preparation | `figure-preparation` | active | FileText | 130 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 38 | كتابة مقترحات البحث | Research Proposals Writing | `research-proposals-writing` | active | FileText | 140 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 39 | كتابة الملخصات العلمية | Abstracts Writing | `abstracts-writing` | active | FileText | 150 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 40 | كتابة المقالات الشخصية الأكاديمية | Personal Reflection Essays Writing | `personal-reflection-essays-writing` | active | PenLine | 160 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 41 | الكتابة التقنية | Technical Writing | `technical-writing` | active | FileText | 170 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 42 | الكتابة الطبية | Medical Writing | `medical-writing` | active | FileText | 180 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 43 | خدمات الكتابة بالنيابة (Ghostwriting) | Ghostwriting | `ghostwriting` | active | FileText | 190 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 44 | كتابة مقالات متميزة للنشر في مجلات محكّمة | Peer-Reviewed Article Writing | `peer-reviewed-article-writing` | active | PenLine | 200 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 45 | كتابة «أوراق المؤتمرات» | Conference Paper Writing | `conference-paper-writing` | active | FileText | 210 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 46 | كتابة المحتوى التعليمي المفتوح | Open Educational Resources Writing | `open-educational-resources-writing` | active | FileText | 220 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 47 | كتابة أوراق تدوين الحالات الدراسية | Case Study Papers Writing | `case-study-papers-writing` | active | FileText | 230 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 48 | كتابة محتوى المساقات الإلكترونية | e-Learning Course Content Writing | `elearning-course-content-writing` | active | FileText | 240 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |

#### → خدمات الكتابة الشخصية (`personal-writing`, ID 6)

| ID | Name (AR) | Name (EN) | Slug | Status | Icon | Sort | Created | Updated | Real Orders | Training Orders |
|---:|---|---|---|:---:|:---:|---:|---|---|---:|---:|
| 49 | كتابة السيرة الذاتية | CV/Resume Writing | `cv-resume-writing` | active | FileText | 10 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 50 | كتابة رسائل التغطية | Cover Letters Writing | `cover-letters-writing` | active | FileText | 20 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 51 | كتابة رسائل التوصية | Recommendation Letters Writing | `recommendation-letters-writing` | active | FileText | 30 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 52 | كتابة خطابات القبول والاعتذار | Acceptance and Apology Letters Writing | `acceptance-apology-letters-writing` | active | FileText | 40 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 53 | كتابة رسائل الحب والاعتذار والشكر | Love, Apology, and Thank You Letters Writing | `love-apology-thankyou-letters-writing` | active | FileText | 50 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 54 | كتابة رسائل التهنئة والتعزية | Congratulations and Condolence Letters Writing | `congratulations-condolence-letters-writing` | active | FileText | 60 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 55 | كتابة رسائل الدعوة | Invitations Writing | `invitations-writing` | active | FileText | 70 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 56 | كتابة القصص القصيرة | Short Stories Writing | `short-stories-writing` | active | FileText | 80 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 57 | كتابة الخواطر والمقالات الشخصية | Personal Essays and Thoughts Writing | `personal-essays-thoughts-writing` | active | PenLine | 90 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 58 | كتابة المذكرات واليوميات | Memoirs and Diaries Writing | `memoirs-diaries-writing` | active | FileText | 100 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 59 | كتابة محتوى المدونات الشخصية | Personal Blog Content Writing | `personal-blog-content-writing` | active | PenLine | 110 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 60 | كتابة محتوى وسائل التواصل الاجتماعي | Social Media Content Writing | `personal-social-media-content-writing` | active | Megaphone | 120 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 61 | كتابة نصوص البطاقات والهدايا | Card and Gift Texts Writing | `card-gift-texts-writing` | active | FileText | 130 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 62 | كتابة كلمات المناسبات والفعاليات | Event Speeches Writing | `event-speeches-writing` | active | FileText | 140 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 63 | كتابة الرسائل النصية القصيرة (SMS) | SMS and Short Messages Writing | `sms-short-messages-writing` | active | FileText | 150 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 64 | كتابة مدوّنات السفر / الرحلات | Travel Blog Writing | `travel-blog-writing` | active | PenLine | 160 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 65 | كتابة محتوى البودكاست الشخصي | Podcast Script / Episode Notes Writing | `podcast-script-notes-writing` | active | Mic | 170 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 66 | كتابة محتوى السير الذاتية التفاعلية | Interactive CV Content Writing | `interactive-cv-content-writing` | active | FileText | 180 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 67 | كتابة محتوى الحملات الشخصية على وسائل التواصل | Personal Brand Content Writing | `personal-brand-content-writing` | active | PenTool | 190 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 68 | كتابة يوميات أو سرد قصصي بشكل كتابي | Narrative Memoirs Writing | `narrative-memoirs-writing` | active | FileText | 200 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 69 | كتابة رسالة الفيديو أو خطاب اليوتيوب | YouTube Channel Script Writing | `youtube-channel-script-writing` | active | Video | 210 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 70 | كتابة محتوى الانتخابات أو الترشح أو الحملات الشخصية | Campaign Content Writing | `campaign-content-writing` | active | FileText | 220 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 71 | كتابة محتوى مدونة الصور/فوتوغرافي | Photo-Blog Content Writing | `photo-blog-content-writing` | active | Camera | 230 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |
| 72 | كتابة اقتباسات وخاطِر قصيرة مميّزة | Micro-Content / Quotes Writing | `micro-content-quotes-writing` | active | FileText | 240 | 2026-04-22 11:10:12 | 2026-04-22 11:10:12 | 0 | 0 |

## Inactive / Hidden Sub-Sub Categories

None — all 216 sub-subcategories are active, and all parent sub/main categories are active.

## Section 12 — Homepage Migration Readiness

- **Total active sub-sub categories (homepage-eligible)**: 216
- **Pages required at 16/page**: 14
- **Recommended ordering**: `categories.sort_order → subcategories.sort_order → sub_subcategories.sort_order → id` (matches `subSubcategoriesService.listActivePaginated`)
- **Icon mapping**: lucide-react via keyword rules in `frontend/src/utils/subSubcategoryIcons.js`; fallback by main category slug; default `Layers`
- **Categories using default icon only (no rule/fallback match)**: 0
- **Duplicate Arabic names**: 2 name(s) appearing more than once

### Duplicate Names

- **برمجة قواعد البيانات** (2×) — IDs: 168, 175
- **كتابة محتوى وسائل التواصل الاجتماعي** (2×) — IDs: 9, 60

### Pagination Breakdown (actual data, 16/page)

**Page 1**
1. [145] تطوير الواجهة الأمامية (Frontend) — `frontend-dev` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Database
2. [146] تطوير الواجهة الخلفية (Backend) — `backend-dev` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Database
3. [147] تطوير ويب متكامل (Full Stack) — `full-stack-web` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Code2
4. [148] أنظمة إدارة المحتوى (CMS) — `cms` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Smartphone
5. [149] تطبيقات الجوال المخصصة (iOS/Android) — `custom-mobile-apps` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Smartphone
6. [150] تطبيقات عبر الأنظمة (Cross Platform) — `cross-platform-apps` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Smartphone
7. [151] تطوير الألعاب (2D/3D) — `game-dev` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Code2
8. [152] برمجيات مخصصة (Custom Software) — `custom-software` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Code2
9. [153] برمجيات مؤسسية (Enterprise Software – ERP/CRM) — `enterprise-software` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Code2
10. [154] تطوير واجهات برمجة التطبيقات (APIs) — `api-dev` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Smartphone
11. [155] دمج الأنظمة (Integration Services) — `integration-services` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Code2
12. [156] تطبيقات سحابية (Cloud Native) — `cloud-native` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Smartphone
13. [157] Serverless/BaaS — `serverless-baas` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Code2
14. [158] خدمات DevOps — `devops` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Bot
15. [159] الذكاء الاصطناعي — `ai` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Bot
16. [160] تعلم الآلة — `ml` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Code2

**Page 2**
1. [161] معالجة اللغة الطبيعية (NLP) — `nlp` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Code2
2. [162] الرؤية الحاسوبية (Computer Vision) — `computer-vision` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Code2
3. [163] الأمن السيبراني — `cybersecurity` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Code2
4. [164] اختبارات الاختراق — `penetration-testing` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Code2
5. [165] التشفير — `encryption` — خدمات البرمجة → خدمات برمجة الأعمال — icon: ShoppingCart
6. [166] تطوير متاجر إلكترونية — `ecommerce-dev` — خدمات البرمجة → خدمات برمجة الأعمال — icon: ShoppingCart
7. [167] أنظمة الدفع الإلكتروني — `payment-integration` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Database
8. [168] برمجة قواعد البيانات — `db-programming` — خدمات البرمجة → خدمات برمجة الأعمال — icon: Code2
9. [169] حل واجبات البرمجة — `programming-assignment-help` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
10. [170] تنفيذ المشاريع الأكاديمية — `academic-project-development` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
11. [171] تصحيح الأخطاء البرمجية — `bug-fixing` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
12. [172] تحسين الكود — `code-optimization` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
13. [173] تصميم الخوارزميات — `algorithm-design` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
14. [174] هياكل البيانات — `data-structures` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
15. [175] برمجة قواعد البيانات — `academic-db-programming` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Database
16. [176] تطوير الواجهة الأمامية — `frontend-development` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2

**Page 3**
1. [177] تطوير الواجهة الخلفية — `backend-development` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Database
2. [178] تطوير تطبيقات سطح المكتب — `desktop-application-development` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Smartphone
3. [179] برمجة واجهات رسومية (GUI) — `gui-programming` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
4. [180] كتابة الوثائق التقنية — `technical-documentation` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
5. [181] دعم كتابة الأبحاث التقنية — `research-paper-programming-support` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
6. [182] إعداد دراسات حالة — `case-study-development` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
7. [183] جلسات تعليمية برمجية — `code-review-sessions` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
8. [184] مراجعة الكود — `code-tutoring` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
9. [185] دعم متكامل حسب الجامعة — `university-specific-support` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
10. [186] التحديثات والصيانة الأكاديمية — `academic-code-maintenance` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
11. [187] مساعدة في مشاريع بحث الذكاء الاصطناعي — `ai-research-project-development` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Bot
12. [188] تطوير محاكاة تعليمية — `educational-simulation-development` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
13. [189] كتابة خوارزميات متقدمة ونماذج بحثية — `advanced-algorithm-model-writing` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
14. [190] تطوير واجهات رسومية تعليمية — `gui-research-tools-development` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
15. [191] برمجة أدوات التحليل الإحصائي — `statistical-analysis-tools` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2
16. [192] تطوير أطر اختبار البرمجيات الأكاديمية — `academic-testing-frameworks` — خدمات البرمجة → خدمات البرمجة الأكاديمية — icon: Code2

**Page 4**
1. [193] سكريبتات أتمتة المتصفح — `browser-automation-scripts` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
2. [194] سكريبتات حجز البيانات — `data-collection-scripts` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
3. [195] بوتات محادثة — `chat-bots` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Bot
4. [196] تكامل واجهات API — `custom-api-integration` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
5. [197] سكريبتات سحب وتحليل البيانات — `data-scraping-parsing-scripts` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
6. [198] أدوات تتبع الأسعار — `price-tracking-tools` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
7. [199] سكريبتات العمل المكتبي — `office-task-automation` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
8. [200] Macros للـExcel وGoogle Sheets — `excel-google-sheets-macros` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
9. [201] أدوات GUI مخصصة — `custom-gui-tools` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
10. [202] أدوات سطح المكتب — `desktop-utility-apps` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
11. [203] امتدادات المتصفح — `browser-extensions` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
12. [204] مواقع شخصية — `personal-websites` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
13. [205] أدوات مساعدة شخصية — `personal-assistant-tools` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
14. [206] مولدات سيرة ذاتية ومحافظ أعمال — `resume-portfolio-generators` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
15. [207] مشاريع تعليمية — `educational-projects` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
16. [208] ألعاب شخصية — `mini-games` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2

**Page 5**
1. [209] بوتات Discord/Telegram — `discord-telegram-bots` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Bot
2. [210] أدوات تعليم الذكاء الاصطناعي — `ai-integration-tools` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Bot
3. [211] سكريبتات مخصصة حسب الطلب — `custom-code-requests` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
4. [212] برمجة للهواة والمبتدئين — `hobby-beginner-projects` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
5. [213] برمجة تطبيقات الهواتف الشخصية — `personal-mobile-app-development` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Smartphone
6. [214] تطوير أدوات الإنتاجية الشخصية — `personal-productivity-automation` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
7. [215] بناء مواقع الويب الشخصية أو المدونات — `personal-website-dev` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Code2
8. [216] تطوير روبوتات الدردشة لخدمة شخصية — `personal-chatbot-dev` — خدمات البرمجة → خدمات البرمجة الشخصية — icon: Bot
9. [73] هوية العلامة التجارية — `brand-identity` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: PenTool
10. [74] تصميم الشعار — `logo-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: PenTool
11. [75] تطوير دليل هوية متكامل — `comprehensive-brand-style-guide` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: PenTool
12. [76] تطوير استراتيجية العلامة التجارية البصرية — `visual-brand-strategy` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: PenTool
13. [77] تصميم مواقع الويب — `website-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Code2
14. [78] تصميم صفحات الهبوط — `landing-page-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Palette
15. [79] تصميم واجهات التطبيقات — `app-ui-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Smartphone
16. [80] تصميم الإعلانات الرقمية والمطبوعة — `digital-print-advertising-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Palette

**Page 6**
1. [81] تصميم مواد حملة التسويق — `marketing-campaign-materials-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Palette
2. [82] تصميم رسائل البريد الإلكتروني والنشرات — `email-marketing-graphics-newsletters` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Palette
3. [83] تصميم منشورات الوسائط الاجتماعية — `social-media-posts-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Palette
4. [84] تصميم صور الغلاف لمنصات التواصل — `social-media-cover-ad-images` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Camera
5. [85] تصميم التعبئة والتغليف والمنتجات — `packaging-product-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Palette
6. [86] تصميم البضائع الترويجية — `promotional-merchandise-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Palette
7. [87] تصميم بطاقات الأعمال والأوراق الرسمية — `business-cards-stationery-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Brush
8. [88] تصميم اللوحات الإرشادية واللافتات — `signage-banners-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Palette
9. [89] تصميم الإنفوجرافيك والبيانات المرئية — `infographics-data-visualization` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Palette
10. [90] تصميم الرسوم المتحركة — `motion-graphics-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Palette
11. [91] تصميم الفيديوهات الترويجية — `promotional-video-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Video
12. [92] التصميم البيئي واللوحات Wayfinding — `environmental-wayfinding-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Palette
13. [93] تصميم الرسوم التوضيحية — `illustration-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Brush
14. [94] تصميم الطباعة الاحترافية — `typography-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Palette
15. [95] تصميم المواد التقديمية التجارية — `corporate-presentation-design` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Presentation
16. [96] تصميم محتوى مرئي رقمي — `visual-content-blogs-websites` — خدمات التصميم → خدمات التصميم في مجال الأعمال — icon: Code2

**Page 7**
1. [97] تصميم البوسترات الأكاديمية والمؤتمرات — `academic-conference-poster-design` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
2. [98] إعداد ملفات جاهزة للطباعة أو العرض الإلكتروني — `print-ready-electronic-prep` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Presentation
3. [99] تصميم الرسوم والإنفوجرافيك التوضيحية — `illustrations-infographics-posters` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Brush
4. [100] مراجعة البوسترات وفق معايير المؤتمرات — `poster-review-standards` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
5. [101] تصميم العروض التقديمية الأكاديمية — `academic-presentation-design` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Presentation
6. [102] تصميم الجداول والمخططات والإنفوجرافيك — `tables-charts-infographics-design` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
7. [103] دمج وسائط متعددة في العروض — `multimedia-integration-presentations` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Presentation
8. [104] تصميم الملخصات والإنفوجرافيك التعليمية — `educational-summaries-infographics` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
9. [105] توفير قوالب إنفوجرافيك قابلة للتعديل — `editable-infographic-templates` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
10. [106] إعداد وتنسيق الرسائل والأطروحات — `thesis-dissertation-formatting` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
11. [107] تصميم القوالب الأكاديمية — `academic-template-design` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
12. [108] تصميم الرسوم التوضيحية والخرائط العقلية — `mind-maps-illustrations-design` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Brush
13. [109] دعم التواصل العلمي — `scientific-communication-support` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
14. [110] تصميم الملخصات الرسومية للمقالات العلمية — `graphical-abstracts-design` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
15. [111] خدمات التنفيذ السريع والتعاوني — `fast-collaborative-design-services` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
16. [112] تصميم المجلات والكتب الأكاديمية — `academic-journal-layout` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette

**Page 8**
1. [113] تصميم منصة التعلم الإلكتروني وقالبها — `elearning-platform-interface` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
2. [114] تصميم نماذج التصوير العلمي والبياني — `scientific-visualization-design` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Camera
3. [115] تصميم الواقع المعزّز للتعليم — `ar-educational-experience` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
4. [116] تصميم منشورات تفاعلية للبحث — `interactive-research-publication` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
5. [117] تصميم اللوحات المعروضة في المعارض الأكاديمية — `exhibit-poster-booth-design` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
6. [118] تصميم الخرائط الفكرية الديناميكية — `dynamic-mind-map-design` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
7. [119] تصميم الواقع الافتراضي لمحاكاة مختبرية — `vr-lab-simulation-design` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
8. [120] تصميم محتوى الواقع المعزّز للمحاضرات — `ar-lecture-content-design` — خدمات التصميم → خدمات التصميم في المجال الأكاديمي — icon: Palette
9. [121] بناء العلامة الشخصية — `personal-branding-design` — خدمات التصميم → خدمات التصميم الشخصية — icon: PenTool
10. [122] تصميم شعار شخصي — `personal-logo-design` — خدمات التصميم → خدمات التصميم الشخصية — icon: PenTool
11. [123] دليل العلامة الشخصية — `personal-brand-style-guide` — خدمات التصميم → خدمات التصميم الشخصية — icon: PenTool
12. [124] قوالب اجتماعية شخصية — `personal-social-media-templates` — خدمات التصميم → خدمات التصميم الشخصية — icon: Palette
13. [125] تصميم الموقع الشخصي أو المدونة — `personal-website-portfolio-design` — خدمات التصميم → خدمات التصميم الشخصية — icon: Code2
14. [126] تصميم الدعوات وبطاقات التهاني — `invitation-greeting-card-design` — خدمات التصميم → خدمات التصميم الشخصية — icon: Palette
15. [127] تحسين وتنسيق الصور الشخصية — `photo-editing-retouching` — خدمات التصميم → خدمات التصميم الشخصية — icon: Camera
16. [128] تصميم Mockups — `mockups-design` — خدمات التصميم → خدمات التصميم الشخصية — icon: Palette

**Page 9**
1. [129] رسومات توضيحية وفنية شخصية — `personal-illustrations-artwork` — خدمات التصميم → خدمات التصميم الشخصية — icon: Brush
2. [130] تصميم المجلات والمطبوعات الشخصية — `personal-magazines-print-materials` — خدمات التصميم → خدمات التصميم الشخصية — icon: Palette
3. [131] تصميم عروض تقديم شخصية — `personal-presentation-design` — خدمات التصميم → خدمات التصميم الشخصية — icon: Presentation
4. [132] تصميم القوالب الرقمية — `digital-template-design` — خدمات التصميم → خدمات التصميم الشخصية — icon: Palette
5. [133] جلسات تدريب وتصميم شخصي — `personal-design-coaching` — خدمات التصميم → خدمات التصميم الشخصية — icon: Palette
6. [134] خدمات تنفيذ سريع حسب الطلب — `on-demand-rapid-design` — خدمات التصميم → خدمات التصميم الشخصية — icon: Palette
7. [135] تصميم الهوية الشخصية ثلاثية الأبعاد — `3d-personal-brand-identity` — خدمات التصميم → خدمات التصميم الشخصية — icon: PenTool
8. [136] تصميم صالحات الواقع المعزّز للمنشورات الشخصية — `ar-personal-social-posts` — خدمات التصميم → خدمات التصميم الشخصية — icon: Palette
9. [137] تصميم الخريطة الزمنية الشخصية — `personal-timeline-graphic` — خدمات التصميم → خدمات التصميم الشخصية — icon: Palette
10. [138] تصميم فيديو شخصي احترافي — `personal-promo-video` — خدمات التصميم → خدمات التصميم الشخصية — icon: Video
11. [139] تصميم مجلة شخصية رقمية — `digital-personal-magazine` — خدمات التصميم → خدمات التصميم الشخصية — icon: Palette
12. [140] تصميم تطبيق محفظة هوية شخصي — `personal-digital-identity-wallet` — خدمات التصميم → خدمات التصميم الشخصية — icon: Smartphone
13. [141] تصميم قسم المدونة أو البورتفوليو الشخصي بتجربة UI/UX — `personal-website-uiux` — خدمات التصميم → خدمات التصميم الشخصية — icon: Code2
14. [142] تصميم الواقع الافتراضي أو محاكاة للسيرة الذاتية — `vr-resume-portfolio` — خدمات التصميم → خدمات التصميم الشخصية — icon: Palette
15. [143] تصميم شريط الحياة أو الرسائل الاحتفالية المتحركة — `animated-life-event-graphics` — خدمات التصميم → خدمات التصميم الشخصية — icon: Palette
16. [144] تصميم سيرة ذاتية بشكل إنفوجرافيك — `infographic-cv-design` — خدمات التصميم → خدمات التصميم الشخصية — icon: Palette

**Page 10**
1. [1] كتابة بروفايل الشركات — `company-profile-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: FileText
2. [2] كتابة الوصف الوظيفي — `job-description-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: FileText
3. [3] كتابة السياسات والإجراءات — `policies-procedures-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: FileText
4. [4] كتابة أدلة الموظفين — `employee-handbooks-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: FileText
5. [5] كتابة المراسلات الرسمية — `official-correspondence-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: Brush
6. [6] كتابة الإعلانات — `ad-copywriting` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: Megaphone
7. [7] كتابة محتوى المواقع الإلكترونية — `website-content-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: Code2
8. [8] كتابة المدونات والمقالات — `blogs-articles-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: PenLine
9. [9] كتابة محتوى وسائل التواصل الاجتماعي — `social-media-content-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: Megaphone
10. [10] كتابة النشرات الإخبارية — `newsletters-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: FileText
11. [11] كتابة تقارير الأعمال — `business-reports-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: FileText
12. [12] كتابة خطط العمل — `business-plans-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: FileText
13. [13] كتابة دراسات الجدوى — `feasibility-studies-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: FileText
14. [14] كتابة التحليلات السوقية — `market-analysis-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: BarChart3
15. [15] كتابة العروض التقديمية — `presentations-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: Presentation
16. [16] كتابة مقترحات المشاريع — `project-proposals-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: FileText

**Page 11**
1. [17] كتابة طلبات العروض (RFPs) — `rfps-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: FileText
2. [18] كتابة أدلة الاستخدام — `user-manuals-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: FileText
3. [19] كتابة المواد التدريبية — `training-materials-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: FileText
4. [20] كتابة الأسئلة الشائعة — `faqs-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: FileText
5. [21] كتابة البيانات الصحفية — `press-releases-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: FileText
6. [22] كتابة المقالات الصحفية — `press-articles-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: PenLine
7. [23] كتابة الخطابات الرسمية — `official-speeches-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: Brush
8. [24] كتابة السير الذاتية للشركات — `corporate-bios-writing` — خدمات كتابة المحتوى → خدمات كتابة الأعمال — icon: Smartphone
9. [25] كتابة الأبحاث العلمية — `research-papers-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
10. [26] كتابة المقالات الأكاديمية — `academic-articles-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: PenLine
11. [27] كتابة الأبحاث الجامعية — `university-essays-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
12. [28] المساعدة في رسائل الماجستير والدكتوراه — `thesis-dissertation-assistance` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
13. [29] كتابة تقارير المختبر — `lab-reports-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
14. [30] كتابة تقارير الأعمال الأكاديمية — `business-technical-reports-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
15. [31] كتابة مراجعات الأدبيات — `literature-reviews-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
16. [32] كتابة المراجعات النقدية — `book-film-reviews-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText

**Page 12**
1. [33] التحرير الأكاديمي — `academic-editing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
2. [34] التدقيق اللغوي — `proofreading` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
3. [35] إعداد وإدارة قائمة المصادر — `citation-management` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
4. [36] دعم النشر — `publication-support` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
5. [37] توضيح الأشكال والرسومات — `figure-preparation` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
6. [38] كتابة مقترحات البحث — `research-proposals-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
7. [39] كتابة الملخصات العلمية — `abstracts-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
8. [40] كتابة المقالات الشخصية الأكاديمية — `personal-reflection-essays-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: PenLine
9. [41] الكتابة التقنية — `technical-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
10. [42] الكتابة الطبية — `medical-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
11. [43] خدمات الكتابة بالنيابة (Ghostwriting) — `ghostwriting` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
12. [44] كتابة مقالات متميزة للنشر في مجلات محكّمة — `peer-reviewed-article-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: PenLine
13. [45] كتابة «أوراق المؤتمرات» — `conference-paper-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
14. [46] كتابة المحتوى التعليمي المفتوح — `open-educational-resources-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
15. [47] كتابة أوراق تدوين الحالات الدراسية — `case-study-papers-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText
16. [48] كتابة محتوى المساقات الإلكترونية — `elearning-course-content-writing` — خدمات كتابة المحتوى → خدمات الكتابة الأكاديمية — icon: FileText

**Page 13**
1. [49] كتابة السيرة الذاتية — `cv-resume-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: FileText
2. [50] كتابة رسائل التغطية — `cover-letters-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: FileText
3. [51] كتابة رسائل التوصية — `recommendation-letters-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: FileText
4. [52] كتابة خطابات القبول والاعتذار — `acceptance-apology-letters-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: FileText
5. [53] كتابة رسائل الحب والاعتذار والشكر — `love-apology-thankyou-letters-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: FileText
6. [54] كتابة رسائل التهنئة والتعزية — `congratulations-condolence-letters-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: FileText
7. [55] كتابة رسائل الدعوة — `invitations-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: FileText
8. [56] كتابة القصص القصيرة — `short-stories-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: FileText
9. [57] كتابة الخواطر والمقالات الشخصية — `personal-essays-thoughts-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: PenLine
10. [58] كتابة المذكرات واليوميات — `memoirs-diaries-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: FileText
11. [59] كتابة محتوى المدونات الشخصية — `personal-blog-content-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: PenLine
12. [60] كتابة محتوى وسائل التواصل الاجتماعي — `personal-social-media-content-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: Megaphone
13. [61] كتابة نصوص البطاقات والهدايا — `card-gift-texts-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: FileText
14. [62] كتابة كلمات المناسبات والفعاليات — `event-speeches-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: FileText
15. [63] كتابة الرسائل النصية القصيرة (SMS) — `sms-short-messages-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: FileText
16. [64] كتابة مدوّنات السفر / الرحلات — `travel-blog-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: PenLine

**Page 14**
1. [65] كتابة محتوى البودكاست الشخصي — `podcast-script-notes-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: Mic
2. [66] كتابة محتوى السير الذاتية التفاعلية — `interactive-cv-content-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: FileText
3. [67] كتابة محتوى الحملات الشخصية على وسائل التواصل — `personal-brand-content-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: PenTool
4. [68] كتابة يوميات أو سرد قصصي بشكل كتابي — `narrative-memoirs-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: FileText
5. [69] كتابة رسالة الفيديو أو خطاب اليوتيوب — `youtube-channel-script-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: Video
6. [70] كتابة محتوى الانتخابات أو الترشح أو الحملات الشخصية — `campaign-content-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: FileText
7. [71] كتابة محتوى مدونة الصور/فوتوغرافي — `photo-blog-content-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: Camera
8. [72] كتابة اقتباسات وخاطِر قصيرة مميّزة — `micro-content-quotes-writing` — خدمات كتابة المحتوى → خدمات الكتابة الشخصية — icon: FileText
