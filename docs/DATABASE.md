# قاعدة البيانات
ملف واحد: `supabase/THE_TRAINERS_SETUP.sql` (يُشغَّل مرة واحدة على مشروع Supabase جديد فارغ).

| الجدول | الغرض |
|---|---|
| institutions | المؤسسات (الشعار، الاتصال، إعداد احتساب الرخص كغياب) |
| profiles | الحسابات والأدوار وحالة الحساب |
| classes | المجموعات / الأقسام |
| students | التلاميذ (رقم فريد داخل المؤسسة) |
| student_medical_records | السجلات الطبية (الإدارة فقط) |
| coach_shifts | الحصص (حصة مفتوحة واحدة لكل مدرب) |
| daily_reports | التقارير اليومية (تُقفل عند الإرسال) |
| attendance_records | الحضور (سجل واحد لكل تلميذ ولكل يوم) |
| student_notes | ملاحظات التلاميذ المشتركة |
| coach_notebooks | الدفتر الخاص بالمدرب |
| admin_notices | التعاميم |
| conversations / conversation_members / messages | المحادثات |
| message_reads | حالة قراءة الرسائل |
| absence_followups | علامات المتابعة بعد 5 غيابات متتالية |
| notifications | الإشعارات داخل التطبيق |
| audit_logs | سجل العمليات (دون محتوى الدفتر الخاص) |

كل الجداول مفعّل عليها RLS. دوال Security Definer مضبوط عليها `search_path`.
