// // index.js
// import express from 'express';
// import multer from 'multer';
// import cors from 'cors';
// import dotenv from 'dotenv';
// import { nanoid } from 'nanoid';
// import fs from 'fs';
// import path from 'path';
// import { fileURLToPath } from 'url';
// import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
// import Redis from 'ioredis';

// // Init
// dotenv.config();
// const app = express();
// const PORT = process.env.PORT || 5000;
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// const redis = new Redis(); // Defaults to localhost:6379

// // R2 Setup (S3 compatible)
// const r2 = new S3Client({
//   region: 'auto',
//   endpoint: process.env.R2_ENDPOINT,
//   credentials: {
//     accessKeyId: process.env.R2_ACCESS_KEY,
//     secretAccessKey: process.env.R2_SECRET_KEY,
//   },
// });
// const BUCKET = process.env.R2_BUCKET;

// // Middleware
// app.use(cors());
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // Multer for temp storage
// const upload = multer({
//   dest: 'temp_uploads/',
//   limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
// });

// // Upload Route
// app.post('/upload', upload.array('files'), async (req, res) => {
//   const code = nanoid(6);
//   const expiresIn = 600; // seconds (10 mins)
//   const uploadedUrls = [];
//   const r2Keys = [];

//   try {
//     if (req.files && req.files.length > 0) {
//       for (const file of req.files) {
//         const fileStream = fs.createReadStream(file.path);
//         const r2Key = `${Date.now()}-${file.originalname}`;

//         await r2.send(new PutObjectCommand({
//           Bucket: BUCKET,
//           Key: r2Key,
//           Body: fileStream,
//           ContentType: file.mimetype,
//         }));

//         const url = `${process.env.R2_PUBLIC_BASE}/${r2Key}`;
//         uploadedUrls.push(url);
//         r2Keys.push(r2Key);
//         fs.unlinkSync(file.path);
//       }
//     }

//     const text = req.body.text || '';

//     if (uploadedUrls.length === 0 && text.trim() === '') {
//       return res.status(400).json({ error: 'No files or text provided' });
//     }

//     // Save to Redis with expiry
//     await redis.setex(
//       code,
//       expiresIn,
//       JSON.stringify({ files: uploadedUrls, keys: r2Keys, text })
//     );

//     res.json({ code, expiresIn });
//   } catch (err) {
//     console.error('Upload error:', err);
//     res.status(500).json({ error: 'Upload failed' });
//   }
// });

// // Access Route
// app.get('/share/:code', async (req, res) => {
//   const data = await redis.get(req.params.code);

//   if (!data) {
//     return res.status(404).json({ error: 'Code not found or expired' });
//   }

//   const parsed = JSON.parse(data);
//   res.json({ files: parsed.files, text: parsed.text });
// });

// // Optional Cleanup (for immediate delete if needed)
// app.delete('/delete/:code', async (req, res) => {
//   const data = await redis.get(req.params.code);
//   if (!data) return res.status(404).json({ error: 'Not found' });

//   const parsed = JSON.parse(data);
//   for (const key of parsed.keys) {
//     try {
//       await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
//     } catch (e) {
//       console.warn('Error deleting from R2:', key, e.message);
//     }
//   }

//   await redis.del(req.params.code);
//   res.json({ success: true });
// });

// // Start Server
// app.listen(PORT, () => {
//   console.log(`Server running at http://localhost:${PORT}`);
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
        console.error(`Error deleting Cloudinary files:`, e);
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

