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

const sendMessageService = (mobileNumber, urlToSend) => {
  let data = JSON.stringify({
    "@VER": "1.2",
    "USER": {
      "@UNIXTIMESTAMP": ""
    },
    "DLR": {
      "@URL": ""
    },
    "SMS": [
      {
        "@UDH": "0",
        "@CODING": "1",
        "@TEXT": "",
        "@TEMPLATEINFO": "1022527201~for account number XXXX89",
        "@MEDIADATA": urlToSend,
        "@MSGTYPE": "3",
        "@TYPE": "image",
        "@PROPERTY": "0",
        "@ID": "1",
        "ADDRESS": [
          {
            "@FROM": "917428306034",
            "@TO": `91${mobileNumber}`,
            "@SEQ": "1",
            "@TAG": "some clientside random data"
          }
        ]
      }
    ]
  });

  let config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: 'https://api.myvaluefirst.com/psms/servlet/psms.JsonEservice',
    headers: {
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczovL2FwaS5teXZhbHVlZmlyc3QuY29tL3BzbXMiLCJzdWIiOiJkZW1vd2FiYXMiLCJleHAiOjE4MjAyMzY0NDd9.Waxaq8D7ZkeH28oor-HJJMkG5KMwolySC9JpWnfmadQ',
      'Content-Type': 'application/json'
    },
    data: data
  };

  return axios.request(config);
}

const columnPositionMapper = {
  3: { top: 295, left: 93},
  4: { top: 295, left: 218},
  5: { top: 315, left: 93},
  6: { top: 315, left: 218},
  7: { top: 342, left: 93},
  8: { top: 342, left: 218},
  9: { top: 361, left: 93},
  10: { top: 361, left: 218},
  11: { top: 387, left: 93},
  12: { top: 387, left: 218},
  13: { top: 409, left: 93},
  14: { top: 409, left: 218},
  15: { top: 432, left: 93},
  16: { top: 432, left: 218},
  17: { top: 454, left: 93},
  18: { top: 454, left: 218},
  19: { top: 476, left: 93},
  20: { top: 476, left: 218},
}

const uploadToB2Promise = (editedImage, keyName, mobileNumber) => new Promise(async (res, rej) => {
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
    await sendMessageService(mobileNumber, imageUrl);
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
          ctx.fillText(cellValue, `${columnPositionMapper[+colNumber].left}`, `${columnPositionMapper[+colNumber].top}`);
        }
      });
      const editedImage = canvas.toDataURL('image/png');
      const keyName = `${mobileNumber}-${Date.now()}-updatedImage.png`;
      promiseToResolve.push(uploadToB2Promise(editedImage, keyName, mobileNumber));
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
