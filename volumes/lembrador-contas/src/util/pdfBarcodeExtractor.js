const { PDFBarcodeJs } = require('pdf-barcode');

var configs = {
    "scale": {
        "once": true,
        "value": 3,
        "start": 3,
        "step": 0.6,
        "stop": 4.8
    },
    "resultOpts": {
        "singleCodeInPage": true,
        "multiCodesInPage": false,
        "maxCodesInPage": 1
    },
    "patches": [
        "x-small",
        "small",
        "medium"
    ],
    "improve": true,
    "noisify": true,
    "quagga": {
        "inputStream": {},
        "locator": {
            "halfSample": false
        },
        "decoder": {
            "readers": [
                "i2of5_reader"
            ],
            "multiple": true
        },
        "locate": true
    }
}


async function extractBarcodeFromPDF(filePath) {
    return new Promise((resolve, reject) => {
        const file_path = new URL(`file:///${filePath}`).href;

        var callback =  function(result) {
            if (result.success) {
                console.log(result.codes)
                resolve(result.codes)
            } else {
                console.log(result.message)
                reject(result.message)
            }
        }
        let pageNumber = 1
        PDFBarcodeJs.decodeSinglePage(file_path, pageNumber, configs, callback);
    })
}

module.exports = { extractBarcodeFromPDF }