import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { INITIAL_DATA } from './src/data/initialData.ts';
import { ScheduleData } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const HOST = process.env.HOST || (isProduction ? '0.0.0.0' : '127.0.0.1');
const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.resolve(DATA_DIR, 'schedule.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadScheduleData(): ScheduleData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.lessons)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read schedule file', err);
  }
  saveScheduleData(INITIAL_DATA);
  return INITIAL_DATA;
}

function saveScheduleData(data: ScheduleData): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write schedule file', err);
  }
}

app.use(express.json());

if (!isProduction) {
// API: Get Schedule
app.get('/api/schedule', (_req, res) => {
  const data = loadScheduleData();
  res.json({
    version: data.version,
    updatedAt: data.updatedAt,
    lessons: data.lessons
  });
});

// API: Verify Admin PIN
app.post('/api/verify-pin', (req, res) => {
  const { pin } = req.body;
  const data = loadScheduleData();
  if (pin && pin.trim() === data.adminPin) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Неверный PIN' });
  }
});

// API: Change Admin PIN
app.post('/api/change-pin', (req, res) => {
  const { currentPin, newPin } = req.body;
  const currentData = loadScheduleData();
  const normalizedNewPin = typeof newPin === 'string' ? newPin.trim() : '';

  if (!currentPin || currentPin.trim() !== currentData.adminPin) {
    res.status(401).json({ success: false, message: 'Неверный PIN' });
    return;
  }

  if (!normalizedNewPin) {
    res.status(400).json({ success: false, message: 'Новый PIN не может быть пустым' });
    return;
  }

  const newData: ScheduleData = {
    ...currentData,
    adminPin: normalizedNewPin,
    version: (currentData.version || 1) + 1,
    updatedAt: new Date().toISOString()
  };

  saveScheduleData(newData);
  res.json({ success: true });
});

// API: Save Lessons (Admin only)
app.post('/api/schedule', (req, res) => {
  const { pin, lessons } = req.body;
  const currentData = loadScheduleData();

  if (!pin || pin.trim() !== currentData.adminPin) {
    res.status(401).json({ success: false, message: 'Неверный PIN' });
    return;
  }

  const newData: ScheduleData = {
    ...currentData,
    lessons: Array.isArray(lessons) ? lessons : currentData.lessons,
    version: (currentData.version || 1) + 1,
    updatedAt: new Date().toISOString()
  };

  saveScheduleData(newData);

  res.json({
    success: true,
    data: {
      version: newData.version,
      updatedAt: newData.updatedAt,
      lessons: newData.lessons
    }
  });
});
}

async function startServer() {
  if (isProduction) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
  });
}

startServer();
