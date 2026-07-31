const express = require('express');
const session = require('express-session');
const si = require('systeminformation');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = 3000;

// ─── LOCAL IP TESPİT ─────────────────────────────────────────────
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}
const LOCAL_IP = getLocalIP();

// ─── UPLOAD DİZİNLERİ ────────────────────────────────────────────
const UPLOAD_BASE = path.join(__dirname, 'uploads');
['vault', 'shared', 'transfers', 'homework'].forEach(d => {
  const p = path.join(UPLOAD_BASE, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ─── MULTER: Her route için ayrı instance ─────────────────────────
function makeUpload(destFn) {
  return multer({
    storage: multer.diskStorage({
      destination: destFn,
      filename: (req, file, cb) => {
        let safe = file.originalname;
        try { safe = Buffer.from(file.originalname, 'latin1').toString('utf8'); } catch {}
        safe = safe.replace(/[/\\?%*:|"<>]/g, '_');
        cb(null, Date.now() + '_' + safe);
      }
    }),
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
  });
}

// ÖNEMLİ: Kasa hedef klasörü HER ZAMAN oturumdaki kullanıcı adından
// türetilir. Başka bir kullanıcının adını/parametresini buraya
// karıştırmanın hiçbir yolu yoktur — bu yüzden müdür/öğretmen/öğrenci
// kasaları birbirinden tamamen ayrıdır.
const vaultUpload = makeUpload((req, file, cb) => {
  const dir = path.join(UPLOAD_BASE, 'vault', req.session.user.username);
  fs.mkdirSync(dir, { recursive: true });
  cb(null, dir);
});
const sharedUpload   = makeUpload((req, file, cb) => { cb(null, path.join(UPLOAD_BASE, 'shared')); });
const transferUpload = makeUpload((req, file, cb) => { cb(null, path.join(UPLOAD_BASE, 'transfers')); });
const homeworkUpload = makeUpload((req, file, cb) => { cb(null, path.join(UPLOAD_BASE, 'homework')); });

// ─── OKUL BİLGİSİ ─────────────────────────────────────────────────
const SCHOOL_NAME = 'Semiha İrfan Çalı Mesleki ve Teknik Anadolu Lisesi';
const SUPPORT_INFO = {
  team: 'Pardus Destek Ekibi',
  phone: '+90 312 295 86 00',
  email: 'destek@pardus.org.tr'
};

// ─── TC KİMLİK NO ÜRETİCİ (rastgele, geçerli algoritmaya uygun) ───
function generateTCNo() {
  let digits = [];
  digits[0] = Math.floor(Math.random() * 8) + 1; // ilk hane 0 olamaz
  for (let i = 1; i < 9; i++) digits[i] = Math.floor(Math.random() * 10);

  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
  digits[9] = ((oddSum * 7) - evenSum) % 10;
  if (digits[9] < 0) digits[9] += 10;

  const sumFirst10 = digits.slice(0, 10).reduce((a, b) => a + b, 0);
  digits[10] = sumFirst10 % 10;

  return digits.join('');
}

// ─── SINIF LİSTESİ ────────────────────────────────────────────────
const CLASSES = ['9-A', '9-B', '10-A', '10-B', '11-A', '11-B', '12-A', '12-B'];

// ─── KULLANICI VERİTABANI ─────────────────────────────────────────
// username alanı artık TC kimlik numarasıdır (giriş bununla yapılır).
// NOT: Bu TC'ler test/demo amaçlıdır, sabittir (her sunucu başlatmasında
// değişmez) ve gerçek bir kişiye ait değildir — kolay ezberlenmesi için
// kasıtlı olarak ardışık desenli seçilmiştir. Gerçek kullanımda bu
// listeyi kendi okul veritabanınızdan doldurmalısınız.
const users = [
  { username: '12345678950', password: '123', name: 'Ahmet Yılmaz', role: 'mudur' },
  { username: '23456789138', password: '123', name: 'Zeynep Kaya',  role: 'ogretmen' },
  { username: '34567891238', password: '123', name: 'Ali Demir',    role: 'ogrenci', classRoom: '10-A', no: '124' },
  { username: '45678912316', password: '123', name: 'Ayşe Çelik',   role: 'ogrenci', classRoom: '10-A', no: '131' },
  { username: '56789123416', password: '123', name: 'Pardus Admin', role: 'pardus' }
];

// ─── BELLEK İÇİ VERİ ─────────────────────────────────────────────
let announcements = [
  { id: 1, authorName: 'Ahmet Yılmaz', authorRole: 'mudur',    text: 'Dönem kurulu toplantısı Cuma günü saat 14:00\'te yapılacaktır.', date: new Date().toLocaleDateString('tr-TR') },
  { id: 2, authorName: 'Zeynep Kaya',  authorRole: 'ogretmen', text: 'Matematik kulübü öğrencileri öğle arasında kütüphanede toplansın.', date: new Date().toLocaleDateString('tr-TR') }
];
// Her kullanıcının en son gördüğü duyuru id'si (okunmamış sayacı için)
const lastSeenAnn = {};

let sharedFiles = [
  { id: 1, name: 'Ders_Mufredatlari', originalName: 'Ders Müfredatları', type: 'folder', size: '--', uploadedBy: 'mudur', date: new Date().toLocaleDateString('tr-TR'), parentId: 'root' }
];
let transfers = [];

// ─── ÖDEVLER (sınıf bazlı mesaj + dosya akışı) ────────────────────
// her kayıt: { id, classRoom, fromUsername, fromName, fromRole, note, filename, originalName, size, date }
let homeworkPosts = [];
// Her kullanıcının her sınıf için en son gördüğü ödev id'si (okunmamış sayacı için)
const lastSeenHomework = {}; // { username: { classRoom: lastId } }

// ─── ÖDEV ÇİZELGESİ (öğretmenin sınıf bazlı checkbox tablosu) ─────
// homeworkSheets[classRoom] = { updatedAt, columns: number, marks: { username: [bool,bool,...] } }
let homeworkSheets = {};

// ─── SSE (Server-Sent Events) bağlantıları ────────────────────────
const sseClients = {};

function pushEvent(toUsername, eventName, data) {
  const clients = sseClients[toUsername];
  if (!clients) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(res => { try { res.write(payload); } catch {} });
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'pardus_gizli_anahtar_2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 saat
}));
app.use(express.static(path.join(__dirname, 'public')));

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────
const auth = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Oturum gerekli' });
  next();
};

const authRole = (...roles) => (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Oturum gerekli' });
  if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: 'Yetki yetersiz' });
  next();
};

// ─── AUTH ─────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const tcNo = String(username || '').trim();
  const user = users.find(u => u.username === tcNo && u.password === password);
  if (user) {
    // Önceki oturumda kalan her şeyi temizleyip TAMAMEN yeni bir
    // oturum kimliğiyle başlamak için regenerate kullanıyoruz.
    // Bu, aynı tarayıcıda art arda farklı hesaplarla giriş
    // yapıldığında eski oturum verisinin asla karışmamasını sağlar.
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ success: false, message: 'Oturum hatası' });
      req.session.user = {
        username: user.username, name: user.name, role: user.role,
        classRoom: user.classRoom || null, no: user.no || null,
        school: SCHOOL_NAME
      };
      res.json({ success: true, user: req.session.user });
    });
  } else {
    res.status(401).json({ success: false, message: 'Hatalı TC kimlik no veya şifre!' });
  }
});

app.get('/api/logout', (req, res) => {
  const u = req.session.user?.username;
  if (u && sseClients[u]) sseClients[u].clear();
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/me', auth, (req, res) => res.json(req.session.user));

app.get('/api/support-info', auth, (req, res) => res.json(SUPPORT_INFO));

// ─── SSE ENDPOINT ─────────────────────────────────────────────────
app.get('/api/events', auth, (req, res) => {
  const username = req.session.user.username;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  if (!sseClients[username]) sseClients[username] = new Set();
  sseClients[username].add(res);

  const hb = setInterval(() => { try { res.write(':heartbeat\n\n'); } catch {} }, 20000);

  req.on('close', () => {
    clearInterval(hb);
    if (sseClients[username]) sseClients[username].delete(res);
  });
});

// ─── SİSTEM DURUMU ────────────────────────────────────────────────
app.get('/api/system-status', authRole('mudur', 'pardus'), async (req, res) => {
  try {
    const [cpuLoad, mem, fsSize, temp] = await Promise.all([
      si.currentLoad(), si.mem(), si.fsSize(), si.cpuTemperature()
    ]);
    const mainDisk = fsSize.find(d => d.mount === '/') || fsSize[0] || {};
    res.json({
      cpu:      Math.round(cpuLoad.currentLoad) || 0,
      cpuTemp:  temp.main > 0 ? Math.round(temp.main) : 42,
      diskUse:  Math.round(mainDisk.use) || 54,
      ramUse:   Math.round((mem.active / mem.total) * 100) || 0
    });
  } catch {
    res.json({ cpu: Math.floor(Math.random()*25)+8, cpuTemp: 43, diskUse: 54, ramUse: Math.floor(Math.random()*20)+38 });
  }
});

// ─── DUYURULAR ────────────────────────────────────────────────────
app.get('/api/announcements', auth, (req, res) => {
  res.json([...announcements].reverse());
});

// Dosya aktarımındaki "okunmamış" rozet mantığının aynısı:
// her kullanıcı için en son gördüğü duyuru id'sinden büyük id'li
// duyuru sayısı = okunmamış sayısı.
app.get('/api/announcements/unread-count', auth, (req, res) => {
  const seen = lastSeenAnn[req.session.user.username] || 0;
  const count = announcements.filter(a => a.id > seen).length;
  res.json({ count });
});

app.post('/api/announcements/mark-read', auth, (req, res) => {
  if (announcements.length) {
    lastSeenAnn[req.session.user.username] = Math.max(...announcements.map(a => a.id));
  } else {
    lastSeenAnn[req.session.user.username] = 0;
  }
  res.json({ success: true });
});

app.post('/api/announcements', authRole('mudur', 'ogretmen', 'pardus'), (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Metin boş' });
  const ann = {
    id: Date.now(),
    authorName: req.session.user.name,
    authorRole: req.session.user.role,
    text: text.trim(),
    date: new Date().toLocaleDateString('tr-TR')
  };
  announcements.push(ann);
  users.forEach(u => pushEvent(u.username, 'announcement', ann));
  res.json(ann);
});

app.delete('/api/announcements/:id', authRole('mudur', 'pardus'), (req, res) => {
  announcements = announcements.filter(a => a.id !== Number(req.params.id));
  users.forEach(u => pushEvent(u.username, 'ann_deleted', { id: Number(req.params.id) }));
  res.json({ success: true });
});

// ─── KİŞİSEL KASA ──────────────────────────────────────────────────
// Bu blokta HER rota kasa yolunu req.session.user.username'den
// kurar. Dışarıdan gelen hiçbir parametre (filename, query, body)
// bu yolu değiştiremez — sadece dosya adını belirler, klasörü asla.
// path.basename() ile "../" türü dizin atlatma girişimleri de
// engellenir. Bu sayede müdür / öğretmen / öğrenci kasaları kesin
// olarak birbirinden ayrıdır.
app.get('/api/vault', auth, (req, res) => {
  const userDir = path.join(UPLOAD_BASE, 'vault', req.session.user.username);
  if (!fs.existsSync(userDir)) return res.json([]);
  const files = fs.readdirSync(userDir)
    .filter(f => !f.startsWith('.'))
    .map(fname => {
      const stat = fs.statSync(path.join(userDir, fname));
      const original = fname.replace(/^\d+_/, '');
      return { name: fname, originalName: original, size: formatSize(stat.size), date: stat.mtime.toLocaleDateString('tr-TR') };
    })
    .sort((a, b) => (a.name < b.name ? 1 : -1));
  res.json(files);
});

app.post('/api/vault/upload', auth, vaultUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya seçilmedi' });
  res.json({
    success: true,
    name: req.file.filename,
    originalName: req.file.originalname,
    size: formatSize(req.file.size)
  });
});

app.get('/api/vault/download/:filename', auth, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOAD_BASE, 'vault', req.session.user.username, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Dosya bulunamadı' });
  const original = filename.replace(/^\d+_/, '');
  res.download(filePath, original);
});

// Ön izleme: download'dan farkı, tarayıcının dosyayı indirmek yerine
// (resim/pdf/video/ses/metin için) doğrudan içeride göstermesidir.
app.get('/api/vault/preview/:filename', auth, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOAD_BASE, 'vault', req.session.user.username, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Dosya bulunamadı' });
  res.sendFile(filePath);
});

app.delete('/api/vault/:filename', auth, (req, res) => {
  const filename = path.basename(req.params.filename);
  const fp = path.join(UPLOAD_BASE, 'vault', req.session.user.username, filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  res.json({ success: true });
});

// ─── ORTAK DOSYALAR (klasör içine girilebilir) ────────────────────
function pid(v) { return (v === undefined || v === null || v === '') ? 'root' : String(v); }

function buildBreadcrumb(folderId) {
  const chain = [{ id: 'root', name: 'Ortak Dosyalar' }];
  if (pid(folderId) === 'root') return chain;
  const reversed = [];
  let current = sharedFiles.find(f => String(f.id) === pid(folderId) && f.type === 'folder');
  while (current) {
    reversed.unshift({ id: current.id, name: current.originalName });
    if (pid(current.parentId) === 'root') break;
    current = sharedFiles.find(f => String(f.id) === pid(current.parentId) && f.type === 'folder');
  }
  return chain.concat(reversed);
}

function findSharedFile(id) { return sharedFiles.find(f => String(f.id) === String(id) && f.type === 'file'); }
function findSharedFolder(id) { return sharedFiles.find(f => String(f.id) === String(id) && f.type === 'folder'); }

app.get('/api/files', authRole('mudur', 'ogretmen', 'pardus'), (req, res) => {
  const folderId = pid(req.query.folderId);
  const items = sharedFiles
    .filter(f => pid(f.parentId) === folderId)
    .map(f => f.type === 'folder'
      ? { ...f, childCount: sharedFiles.filter(c => pid(c.parentId) === String(f.id)).length }
      : f)
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1));
  res.json({ folderId, breadcrumb: buildBreadcrumb(folderId), items });
});

app.post('/api/files/folder', authRole('mudur', 'ogretmen', 'pardus'), (req, res) => {
  const { name, parentId } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Ad boş' });
  const item = {
    id: Date.now(), name: name.trim(), originalName: name.trim(), type: 'folder',
    size: '--', uploadedBy: req.session.user.name, date: new Date().toLocaleDateString('tr-TR'),
    parentId: pid(parentId)
  };
  sharedFiles.push(item);
  res.json(item);
});

app.post('/api/files/text-file', authRole('mudur', 'ogretmen', 'pardus'), (req, res) => {
  let { name, content, parentId } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Ad boş' });
  name = name.trim();
  if (!/\.[a-zA-Z0-9]+$/.test(name)) name += '.txt';
  const safeOriginal = name.replace(/[/\\?%*:|"<>]/g, '_');
  const diskName = Date.now() + '_' + safeOriginal;
  const fp = path.join(UPLOAD_BASE, 'shared', diskName);
  fs.writeFileSync(fp, content || '', 'utf8');
  const stat = fs.statSync(fp);
  const item = {
    id: Date.now(), name: diskName, originalName: safeOriginal, type: 'file',
    size: formatSize(stat.size), uploadedBy: req.session.user.name, date: new Date().toLocaleDateString('tr-TR'),
    parentId: pid(parentId)
  };
  sharedFiles.push(item);
  res.json(item);
});

app.post('/api/files/upload', authRole('mudur', 'ogretmen', 'pardus'), sharedUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya seçilmedi' });
  const parentId = pid(req.query.folderId || req.body.folderId);
  const item = {
    id: Date.now(), name: req.file.filename, originalName: req.file.originalname, type: 'file',
    size: formatSize(req.file.size), uploadedBy: req.session.user.name, date: new Date().toLocaleDateString('tr-TR'),
    parentId
  };
  sharedFiles.push(item);
  res.json(item);
});

app.get('/api/files/download/:id', authRole('mudur', 'ogretmen', 'pardus'), (req, res) => {
  const item = findSharedFile(req.params.id);
  if (!item) return res.status(404).json({ error: 'Dosya yok' });
  const fp = path.join(UPLOAD_BASE, 'shared', item.name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Dosya yok' });
  res.download(fp, item.originalName);
});

app.get('/api/files/preview/:id', authRole('mudur', 'ogretmen', 'pardus'), (req, res) => {
  const item = findSharedFile(req.params.id);
  if (!item) return res.status(404).json({ error: 'Dosya yok' });
  const fp = path.join(UPLOAD_BASE, 'shared', item.name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Dosya yok' });
  res.sendFile(fp);
});

app.delete('/api/files/:id', authRole('mudur', 'ogretmen', 'pardus'), (req, res) => {
  const target = sharedFiles.find(f => String(f.id) === String(req.params.id));
  if (!target) return res.json({ success: true });

  function collectDescendants(folderId) {
    const direct = sharedFiles.filter(f => pid(f.parentId) === String(folderId));
    let all = [...direct];
    direct.forEach(d => { if (d.type === 'folder') all = all.concat(collectDescendants(d.id)); });
    return all;
  }

  const toDelete = target.type === 'folder' ? [target, ...collectDescendants(target.id)] : [target];
  toDelete.forEach(item => {
    if (item.type === 'file') {
      const fp = path.join(UPLOAD_BASE, 'shared', item.name);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
  });
  const ids = new Set(toDelete.map(i => String(i.id)));
  sharedFiles = sharedFiles.filter(f => !ids.has(String(f.id)));
  res.json({ success: true });
});

// ─── KULLANICI LİSTESİ ────────────────────────────────────────────
app.get('/api/users', auth, (req, res) => {
  const me = req.session.user;
  let list = users.filter(u => u.username !== me.username);
  if (me.role === 'ogrenci') list = list.filter(u => u.role !== 'mudur' && u.role !== 'pardus');
  res.json(list.map(u => ({ username: u.username, name: u.name, role: u.role, classRoom: u.classRoom || null, no: u.no || null })));
});

// ─── DOSYA TRANSFERİ ──────────────────────────────────────────────
app.post('/api/transfer/send', auth, transferUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya seçilmedi' });
  const { to, note } = req.body;
  const recipient = users.find(u => u.username === to);
  if (!recipient) return res.status(400).json({ error: 'Alıcı bulunamadı' });
  const sender = req.session.user;
  const t = {
    id:           Date.now(),
    from:         sender.username,
    fromName:     sender.name,
    fromRole:     sender.role,
    fromClassRoom: sender.classRoom || null,
    fromNo:       sender.no || null,
    to,
    filename:     req.file.filename,
    originalName: req.file.originalname,
    note:         note?.trim() || '',
    size:         formatSize(req.file.size),
    date:         new Date().toLocaleString('tr-TR'),
    read:         false
  };
  transfers.push(t);
  pushEvent(to, 'new_transfer', t);
  res.json({ success: true });
});

app.get('/api/transfer/inbox', auth, (req, res) => {
  const mine = transfers.filter(t => t.to === req.session.user.username);
  res.json([...mine].reverse());
});

app.get('/api/transfer/unread-count', auth, (req, res) => {
  const count = transfers.filter(t => t.to === req.session.user.username && !t.read).length;
  res.json({ count });
});

app.post('/api/transfer/mark-read', auth, (req, res) => {
  transfers.forEach(t => { if (t.to === req.session.user.username) t.read = true; });
  res.json({ success: true });
});

app.get('/api/transfer/download/:filename', auth, (req, res) => {
  const filename = path.basename(req.params.filename);
  const t = transfers.find(x => x.filename === filename && x.to === req.session.user.username);
  if (!t) return res.status(403).json({ error: 'Yetkisiz' });
  const fp = path.join(UPLOAD_BASE, 'transfers', filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Dosya yok' });
  res.download(fp, t.originalName);
});

// ─── ÖDEV BÖLÜMÜ (sınıf bazlı akış) ───────────────────────────────
// Erişim: sadece öğretmen, öğrenci, müdür/pardus DEĞİL (istek: sadece
// öğretmen ve öğrenciler erişebilsin).
const authHomework = authRole('ogretmen', 'ogrenci');

// Öğretmenin görebileceği sınıf listesi (tüm sınıflar) / öğrencinin
// görebileceği tek sınıf (kendi sınıfı).
app.get('/api/homework/classes', authHomework, (req, res) => {
  if (req.session.user.role === 'ogretmen') return res.json(CLASSES);
  return res.json(req.session.user.classRoom ? [req.session.user.classRoom] : []);
});

function canAccessClass(user, classRoom) {
  if (user.role === 'ogretmen') return CLASSES.includes(classRoom);
  if (user.role === 'ogrenci') return user.classRoom === classRoom;
  return false;
}

app.get('/api/homework/feed', authHomework, (req, res) => {
  const classRoom = String(req.query.classRoom || '');
  if (!canAccessClass(req.session.user, classRoom)) return res.status(403).json({ error: 'Bu sınıfa erişiminiz yok' });
  const items = homeworkPosts.filter(p => p.classRoom === classRoom);
  res.json([...items].reverse());
});

app.post('/api/homework/send', authHomework, homeworkUpload.single('file'), (req, res) => {
  const { classRoom, note } = req.body;
  if (!canAccessClass(req.session.user, classRoom)) return res.status(403).json({ error: 'Bu sınıfa erişiminiz yok' });
  if (!req.file && !note?.trim()) return res.status(400).json({ error: 'Dosya veya mesaj girin' });
  const sender = req.session.user;
  const post = {
    id: Date.now(),
    classRoom,
    fromUsername: sender.username,
    fromName: sender.name,
    fromRole: sender.role,
    fromClassRoom: sender.classRoom || null,
    fromNo: sender.no || null,
    note: note?.trim() || '',
    filename: req.file ? req.file.filename : null,
    originalName: req.file ? req.file.originalname : null,
    size: req.file ? formatSize(req.file.size) : null,
    date: new Date().toLocaleString('tr-TR')
  };
  homeworkPosts.push(post);

  // Bu sınıftaki tüm ilgili kullanıcılara SSE bildirim gönder
  // (sınıftaki öğrenciler + tüm öğretmenler).
  users.forEach(u => {
    if (u.username === sender.username) return;
    const interested = (u.role === 'ogretmen') || (u.role === 'ogrenci' && u.classRoom === classRoom);
    if (interested) pushEvent(u.username, 'new_homework', post);
  });

  res.json(post);
});

app.get('/api/homework/preview/:filename', authHomework, (req, res) => {
  const filename = path.basename(req.params.filename);
  const post = homeworkPosts.find(p => p.filename === filename);
  if (!post || !canAccessClass(req.session.user, post.classRoom)) return res.status(404).json({ error: 'Bulunamadı' });
  const fp = path.join(UPLOAD_BASE, 'homework', filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Dosya yok' });
  res.sendFile(fp);
});

app.get('/api/homework/download/:filename', authHomework, (req, res) => {
  const filename = path.basename(req.params.filename);
  const post = homeworkPosts.find(p => p.filename === filename);
  if (!post || !canAccessClass(req.session.user, post.classRoom)) return res.status(404).json({ error: 'Bulunamadı' });
  const fp = path.join(UPLOAD_BASE, 'homework', filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Dosya yok' });
  res.download(fp, post.originalName);
});

// Okunmamış ödev/sınıf-mesajı rozeti: öğrenci için kendi sınıfı,
// öğretmen için tüm sınıflardaki toplam okunmamış sayısı.
app.get('/api/homework/unread-count', authHomework, (req, res) => {
  const user = req.session.user;
  const seenMap = lastSeenHomework[user.username] || {};
  let classRooms = user.role === 'ogretmen' ? CLASSES : (user.classRoom ? [user.classRoom] : []);
  let count = 0;
  classRooms.forEach(c => {
    const seen = seenMap[c] || 0;
    count += homeworkPosts.filter(p => p.classRoom === c && p.id > seen && p.fromUsername !== user.username).length;
  });
  res.json({ count });
});

app.post('/api/homework/mark-read', authHomework, (req, res) => {
  const { classRoom } = req.body;
  const user = req.session.user;
  if (!canAccessClass(user, classRoom)) return res.status(403).json({ error: 'Bu sınıfa erişiminiz yok' });
  if (!lastSeenHomework[user.username]) lastSeenHomework[user.username] = {};
  const classPosts = homeworkPosts.filter(p => p.classRoom === classRoom);
  lastSeenHomework[user.username][classRoom] = classPosts.length ? Math.max(...classPosts.map(p => p.id)) : 0;
  res.json({ success: true });
});

// ─── ÖDEV ÇİZELGESİ (sadece öğretmen) ──────────────────────────────
app.get('/api/homework-sheet/:classRoom', authRole('ogretmen'), (req, res) => {
  const classRoom = req.params.classRoom;
  if (!CLASSES.includes(classRoom)) return res.status(404).json({ error: 'Sınıf yok' });
  const students = users
    .filter(u => u.role === 'ogrenci' && u.classRoom === classRoom)
    .sort((a, b) => (a.no || '').localeCompare(b.no || '', 'tr', { numeric: true }))
    .map(u => ({ username: u.username, name: u.name, no: u.no || '' }));
  const sheet = homeworkSheets[classRoom] || { columns: 5, marks: {}, updatedAt: null };
  res.json({ classRoom, students, columns: sheet.columns, marks: sheet.marks, updatedAt: sheet.updatedAt });
});

app.post('/api/homework-sheet/:classRoom', authRole('ogretmen'), (req, res) => {
  const classRoom = req.params.classRoom;
  if (!CLASSES.includes(classRoom)) return res.status(404).json({ error: 'Sınıf yok' });
  const { columns, marks } = req.body;
  homeworkSheets[classRoom] = {
    columns: Number(columns) || 5,
    marks: marks || {},
    updatedAt: new Date().toLocaleString('tr-TR')
  };
  res.json({ success: true, updatedAt: homeworkSheets[classRoom].updatedAt });
});

// ─── YARDIMCI ────────────────────────────────────────────────────
function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ─── SUNUCU BAŞLAT ────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('==========================================================');
  console.log('              PARDUS ES — Çalışıyor');
  console.log('==========================================================');
  console.log(`  Yerel Erişim  →  http://localhost:${PORT}`);
  console.log(`  Ağ Erişimi    →  http://${LOCAL_IP}:${PORT}`);
  console.log('----------------------------------------------------------');
  console.log('  HESAPLAR (giriş TC kimlik no ile yapılır, şifre: 123)');
  console.log('----------------------------------------------------------');
  users.forEach(u => {
    const extra = u.role === 'ogrenci' ? ` (${u.classRoom} No:${u.no})` : '';
    console.log(`  ${roleLabelConsole(u.role)} — ${u.name}${extra}`);
    console.log(`    TC Kimlik No: ${u.username}   Şifre: 123`);
  });
  console.log('==========================================================');
  console.log('');
  console.log(`  📱 Telefon/Tablet için bu adresi tarayıcıya yazın:`);
  console.log(`     http://${LOCAL_IP}:${PORT}`);
  console.log('');
});

function roleLabelConsole(role) {
  return { mudur: 'Müdür', ogretmen: 'Öğretmen', ogrenci: 'Öğrenci', pardus: 'Pardus Admin' }[role] || role;
}
