const express = require('express');
const multer = require('multer');
const { createCanvas, loadImage } = require('canvas');
const exceljs = require('exceljs');
const axios = require('axios');
const B2 = require('backblaze-b2');
const app = express();

// Configure Backblaze B2
const b2 = new B2({
  applicationKeyId: '005279ffd1f1c020000000001',
  applicationKey: 'K005wphpHPf5ld7iZWq/DYxUT6xsE0A',
});

// Configure multer for handling file uploads
const upload = multer({ dest: 'uploads/' });

const TEMPLATE_IMAGE = "https://developer-test-bucket-12.s3.eu-north-1.amazonaws.com/BaseImage.jpeg";

const uploadToB2Promise = (editedImage, keyName) => new Promise(async (res, rej) => {
  try {
    // Upload the edited image to Backblaze B2
    const bucketName = 'test-developer-12';
    const fileName = keyName; // The name you want for the uploaded file
    await b2.authorize(); // must authorize first (authorization lasts 24 hrs)
    const fileContents = Buffer.from(editedImage.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    const bucketData = await b2.getUploadUrl({
      bucketId: '22a7e9cf1f4d51cf81ac0012'
      // ...common arguments (optional)
    });

    const b2resp = await b2.uploadFile({
      bucketId: bucketData.data.bucketId,
      fileName,
      data: fileContents,
      uploadUrl: bucketData.data.uploadUrl,
      uploadAuthToken: bucketData.data.authorizationToken
    });

    // Generate the URL for the uploaded image
    const imageUrl = `https://f005.backblazeb2.com/file/${bucketName}/${fileName}`;
    console.log(imageUrl, 'Done uploaded');
    res(imageUrl);
  } catch (err) {
    rej(err);
  }
});

// Define the API endpoint for image editing
app.post('/edit-image', upload.single('image'), async (req, res) => {

  try {
    const { color = 'red', fontSize = '24', XLS = "" } = req.body;
    const imagePath = TEMPLATE_IMAGE;
    const image = await loadImage(imagePath);


    // Read Excel file from the provided link
    const excelLink = XLS;
    const response = await axios.get(excelLink, { responseType: 'arraybuffer' });
    const excelData = Buffer.from(response.data);
    const workbook = new exceljs.Workbook();
    await workbook.xlsx.load(excelData);
    // Process Excel data here (e.g., iterate through rows and columns)
    const worksheet = workbook.getWorksheet(1); // Assuming you want to work with the first worksheet

    const promiseToResolve = [];
    // Iterate through rows
    worksheet.eachRow(async (row, rowNumber) => {
      // Iterate through columns in each row
      let mobileNumber;
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');

      // Draw the image onto the canvas
      ctx.drawImage(image, 0, 0);

      // Draw the text onto the canvas
      ctx.font = `${fontSize}px Arial`;
      ctx.fillStyle = color;
      if (rowNumber == 1) return;
      row.eachCell((cell, colNumber) => {
        const cellValue = cell.value;
        const left = 90;
        const top = 350 + (colNumber * 20);
        if (rowNumber > 1) { // means excluding header row
          if (colNumber === 1) { // Mobile number column
            mobileNumber = cellValue;
          } 
        }
        if (rowNumber > 1 && colNumber > 2) {
          ctx.fillText(cellValue, `${left}`, `${top}`);
        }
      });
      const editedImage = canvas.toDataURL('image/png');
      const keyName = `${mobileNumber}-${Date.now()}-updatedImage.png`;
      promiseToResolve.push(uploadToB2Promise(editedImage, keyName));
    });
    // upload to S3
    const data = await Promise.all(promiseToResolve);
    // Respond with the edited image
    res.json({
      data
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred during image editing' });
  }
});

// Start the server
app.listen(3005, () => {
  console.log('Server is running on port 3005');
});
