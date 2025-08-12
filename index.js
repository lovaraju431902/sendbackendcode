
// import express from 'express';
// import multer from 'multer';
// import cors from 'cors';
// import { nanoid } from 'nanoid';
// import dotenv from 'dotenv';
// import { v2 as cloudinary } from 'cloudinary';
// import fs from 'fs';
// import path from 'path';
// import { fileURLToPath } from 'url';
// import cron from 'node-cron';

// // Setup
// dotenv.config();
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// const app = express();
// const PORT = process.env.PORT || 5000;
// const DATA_FILE = path.join(__dirname, 'shares.json');

// // Cloudinary config
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

// // Middleware
// app.use(cors());
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // Multer setup for 20MB max file size
// const upload = multer({
//   dest: 'temp_uploads/',
//   limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
// });

// // Load existing shares from file
// let shareMap = new Map();
// if (fs.existsSync(DATA_FILE)) {
//   try {
//     const raw = fs.readFileSync(DATA_FILE);
//     const obj = JSON.parse(raw);
//     shareMap = new Map(Object.entries(obj));
//   } catch (err) {
//     console.error('Error loading shares.json:', err);
//   }
// }

// // Save shares to file
// function saveShares() {
//   fs.writeFileSync(DATA_FILE, JSON.stringify(Object.fromEntries(shareMap), null, 2));
// }

// // Upload route
// app.post('/upload', upload.array('files'), async (req, res) => {
//   const code = nanoid(6);
//   const expiresAt = Date.now() + 0.5 * 60 * 1000; // 5 minutes
//   const uploadedFiles = [];

//   try {
//     // Upload files to Cloudinary
//     if (req.files && req.files.length > 0) {
//       for (const file of req.files) {
//         const uploadRes = await cloudinary.uploader.upload(file.path, {
//           resource_type: 'auto',
//           folder: 'share-temp',
//         });

//         uploadedFiles.push({
//           url: uploadRes.secure_url,
//           publicId: uploadRes.public_id, // includes folder name
//           type: uploadRes.resource_type, // image, video, raw
//         });

//         fs.unlinkSync(file.path); // delete temp file
//       }
//     }

//     const text = req.body.text || '';

//     if (uploadedFiles.length > 0 || text.trim() !== '') {
//       shareMap.set(code, { files: uploadedFiles, text, expiresAt });
//       saveShares();
//       res.json({ code, expiresAt });
//     } else {
//       res.status(400).json({ error: 'No files or text provided' });
//     }
//   } catch (error) {
//     console.error('Upload failed:', error);
//     res.status(500).json({ error: 'Upload failed' });
//   }
// });

// // Retrieve share by code
// app.get('/share/:code', (req, res) => {
//   const code = req.params.code;
//   const data = shareMap.get(code);

//   if (!data) {
//     return res.status(404).json({ error: 'Not found or expired' });
//   }

//   if (Date.now() > data.expiresAt) {
//     shareMap.delete(code);
//     saveShares();
//     return res.status(410).json({ error: 'Expired' });
//   }

//   res.json({
//     files: data.files.map(f => f.url),
//     text: data.text,
//     expiresAt: data.expiresAt,
//   });
// });

// // Delete expired shares from memory & Cloudinary
// cron.schedule('* * * * *', async () => {
//   const now = Date.now();
//   let changed = false;

//   for (const [code, entry] of shareMap.entries()) {
//     if (now > entry.expiresAt) {
//       try {
//         if (entry.files && entry.files.length > 0) {
//           for (const file of entry.files) {
//             console.log(`Trying to delete: ${file.publicId} (${file.type})`);
//             try {
//               const res = await cloudinary.api.delete_resources([file.publicId], {
//                 resource_type: file.type,
//               });
//               console.log('Cloudinary response:', res.deleted);
//             } catch (err) {
//               console.error(`Error deleting ${file.publicId}:`, err);
//             }
//           }
//         }
//       } catch (e) {
//         console.error(`Error deleting Cloudinary files:`, e);
//       }
//       shareMap.delete(code);
//       changed = true;
//       console.log(`Cleaned expired: ${code}`);
//     }
//   }

//   if (changed) saveShares();
// });

// // Start server
// app.listen(PORT, () => {
//   console.log(`🚀 Server running at http://localhost:${PORT}`);
// });




import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { nanoid } from 'nanoid';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

// Setup
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 5000;

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer setup for 20MB max file size
const upload = multer({
  dest: 'temp_uploads/',
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// Map to track shares
const shareMap = new Map(); // code -> { urls, publicIds, text, expiresAt }

// Upload route
app.post('/upload', upload.array('files'), async (req, res) => {
  const code = nanoid(6);
  const expiresAt = Date.now() + 5  * 60 * 1000; // 10 minutes
  const uploadedUrls = [];
  const publicIds = [];

  try {
    // Upload files to Cloudinary if present
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadRes = await cloudinary.uploader.upload(file.path, {
          resource_type: 'auto',
          folder: 'share-temp',
        });
        uploadedUrls.push(uploadRes.secure_url);
        publicIds.push(uploadRes.public_id);
        fs.unlinkSync(file.path); // delete temp file
      }
    }

    const text = req.body.text || '';

    // Only save if there's at least text or files
    if (uploadedUrls.length > 0 || text.trim() !== '') {
      shareMap.set(code, { urls: uploadedUrls, publicIds, text, expiresAt });
      res.json({ code, expiresAt });
    } else {
      res.status(400).json({ error: 'No files or text provided' });
    }

  } catch (error) {
    console.error('Upload failed:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Retrieve share by code
app.get('/share/:code', (req, res) => {
  const code = req.params.code;
  const data = shareMap.get(code);

  if (!data) {
    return res.status(404).json({ error: 'Not found or expired' });
  }

  if (Date.now() > data.expiresAt) {
    shareMap.delete(code);
    return res.status(410).json({ error: 'Expired' });
  }

  res.json({
    files: data.urls,
    text: data.text,
    expiresAt: data.expiresAt,
  });
});

// Delete expired shares from memory & Cloudinary
cron.schedule('* * * * *', async () => {
  const now = Date.now();
  for (const [code, entry] of shareMap.entries()) {
    if (now > entry.expiresAt) {
      try {
        if (entry.publicIds && entry.publicIds.length > 0) {
          await cloudinary.api.delete_resources(entry.publicIds);
          console.log(`Deleted from Cloudinary: ${entry.publicIds}`);
        }
      } catch (e) {
        console.error("Error deleting Cloudinary files:", e);
      }
      shareMap.delete(code);
      console.log(`Cleaned expired : ${code}`);
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});