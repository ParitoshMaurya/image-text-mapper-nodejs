const express = require('express');
const multer = require('multer');
const html2canvas = require('html2canvas');
const { createCanvas, loadImage } = require('canvas');
const app = express();

// Configure multer for handling file uploads
const upload = multer({ dest: 'uploads/' });

// Define the API endpoint for image editing
app.post('/edit-image', upload.single('image'), async (req, res) => {
    
    try {
    const { text, top, left, color = 'red', fontSize = '24' } = req.body;
    const imagePath = req.file.path;
    const image = await loadImage(imagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');

    // Draw the image onto the canvas
    ctx.drawImage(image, 0, 0);

    // Draw the text onto the canvas
    ctx.font = `${fontSize}px Arial`;
    ctx.fillStyle = color;
    ctx.fillText(text, left, top);

    // Convert the canvas to a base64-encoded PNG image
    const editedImage = canvas.toDataURL('image/png');

    // Respond with the edited image
    res.json(editedImage);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred during image editing' });
  }
});

// Start the server
app.listen(3005, () => {
  console.log('Server is running on port 3005');
});
