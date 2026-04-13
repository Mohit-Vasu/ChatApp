const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { PendingDeletion } = require('../db');

const router = express.Router();

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer memory storage configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max limit
  }
});

function uploadToCloudinary(file) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: 'auto' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });
}

router.post(
  '/upload',
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'files', maxCount: 10 }
  ]),
  async (req, res) => {
    const files = [];
    if (req.files?.file?.length) files.push(...req.files.file);
    if (req.files?.files?.length) files.push(...req.files.files);

    if (files.length === 0) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const deleteAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const uploaded = await Promise.all(
        files.map(async (file) => {
          const result = await uploadToCloudinary(file);
          const fileType = result.resource_type === 'image' ? 'image' : 'document';

          if (result.public_id && result.resource_type) {
            try {
              await PendingDeletion.findOneAndUpdate(
                { publicId: result.public_id, resourceType: result.resource_type },
                { $setOnInsert: { publicId: result.public_id, resourceType: result.resource_type, deleteAt } },
                { upsert: true, returnDocument: 'after' }
              );
            } catch (e) {}
          }

          return {
            url: result.secure_url,
            fileType,
            fileName: file.originalname,
            publicId: result.public_id,
            resourceType: result.resource_type
          };
        })
      );

      res.json({ files: uploaded });
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      res.status(500).json({ error: 'File upload failed' });
    }
  }
);

// Error handling for multer limits
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File is too large. Max limit is 10MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
