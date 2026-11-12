# The Trainers — تدرّب

تطبيق ويب تقدّمي (PWA) مستقل ومصمم للهاتف Android وiPhone لإدارة المؤسسات والمدربين. هذا المشروع منفصل كلياً عن Sport Performance.

## التقنية
- React + TypeScript + Vite
- Supabase Auth / PostgreSQL / Row Level Security / Realtime / Storage
- Supabase Edge Function للدعوات الآمنة (من دون وضع `service_role` في المتصفح)
- Cloudflare Pages
- العربية والفرنسية والإنجليزية، مع RTL للعربية

## الأدوار
1. **مالك المنصة**: البريد `ayoubmalleh772@gmail.com`، حساب مركزي لا ينتمي إلى مؤسسة. ينشئ المؤسسات ويعيّن مديريها.
2. **مدير المؤسسة (manager)**: يدير فريق المؤسسة ويعيّن الإداريين والمدربين.
3. **الإدارة (admin)**: تدير التلاميذ والملفات الطبية والتعاميم والتقارير وسجل النشاط.
4. **المدرب (coach)**: يسجل الحصص والحضور والتقارير ويستعمل كراسه الخاص. لا يقرأ تقارير أو كراسات المدربين الآخرين.

## الإعداد الأول — Supabase
أنشئ مشروع Supabase جديداً مخصصاً لـ The Trainers. لا تستخدم مشروع Sport Performance.

1. افتح **SQL Editor** وشغّل الملف `supabase/THE_TRAINERS_SETUP.sql` مرة واحدة على قاعدة فارغة.
2. من **Authentication → Users** أرسل دعوة إلى `ayoubmalleh772@gmail.com`.
3. عند إنشاء حساب هذا البريد، ينشئ trigger ملف المالك تلقائياً بدور `owner`.
4. سجّل الدخول إلى التطبيق بعد نشر الواجهة. من لوحة المالك أنشئ المؤسسة ثم أرسل دعوة إلى مدير المؤسسة.
5. يجب نشر Edge Function قبل استخدام دعوات المديرين والمدربين والإداريين؛ التعليمات أدناه.

> لا تُنشئ صف المالك يدوياً إذا أنشأه trigger. لا تشارك مفتاح `service_role` ولا تضعه في `.env` أو GitHub أو Cloudflare Pages.

## نشر Edge Function للدعوات
يلزم Node.js وSupabase CLI. من مجلد المشروع:

```bash
npx supabase login
npx supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
npx supabase functions deploy invite-user
```

تأكّد من ضبط `SUPABASE_URL` و`SUPABASE_ANON_KEY` تلقائياً في بيئة Edge Functions (وهما متاحان افتراضياً في Supabase). مفتاح `service_role` يُحفظ كـ Secret داخل Supabase فقط.

## تشغيل الواجهة محلياً
المتطلبات: Node.js 20 أو أحدث.

```bash
npm install
cp .env.example .env
```

ضع القيمتين من Supabase → Project Settings → API:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
```

ثم:

```bash
npm run verify
npm run build
npm run dev
```

## GitHub وCloudflare Pages
- أنشئ مستودع GitHub جديداً لهذا المشروع فقط وارفع محتويات مجلد المشروع.
- في Cloudflare Pages اختر **Connect to Git**.
- Build command: `npm run build`
- Build output directory: `dist`
- أضف `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` في Environment Variables لبيئتي Production وPreview.
- لا تضف `SUPABASE_SERVICE_ROLE_KEY` إلى Cloudflare Pages.
- بعد النشر افتح رابط HTTPS على الهاتف.

## تثبيت الهاتف
- Android: افتح الرابط في Chrome ثم Install app / Add to Home screen.
- iPhone: افتح الرابط في Safari ثم Share → Add to Home Screen.

## الوحدات الموجودة في المشروع
- تسجيل الدخول وتوجيه المستخدم بحسب الدور وحالة الحساب.
- لوحة مالك المنصة وإنشاء المؤسسات وتعيين المديرين.
- دعوات الفريق الآمنة عبر Edge Function؛ يمكن للمدرب دعوة مدرب آخر فقط إلى مؤسسته، وتبقى الدعوة بانتظار موافقة الإدارة.
- قائمة التلاميذ والبحث والإضافة والتعديل والأرشفة من حسابات الإدارة، مع استيراد جماعي من Excel عبر النسخ واللصق (TSV/CSV) ومعاينة وتجاهل الأرقام المكررة.
- تسجيل الحضور والغياب والتأخير والرخص والإعفاءات، مع تحميل السجلات السابقة حسب التاريخ قبل التعديل.
- بداية الحصة ونهايتها، وتقرير يومي تُملأ أعداده تلقائياً من حضور اليوم، ثم يمكن للإدارة اعتماده بعد المراجعة.
- كراس خاص بكل مدرب مع عزل على مستوى RLS.
- التعاميم الإدارية.
- محادثات خاصة بين مدربين ومجموعات حسب المشاركين، مع تحديث فوري للرسائل وإرسال الملفات والصور والتسجيلات الصوتية داخل المحادثة فقط. يستطيع المدرب دعوة زميله من شاشة المحادثات، ثم يفعّل المدير حسابه.
- إدارة السجلات الطبية للإدارة فقط.
- سجل تدقيق للتغييرات.
- العربية والفرنسية والإنجليزية وPWA قابلة للتثبيت.

## التحقق وحدود ما يجب اختباره
`npm run verify` يفحص وجود الملفات وبعض ضوابط البنية والأمان بشكل ثابت، بما فيها الاستيراد الجماعي والمحادثات المقيدة بالأعضاء ومراجعة التقارير. لا يُعد اختبار تكامل مع قاعدة بيانات فعلية. يجب قبل الاستخدام الحقيقي اختبار الحسابات المنفصلة (مالك/مدير/إداري/مدرب)، وعزل مؤسستين، ومنع المدرب من قراءة تقارير زملائه، وسيناريوهات الدعوات والحضور والتقارير والوسائط على Android وiPhone. لا توجد في هذه النسخة خدمة Push Notifications فعلية، ولا Speech-to-Text مدمج؛ تسجيل الصوت كمرفق وإملاء صوتي عبر Web Speech API متاحان في المتصفحات التي تدعمهما؛ التوفر واللغة يختلفان حسب المتصفح والجهاز. إشعارات Push الفعلية غير مفعّلة حالياً، وإشعارات iOS على الويب لها قيود دعم تختلف حسب إصدار النظام وطريقة تثبيت PWA.


## ملفات إضافية
- `docs/STATUS.md`: ما أُنجز وما بقي وما لم يُجرَّب.
- `docs/DATABASE.md`, `docs/STORAGE.md`: توثيق قاعدة البيانات والتخزين.
- `docs/ACCEPTANCE_TESTS.md`, `docs/SECURITY_NOTES.md`: الاختبارات اليدوية والأمان.
- `docs/COACH_GUIDE.md`, `docs/ADMIN_GUIDE.md`: أدلة الاستعمال.

> اسم متغير المفتاح العام في Vite: `VITE_SUPABASE_ANON_KEY` (يقبل التطبيق أيضاً `VITE_SUPABASE_PUBLISHABLE_KEY`).
