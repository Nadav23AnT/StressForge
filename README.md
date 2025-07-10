# StressForge

**StressForge** הוא שירות SaaS אינטראקטיבי לבדיקות עומס המבוסס על הכלי [k6](https://k6.io/). המערכת נבנתה כך שתוכל לגדול בקלות ולהציע חוויית משתמש נוחה לניהול ולהרצת בדיקות עומס על גבי שירותי ענן.

## ארכיטקטורה כללית

המערכת מחולקת לשלוש שכבות עיקריות:

1. **Frontend** – פורטל משתמשים המבוסס על React או Next.js יחד עם Tailwind CSS.
   - טופס להזנת כתובת ה־URL ופרמטרי הבדיקה (משך, מספר משתמשים ו־stages).
   - מסך ניהול ריצות המציג היסטוריית בדיקות וסטטוס נוכחי.
   - דשבורד תוצאות עם גרפים בזמן אמת (p50, p95, throughput, שגיאות) תוך שימוש ב־WebSockets או SSE לקבלת עדכונים חיים.

2. **Backend** – שירות API ב־Node.js (Express/Fastify) או בפייתון (FastAPI).
   - `POST /api/tests` ליצירת משימת בדיקה חדשה והכנסתה לתור.
   - `GET /api/tests/:id/status` להצגת סטטוס ריצה (queued, running, done).
   - `GET /api/tests/:id/results` להורדת תוצאות הבדיקה בפורמט JSON או CSV.
   - ניהול תורים באמצעות BullMQ (על גבי Redis) או RabbitMQ להפעלת ריצות k6 על בסיס Docker image.

3. **Data & Metrics** – אחסון וניתוח תוצאות.
   - מטא־דאטה של ריצות נשמר ב־Postgres.
   - קבצי תוצאות גולמיות (JSON) נשמרים ב־S3/GCS או דומה.
   - עיבוד התוצאות וכתיבת מדדים למסד Timeseries (כמו InfluxDB או Prometheus) להצגה ב־Grafana.

## יכולות מרכזיות

- **תמיכה ב־Multi Tenant** – כל לקוח עובד בסביבה מבודדת ומורשה לפי מנגנון אימות (Auth0/Firebase/Keycloak).
- **חישוב עלויות** – מבוסס על מספר המשתמשים המדומים (VUs) ומספר הדקות שבהן הבדיקה רצה.
- **פריסה נוחה** – כל רכיבי המערכת עטופים ב־Docker וניתנים להפעלה על Kubernetes עם אפשרות לאוטו־סקייל.

## זרימת עבודה טיפוסית

1. המשתמש מזין את כתובת היעד ופרטי התרחיש בדף הראשי ולוחץ "Run Test".
2. ה־Backend יוצר משימה חדשה בתור, מפעיל מכולת k6 ומזרים תוצאות חיות ל־Frontend.
3. בסיום הריצה ניתן לצפות בדוח מפורט, להוריד קובץ ולהמשיך לנתח ב־Grafana.

## קטע קוד לדוגמה (Node.js + BullMQ)

```javascript
import express from 'express';
import { Queue, Worker } from 'bullmq';
import { v4 as uuid } from 'uuid';
import { execSync } from 'child_process';

const app = express();
app.use(express.json());

const queue = new Queue('load-tests', { connection: { host: 'localhost' } });

app.post('/api/tests', async (req, res) => {
  const id = uuid();
  const { url, stages } = req.body;
  await queue.add(id, { id, url, stages });
  res.status(202).json({ jobId: id });
});

new Worker('load-tests', async job => {
  const { id, url, stages } = job.data;
  // הכנת סקריפט k6 דינמי והרצתו בתוך Docker
  execSync(`docker run --rm -v $(pwd)/scripts:/scripts loadimpact/k6 run /scripts/${id}.js --out json=/results/${id}.json`);
});

app.listen(3000);
```

## איך מתחילים לעבוד?

1. ודאו שמותקנים Docker ו־Node.js במכונה.
2. התאימו קבצי קונפיגורציה (חיבור ל־Redis, S3 וכדומה).
3. הפעילו את ה־Backend ולאחר מכן את ה־Frontend מתוך התיקיות המתאימות.

כרגע הפרויקט מכיל את מסמך התכנון בלבד וללא קוד הרצה מלא.
